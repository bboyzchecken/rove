package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Date coordination (M2.5 — A2.6): the step that happens before a trip has
// dates at all.
//
// Everyone paints the days they are free, the server turns the overlap into
// ranked windows, and the owner locks one. The board is returned whole from
// every mutation so the calendar, the suggestions and the lock bar can never
// disagree with each other.
func (s *Server) registerDateRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)
	own := s.TripRoleMiddleware(models.TripRoleOwner)

	g.GET("/:tripId/dates/board", s.handleDateBoard, view)
	g.GET("/:tripId/dates/windows", s.handleDateWindows, view)
	// A member marks their *own* availability, so editor is the right bar:
	// a viewer is someone who was shown the trip, not someone coming along.
	g.PUT("/:tripId/dates/availability", s.handleSetAvailability, edit)
	g.POST("/:tripId/dates/submit", s.handleSubmitAvailability, edit)
	g.POST("/:tripId/dates/lock", s.handleLockDates, own)
	g.DELETE("/:tripId/dates/lock", s.handleUnlockDates, own)
	g.GET("/:tripId/dates/destinations", s.handleDestinations, view)
	g.POST("/:tripId/dates/destination", s.handleChooseDestination, edit)
}

func (s *Server) handleDateBoard(c echo.Context) error {
	board, err := s.buildBoard(c, c.QueryParam("month"))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, board)
}

func (s *Server) handleDateWindows(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	entries, err := s.dates.List(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดวันว่างไม่สำเร็จ")
	}
	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}

	return c.JSON(http.StatusOK, domain.ComputeWindows(toAvailabilityInputs(entries), roster.ids(), domain.WindowOptions{}))
}

type setAvailabilityRequest struct {
	// Optional: the owner may fill in for someone who is not on the app yet.
	UserID string   `json:"user_id"`
	Dates  []string `json:"dates" validate:"required,min=1"`
	// nil clears the marks for those dates.
	Mark *string `json:"mark"`
}

func (s *Server) handleSetAvailability(c echo.Context) error {
	var req setAvailabilityRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	actor := request.UserID(c)

	target := req.UserID
	if target == "" {
		target = actor
	}
	// Marking someone else's calendar is an owner's job — everyone else speaks
	// only for themselves.
	if target != actor && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "แก้วันว่างของคนอื่นไม่ได้")
	}

	if req.Mark != nil {
		switch *req.Mark {
		case models.MarkFree, models.MarkMaybe, models.MarkBusy:
		default:
			return request.BadRequest(c, "สถานะวันว่างไม่ถูกต้อง")
		}
	}

	dates := make([]time.Time, 0, len(req.Dates))
	for _, raw := range req.Dates {
		if d, ok := parseDateParam(raw); ok {
			dates = append(dates, d)
		}
	}
	if len(dates) == 0 {
		return request.BadRequest(c, "ไม่มีวันที่ถูกต้อง")
	}

	if err := s.dates.Replace(ctx, tripID, target, dates, req.Mark); err != nil {
		return request.Internal(c, "บันทึกวันว่างไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypeDatesChanged, "trip", tripID)

	board, err := s.buildBoard(c, monthOf(dates[0]))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, board)
}

type submitAvailabilityRequest struct {
	UserID string `json:"user_id"`
}

func (s *Server) handleSubmitAvailability(c echo.Context) error {
	var req submitAvailabilityRequest
	_ = c.Bind(&req)

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	actor := request.UserID(c)

	target := req.UserID
	if target == "" {
		target = actor
	}
	if target != actor && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ยืนยันแทนคนอื่นไม่ได้")
	}

	if err := s.dates.Submit(ctx, tripID, target); err != nil {
		return request.Internal(c, "ยืนยันวันว่างไม่สำเร็จ")
	}

	name := "สมาชิก"
	if roster, err := s.loadMembers(ctx, tripID); err == nil {
		if u, ok := roster.users[target]; ok && u.DisplayName != "" {
			name = u.DisplayName
		}
	}
	s.track(c, tripID, name+" ใส่วันว่างเรียบร้อย", events.TypeDatesChanged, "trip", tripID)

	board, err := s.buildBoard(c, c.QueryParam("month"))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, board)
}

type lockDatesRequest struct {
	StartDate string `json:"start_date" validate:"required"`
	EndDate   string `json:"end_date" validate:"required"`
}

// handleLockDates is what turns a room into a trip: the agreed window becomes
// the trip's frame, and `dates_locked_at` records that it was agreed rather
// than typed.
func (s *Server) handleLockDates(c echo.Context) error {
	var req lockDatesRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	start, ok1 := parseDateParam(req.StartDate)
	end, ok2 := parseDateParam(req.EndDate)
	if !ok1 || !ok2 || end.Before(start) {
		return request.BadRequest(c, "ช่วงวันไม่ถูกต้อง")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	actor := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	now := time.Now().UTC()
	trip.StartDate = &start
	trip.EndDate = &end
	trip.DatesLockedAt = &now
	trip.DatesLockedBy = &actor

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "ล็อควันไม่สำเร็จ")
	}

	entries, _ := s.dates.List(ctx, tripID)
	roster, _ := s.loadMembers(ctx, tripID)
	free, _ := domain.MembersFreeInRange(toAvailabilityInputs(entries), roster.ids(), start, end)

	s.track(c, tripID, "ล็อควัน "+domain.ThaiRangeLabel(start, end), events.TypeDatesLocked, "trip", tripID)

	return c.JSON(http.StatusOK, lockedDatesDTO{
		StartDate: start.Format("2006-01-02"),
		EndDate:   end.Format("2006-01-02"),
		Days:      domain.DaysBetween(start, end),
		LockedBy:  actor,
		LockedAt:  now.Format(time.RFC3339),
		MemberIDs: free,
	})
}

