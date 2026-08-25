package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// The signed-in user and everything hanging off them: profile (A3.1),
// character (A14.2), dream list (A15.2), stats and calendar (A17.x).
func (s *Server) registerUserRoutes(g *echo.Group) {
	g.GET("/characters", s.handleListCharacters)

	me := g.Group("/users/me", s.JwtMiddleware)
	me.PATCH("", s.handleUpdateMe)
	me.GET("/stats", s.handleMyStats)
	me.GET("/points", s.handleMyPoints)
	// Points out and money owed (A12.10 / A12.11) — both belong to a person.
	s.registerRewardRoutes(me)
	s.registerInboxRoutes(me) // A9.2 — the inbox belongs to a person, not a trip
	me.GET("/trips/upcoming", s.handleUpcomingTrips)
	me.GET("/trips/past", s.handlePastTrips)
	// Bill & payment (A20.x) — receipts belong to the user, not to a trip.
	s.registerBillingRoutes(me.Group("/billing"))

	me.GET("/dreams", s.handleListDreams)
	me.POST("/dreams", s.handleCreateDream)
	me.PATCH("/dreams/:dreamId", s.handleUpdateDream)
	me.DELETE("/dreams/:dreamId", s.handleDeleteDream)

	// Invites live here because accepting one is done by a user, not by a
	// member of the trip they are about to join.
	s.registerInviteRoutes(g)
}

