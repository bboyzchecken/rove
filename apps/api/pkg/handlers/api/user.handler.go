package api

import (
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

// registerUserRoutes covers everything under /users/me (DEV_SPEC §5.2):
// the profile, the character choice, the dream list, stats, the calendar and
// the points balance.
//
// Every route here is scoped to the authenticated user. There is no
// /users/:id — nothing in Phase 1 needs to read someone else's account.
func (s *Server) registerUserRoutes(g *echo.Group) {
	me := g.Group("/users/me", s.JwtMiddleware)

	me.PATCH("", s.handleUpdateMe)
	me.PATCH("/character", s.handleSetCharacter)
	me.GET("/stats", s.handleUserStats)
	me.GET("/calendar", s.handleUserCalendar)

	me.GET("/dream", s.handleListDreams)
	me.POST("/dream", s.handleCreateDream)
	me.PATCH("/dream/:id", s.handleUpdateDream)
	me.DELETE("/dream/:id", s.handleDeleteDream)
	me.POST("/dream/reorder", s.handleReorderDreams)

	me.GET("/points", s.handleGetPoints)
	me.GET("/points/history", s.handlePointsHistory)
}

// registerCharacterRoutes exposes the seed catalogue (A14.2). It is readable
// without auth so the onboarding picker can render before sign-in completes.
func (s *Server) registerCharacterRoutes(g *echo.Group) {
	g.GET("/characters", s.handleListCharacters)
}

func (s *Server) handleListCharacters(c echo.Context) error {
	characters, err := s.characters.List(c.Request().Context(), true)
	if err != nil {
		return request.Internal(c, "อ่านรายชื่อตัวละครไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": characters})
}

type updateMeRequest struct {
	DisplayName  *string `json:"display_name" validate:"omitempty,min=1,max=120"`
	Handle       *string `json:"handle" validate:"omitempty,min=3,max=60,alphanum"`
	Locale       *string `json:"locale" validate:"omitempty,oneof=th en"`
	HomeCurrency *string `json:"home_currency" validate:"omitempty,len=3"`
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

	if req.DisplayName != nil {
		user.DisplayName = *req.DisplayName
	}
	if req.Locale != nil {
		user.Locale = *req.Locale
	}
	if req.HomeCurrency != nil {
		user.HomeCurrency = strings.ToUpper(*req.HomeCurrency)
	}
	if req.Handle != nil {
		handle := strings.ToLower(*req.Handle)
		// The unique index would reject this anyway, but a 409 with a clear
		// message beats a 500 from a constraint violation.
		if existing, err := s.users.GetByHandle(ctx, handle); err == nil && existing.ID != user.ID {
			return request.Conflict(c, "ชื่อผู้ใช้นี้ถูกใช้แล้ว")
		}
		user.Handle = &handle
	}

	if err := s.users.Update(ctx, user); err != nil {
		return request.Internal(c, "บันทึกโปรไฟล์ไม่สำเร็จ")
	}
	return request.OK(c, user.Public())
}

type setCharacterRequest struct {
	CharacterID int16 `json:"character_id" validate:"required,min=1"`
}

func (s *Server) handleSetCharacter(c echo.Context) error {
	var req setCharacterRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	character, err := s.characters.GetByID(ctx, req.CharacterID)
	if err != nil || !character.IsActive {
		return request.BadRequest(c, "ไม่พบตัวละครนี้")
	}

	if err := s.users.SetCharacter(ctx, request.UserID(c), req.CharacterID); err != nil {
		return request.Internal(c, "บันทึกตัวละครไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"character": character})
}

// handleUserStats aggregates from trips rather than a counter column, so the
// numbers cannot drift out of sync with reality (A17.1).
func (s *Server) handleUserStats(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trips, err := s.trips.ListForStats(ctx, userID)
	if err != nil {
		return request.Internal(c, "อ่านสถิติไม่สำเร็จ")
	}
	spend, _ := s.expenses.TotalHomeForUser(ctx, userID)

	stats := make([]domain.TripStat, 0, len(trips))
	for _, t := range trips {
		stats = append(stats, domain.TripStat{
			ID: t.ID, Country: t.DestinationCountry, Status: t.Status,
			StartDate: t.StartDate, EndDate: t.EndDate,
		})
	}

	return request.OK(c, domain.ComputeStats(stats, spend, time.Now().UTC()))
}

// CalendarEntry is one row of the home calendar strip (W17.3).
type CalendarEntry struct {
	TripID    string     `json:"trip_id"`
	Title     string     `json:"title"`
	StartDate *time.Time `json:"start_date"`
	EndDate   *time.Time `json:"end_date"`
	DaysUntil int        `json:"days_until"`
	Status    string     `json:"status"`
	Weather   string     `json:"weather"`
	Members   int64      `json:"members"`
}

func (s *Server) handleUserCalendar(c echo.Context) error {
	ctx := c.Request().Context()
	now := time.Now().UTC()

	trips, err := s.trips.Upcoming(ctx, request.UserID(c), now, 10)
	if err != nil {
		return request.Internal(c, "อ่านปฏิทินไม่สำเร็จ")
	}

	entries := make([]CalendarEntry, 0, len(trips))
	for _, t := range trips {
		count, _ := s.members.CountByTrip(ctx, t.ID)
		entries = append(entries, CalendarEntry{
			TripID: t.ID, Title: t.Title,
			StartDate: t.StartDate, EndDate: t.EndDate,
			DaysUntil: domain.DaysUntil(t.StartDate, now),
			Status:    t.Status,
			// The forecast only means something inside the horizon; the trip
			// card says nothing rather than showing an invented temperature.
			Weather: s.weatherSnippet(c, t),
			Members: count,
		})
	}
	return request.OK(c, map[string]any{"items": entries})
}

// weatherSnippet is a one-line forecast for the first day of a trip.
func (s *Server) weatherSnippet(c echo.Context, t models.Trip) string {
	if t.StartDate == nil {
		return ""
	}
	blocks, err := s.preps.ListByTrip(c.Request().Context(), t.ID)
	if err != nil {
		return ""
	}
	for _, b := range blocks {
		if b.Type == models.PrepWeather && b.Trigger == "season" {
			return b.ContentMD
		}
	}
	return ""
}

func (s *Server) handleListDreams(c echo.Context) error {
	p := request.BindPagination(c)
	items, total, err := s.dreams.List(c.Request().Context(), request.UserID(c), p.Limit, p.Offset())
	if err != nil {
		return request.Internal(c, "อ่าน dream list ไม่สำเร็จ")
	}
	return request.OK(c, store.NewListResult(items, total, p))
}

type dreamRequest struct {
	Title              string `json:"title" validate:"required,max=200"`
	DestinationCountry string `json:"destination_country" validate:"omitempty,max=80"`
	DestinationCity    string `json:"destination_city" validate:"omitempty,max=80"`
	URL                string `json:"url" validate:"omitempty,url,max=500"`
	ImageURL           string `json:"image_url" validate:"omitempty,url,max=500"`
	Notes              string `json:"notes" validate:"omitempty,max=2000"`
}

func (s *Server) handleCreateDream(c echo.Context) error {
	var req dreamRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	userID := request.UserID(c)
	order, _ := s.dreams.NextSortOrder(ctx, userID)

	dream := &models.DreamItem{
		UserID: userID, Title: req.Title,
		DestinationCountry: req.DestinationCountry,
		DestinationCity:    req.DestinationCity,
		URL:                req.URL, ImageURL: req.ImageURL,
		Notes: req.Notes, SortOrder: order,
	}
	if err := s.dreams.Create(ctx, dream); err != nil {
		return request.Internal(c, "บันทึก dream ไม่สำเร็จ")
	}
	return request.Created(c, dream)
}

func (s *Server) handleUpdateDream(c echo.Context) error {
	var req dreamRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	userID := request.UserID(c)

	dream, err := s.dreams.Get(ctx, userID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ")
	}

	dream.Title = req.Title
	dream.DestinationCountry = req.DestinationCountry
	dream.DestinationCity = req.DestinationCity
	dream.URL = req.URL
	dream.ImageURL = req.ImageURL
	dream.Notes = req.Notes

	if err := s.dreams.Update(ctx, dream); err != nil {
		return request.Internal(c, "บันทึก dream ไม่สำเร็จ")
	}
	return request.OK(c, dream)
}

func (s *Server) handleDeleteDream(c echo.Context) error {
	err := s.dreams.Delete(c.Request().Context(), request.UserID(c), c.Param("id"))
	if err != nil {
		return request.Internal(c, "ลบ dream ไม่สำเร็จ")
	}
	return request.NoContent(c)
}

type reorderRequest struct {
	IDs []string `json:"ids" validate:"required,max=200,dive,uuid4"`
}

func (s *Server) handleReorderDreams(c echo.Context) error {
	var req reorderRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	err := s.dreams.Reorder(c.Request().Context(), request.UserID(c), req.IDs)
	if err != nil {
		return request.Internal(c, "จัดลำดับไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"reordered": len(req.IDs)})
}

func (s *Server) handleGetPoints(c echo.Context) error {
	points, err := s.points.Get(c.Request().Context(), request.UserID(c))
	if err != nil {
		return request.Internal(c, "อ่านแต้มไม่สำเร็จ")
	}
	cfg := domain.PointsConfig{
		EarnRatePct:      s.cfg.Points.EarnRatePct,
		MinRedeemBalance: s.cfg.Points.MinRedeemBalance,
	}
	return request.OK(c, map[string]any{
		"balance":            points.Balance,
		"lifetime_earned":    points.LifetimeEarned,
		"can_redeem":         domain.CanRedeem(points.Balance, cfg),
		"min_redeem_balance": cfg.MinRedeemBalance,
	})
}

func (s *Server) handlePointsHistory(c echo.Context) error {
	txs, err := s.points.History(c.Request().Context(), request.UserID(c),
		c.QueryParam("cursor"), atoiDefault(c.QueryParam("limit"), 30))
	if err != nil {
		return request.Internal(c, "อ่านประวัติแต้มไม่สำเร็จ")
	}

	var next string
	if len(txs) > 0 {
		next = txs[len(txs)-1].CreatedAt.Format(time.RFC3339Nano)
	}
	return request.OK(c, map[string]any{"items": txs, "next_cursor": next})
}