func (s *Server) handleUnlockDates(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	trip.StartDate = nil
	trip.EndDate = nil
	trip.DatesLockedAt = nil
	trip.DatesLockedBy = nil

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "ปลดล็อควันไม่สำเร็จ")
	}

	s.track(c, tripID, "ปลดล็อควันเพื่อเลือกใหม่", events.TypeDatesChanged, "trip", tripID)
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handleDestinations(c echo.Context) error {
	ctx := c.Request().Context()

	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	days, month := 5, int(time.Now().Month())
	if trip.StartDate != nil && trip.EndDate != nil {
		days = domain.DaysBetween(*trip.StartDate, *trip.EndDate)
		month = int(trip.StartDate.Month())
	}

	return c.JSON(http.StatusOK, domain.RankDestinations(days, month, trip.BudgetPerPersonTHB))
}

type chooseDestinationRequest struct {
	DestinationID string `json:"destination_id" validate:"required"`
}

func (s *Server) handleChooseDestination(c echo.Context) error {
	var req chooseDestinationRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	destination, ok := domain.FindDestination(req.DestinationID)
	if !ok {
		return request.BadRequest(c, "ไม่รู้จักปลายทางนี้")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	trip.DestinationID = destination.ID
	trip.DestinationCountry = destination.Country
	trip.DestinationCities = jsonArray(destination.Cities)

	// A room created before anyone knew where they were going still carries a
	// placeholder title; naming it after the destination is the first useful
	// thing we can do with the answer.
	if trip.StartDate != nil && !containsRunes(trip.Title, destination.Name) {
		trip.Title = destination.Name + " " + itoa(trip.StartDate.Year()+543)
	}

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกปลายทางไม่สำเร็จ")
	}

	s.track(c, tripID, "เลือกปลายทาง "+destination.Name, events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, toTripDTO(*trip))
}

/* ----------------------------------------------------------------- board -- */

// buildBoard assembles the single payload the date screen renders.
func (s *Server) buildBoard(c echo.Context, month string) (*availabilityBoardDTO, error) {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return nil, request.NotFound(c, "ไม่พบทริป")
	}
	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return nil, request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	entries, err := s.dates.List(ctx, tripID)
	if err != nil {
		return nil, request.Internal(c, "โหลดวันว่างไม่สำเร็จ")
	}
	submissions, _ := s.dates.Submissions(ctx, tripID)

	// Months the board may browse: six from today, plus any month somebody has
	// already marked — an answer must never become invisible.
	monthSet := map[string]bool{}
	base := time.Now().UTC()
	if trip.StartDate != nil {
		base = *trip.StartDate
	}
	for i := 0; i < 6; i++ {
		monthSet[monthOf(base.AddDate(0, i, 0))] = true
	}
	for _, e := range entries {
		monthSet[monthOf(e.Date)] = true
	}

	months := make([]string, 0, len(monthSet))
	for m := range monthSet {
		months = append(months, m)
	}
	sort.Strings(months)

	active := month
	if active == "" || !monthSet[active] {
		active = monthOf(base)
		if !monthSet[active] && len(months) > 0 {
			active = months[0]
		}
	}

	entryDTOs := make([]availabilityEntryDTO, 0, len(entries))
	for _, e := range entries {
		entryDTOs = append(entryDTOs, availabilityEntryDTO{
			UserID: e.UserID,
			Date:   e.Date.Format("2006-01-02"),
			Mark:   e.Mark,
		})
	}

	submitted := make([]string, 0, len(submissions))
	for _, sub := range submissions {
		submitted = append(submitted, sub.UserID)
	}

	return &availabilityBoardDTO{
		TripID:             tripID,
		Month:              active,
		Months:             months,
		Members:            roster.dtos(),
		SubmittedMemberIDs: submitted,
		Entries:            entryDTOs,
		Windows:            domain.ComputeWindows(toAvailabilityInputs(entries), roster.ids(), domain.WindowOptions{}),
		Locked:             lockedDTO(*trip, roster),
	}, nil
}

func toAvailabilityInputs(entries []models.Availability) []domain.AvailabilityInput {
	out := make([]domain.AvailabilityInput, 0, len(entries))
	for _, e := range entries {
		out = append(out, domain.AvailabilityInput{UserID: e.UserID, Date: e.Date, Mark: e.Mark})
	}
	return out
}

func monthOf(t time.Time) string {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
}

func containsRunes(haystack, needle string) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) && stringContains(haystack, needle)
}

func stringContains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