func (s *Server) handleListCharacters(c echo.Context) error {
	characters, err := s.characters.List(c.Request().Context())
	if err != nil {
		return request.Internal(c, "โหลดตัวละครไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, characters)
}

type updateMeRequest struct {
	DisplayName  *string `json:"display_name"`
	Handle       *string `json:"handle"`
	CharacterID  *string `json:"character_id"`
	HomeCurrency *string `json:"home_currency"`
}

func (s *Server) handleUpdateMe(c echo.Context) error {
	var req updateMeRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	user, err := s.users.GetByID(ctx, request.UserID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบผู้ใช้")
	}

	if req.DisplayName != nil && *req.DisplayName != "" {
		user.DisplayName = *req.DisplayName
	}
	if req.Handle != nil {
		if *req.Handle == "" {
			user.Handle = nil
		} else {
			// A handle is public and unique; taking someone else's silently
			// would be worse than refusing.
			if existing, err := s.users.GetByHandle(ctx, *req.Handle); err == nil && existing.ID != user.ID {
				return request.BadRequest(c, "ชื่อผู้ใช้นี้มีคนใช้แล้ว")
			}
			user.Handle = req.Handle
		}
	}
	if req.CharacterID != nil {
		user.CharacterID = req.CharacterID
	}
	if req.HomeCurrency != nil && *req.HomeCurrency != "" {
		user.HomeCurrency = *req.HomeCurrency
	}

	if err := s.users.Update(ctx, user); err != nil {
		return request.Internal(c, "บันทึกโปรไฟล์ไม่สำเร็จ")
	}

	balance, _ := s.points.Balance(ctx, user.ID)
	return c.JSON(http.StatusOK, toMeDTO(*user, balance))
}

func (s *Server) handleMyPoints(c echo.Context) error {
	ctx := c.Request().Context()
	entries, err := s.points.List(ctx, request.UserID(c), 30)
	if err != nil {
		return request.Internal(c, "โหลดประวัติแต้มไม่สำเร็จ")
	}
	balance, _ := s.points.Balance(ctx, request.UserID(c))

	return c.JSON(http.StatusOK, map[string]any{
		"balance": balance,
		"entries": entries,
	})
}

/* ----------------------------------------------------------------- trips -- */

// handleUpcomingTrips powers the home dashboard's countdown (A17.2).
func (s *Server) handleUpcomingTrips(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trips, _, err := s.trips.ListForUser(ctx, userID, 50, 0)
	if err != nil {
		return request.Internal(c, "โหลดทริปไม่สำเร็จ")
	}

	today := domain.Day(time.Now().UTC())
	out := make([]calendarTripDTO, 0, len(trips))

	for _, trip := range trips {
		if trip.StartDate == nil || trip.EndDate == nil || trip.EndDate.Before(today) {
			continue
		}

		roster, _ := s.loadMembers(ctx, trip.ID)
		dto := calendarTripDTO{
			ID:                 trip.ID,
			Title:              trip.Title,
			Cities:             citiesOf(trip),
			StartDate:          trip.StartDate.Format("2006-01-02"),
			EndDate:            trip.EndDate.Format("2006-01-02"),
			DaysUntil:          domain.DaysBetween(today, *trip.StartDate) - 1,
			CoverImageURL:      trip.CoverImageURL,
			MemberIDs:          roster.ids(),
			MemberCharacterIDs: roster.characterIDs(),
		}

		// The first day's forecast doubles as the trip's weather chip.
		if days, err := s.plans.ListDays(ctx, trip.ID); err == nil && len(days) > 0 {
			d := days[0]
			if d.WeatherHigh != nil {
				dto.WeatherHigh = d.WeatherHigh
				dto.WeatherLow = d.WeatherLow
				dto.WeatherIcon = strPtr(d.WeatherIcon)
				dto.WeatherText = strPtr(d.WeatherText)
			}
		}
		out = append(out, dto)
	}

	sort.SliceStable(out, func(a, b int) bool { return out[a].StartDate < out[b].StartDate })
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handlePastTrips(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trips, _, err := s.trips.ListForUser(ctx, userID, 50, 0)
	if err != nil {
		return request.Internal(c, "โหลดทริปไม่สำเร็จ")
	}

	today := domain.Day(time.Now().UTC())
	out := make([]pastTripDTO, 0)

	for _, trip := range trips {
		if trip.EndDate == nil || !trip.EndDate.Before(today) {
			continue
		}

		roster, _ := s.loadMembers(ctx, trip.ID)
		items, _ := s.plans.ListItems(ctx, trip.ID)

		spent := 0.0
		if entries, err := s.expenses.ListByTrip(ctx, trip.ID); err == nil {
			rate := tripFxRate(trip)
			for _, e := range entries {
				if e.Currency == "THB" {
					spent += e.Amount
					continue
				}
				spent += domain.ToHomeCurrency(e.Amount, rate)
			}
		}

		days := 0
		if trip.StartDate != nil {
			days = domain.DaysBetween(*trip.StartDate, *trip.EndDate)
		}

		out = append(out, pastTripDTO{
			ID:                 trip.ID,
			Title:              trip.Title,
			Cities:             citiesOf(trip),
			DateLabel:          dateLabel(trip),
			EndDate:            trip.EndDate.Format("2006-01-02"),
			Days:               days,
			Places:             len(items),
			SpentTHB:           spent,
			CoverImageURL:      trip.CoverImageURL,
			MemberIDs:          roster.ids(),
			MemberCharacterIDs: roster.characterIDs(),
			Visibility:         trip.Visibility,
			PublicSlug:         trip.Slug,
		})
	}

	sort.SliceStable(out, func(a, b int) bool { return out[a].EndDate > out[b].EndDate })
	return c.JSON(http.StatusOK, out)
}

// handleMyStats aggregates the year (A17.1). Everything is derived from trips
// and expenses — there is no counter to keep in sync.
func (s *Server) handleMyStats(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trips, _, err := s.trips.ListForUser(ctx, userID, 200, 0)
	if err != nil {
		return request.Internal(c, "โหลดสถิติไม่สำเร็จ")
	}

	now := time.Now().UTC()
	stats := yearStatsDTO{Year: now.Year() + 543, MonthlyDays: make([]int, 12)}
	countries := map[string]bool{}

	for _, trip := range trips {
		if trip.StartDate == nil || trip.EndDate == nil {
			continue
		}
		if trip.StartDate.Year() != now.Year() {
			continue
		}
		// Only finished travel counts: a plan is not a memory.
		if trip.EndDate.After(now) {
			continue
		}

		days := domain.DaysBetween(*trip.StartDate, *trip.EndDate)
		stats.Trips++
		stats.Days += days
		countries[trip.DestinationCountry] = true
		stats.MonthlyDays[int(trip.StartDate.Month())-1] += days

		if items, err := s.plans.ListItems(ctx, trip.ID); err == nil {
			stats.Places += len(items)
		}
		if entries, err := s.expenses.ListByTrip(ctx, trip.ID); err == nil {
			rate := tripFxRate(trip)
			for _, e := range entries {
				if e.PaidBy != userID {
					continue
				}
				if e.Currency == "THB" {
					stats.SpentTHB += e.Amount
					continue
				}
				stats.SpentTHB += domain.ToHomeCurrency(e.Amount, rate)
			}
		}
	}

	stats.Countries = len(countries)
	return c.JSON(http.StatusOK, stats)
}

/* ---------------------------------------------------------------- dreams -- */

func (s *Server) handleListDreams(c echo.Context) error {
	dreams, err := s.dreams.ListByUser(c.Request().Context(), request.UserID(c))
	if err != nil {
		return request.Internal(c, "โหลดรายการที่อยากไปไม่สำเร็จ")
	}
	out := make([]dreamDTO, 0, len(dreams))
	for _, d := range dreams {
		out = append(out, toDreamDTO(d))
	}
	return c.JSON(http.StatusOK, out)
}

type dreamRequest struct {
	Title       string `json:"title" validate:"required"`
	Destination string `json:"destination"`
	Note        string `json:"note"`
	URL         string `json:"url"`
	Accent      string `json:"accent"`
}

func (s *Server) handleCreateDream(c echo.Context) error {
	var req dreamRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	dream := &models.DreamItem{
		UserID:      request.UserID(c),
		Title:       req.Title,
		Destination: req.Destination,
		Note:        req.Note,
		URL:         req.URL,
		Accent:      orDefault(req.Accent, "primary"),
	}
	if err := s.dreams.Create(c.Request().Context(), dream); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return c.JSON(http.StatusCreated, toDreamDTO(*dream))
}

func (s *Server) handleUpdateDream(c echo.Context) error {
	var req dreamRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	userID := request.UserID(c)

	dreams, err := s.dreams.ListByUser(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดรายการไม่สำเร็จ")
	}
	for _, dream := range dreams {
		if dream.ID != c.Param("dreamId") {
			continue
		}
		dream.Title = req.Title
		dream.Destination = req.Destination
		dream.Note = req.Note
		dream.URL = req.URL
		if req.Accent != "" {
			dream.Accent = req.Accent
		}
		if err := s.dreams.Update(ctx, &dream); err != nil {
			return request.Internal(c, "บันทึกไม่สำเร็จ")
		}
		return c.JSON(http.StatusOK, toDreamDTO(dream))
	}
	return request.NotFound(c, "ไม่พบรายการนี้")
}

func (s *Server) handleDeleteDream(c echo.Context) error {
	err := s.dreams.Delete(c.Request().Context(), request.UserID(c), c.Param("dreamId"))
	if err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

/* ------------------------------------------------------------------ util -- */

func citiesOf(trip models.Trip) []string {
	return jsonStrings(toJSONRaw(trip.DestinationCities))
}

func dateLabel(trip models.Trip) string {
	if trip.StartDate == nil || trip.EndDate == nil {
		return ""
	}
	return domain.ThaiRangeLabel(*trip.StartDate, *trip.EndDate) + " " + itoa(trip.StartDate.Year()+543)
}
