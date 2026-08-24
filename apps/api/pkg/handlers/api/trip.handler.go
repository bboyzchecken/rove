package api

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/str"
)

// Trip CRUD and the overview payload (A1.1 / A2.1).
func (s *Server) registerTripRoutes(g *echo.Group) {
	g.GET("", s.handleListTrips)
	g.POST("", s.handleCreateTrip)

	g.GET("/:tripId", s.handleGetTrip, s.TripRoleMiddleware(models.TripRoleViewer))
	g.GET("/:tripId/overview", s.handleTripOverview, s.TripRoleMiddleware(models.TripRoleViewer))
	g.GET("/:tripId/recap", s.handleTripRecap, s.TripRoleMiddleware(models.TripRoleViewer))
	g.PATCH("/:tripId", s.handleUpdateTrip, s.TripRoleMiddleware(models.TripRoleEditor))
	g.DELETE("/:tripId", s.handleDeleteTrip, s.TripRoleMiddleware(models.TripRoleOwner))
	g.POST("/:tripId/clone", s.handleCloneTrip, s.TripRoleMiddleware(models.TripRoleViewer))
	g.GET("/:tripId/share", s.handleShareState, s.TripRoleMiddleware(models.TripRoleViewer))
	g.PATCH("/:tripId/visibility", s.handleSetVisibility, s.TripRoleMiddleware(models.TripRoleOwner))
	g.POST("/:tripId/share/rotate", s.handleRotateShareToken, s.TripRoleMiddleware(models.TripRoleOwner))
}

func (s *Server) handleListTrips(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)
	page := request.BindPagination(c)

	trips, total, err := s.trips.ListForUser(ctx, userID, page.Limit, page.Offset())
	if err != nil {
		return request.Internal(c, "โหลดรายการทริปไม่สำเร็จ")
	}

	items := make([]tripDTO, 0, len(trips))
	for _, t := range trips {
		dto := toTripDTO(t)

		if roster, err := s.loadMembers(ctx, t.ID); err == nil {
			dto.MemberIDs = roster.ids()
			dto.MemberCharacterIDs = roster.characterIDs()
			for _, m := range roster.members {
				if m.UserID == userID {
					dto.Role = m.Role
				}
			}
		}
		if t.StartDate != nil {
			days := int(domain.Day(*t.StartDate).Sub(domain.Day(time.Now())).Hours() / 24)
			dto.DaysUntil = &days
		}
		items = append(items, dto)
	}

	return c.JSON(http.StatusOK, listResult[tripDTO]{
		Items:      items,
		Total:      total,
		Page:       page.Page,
		Limit:      page.Limit,
		TotalPages: store.NewListResult(items, total, page).TotalPages,
	})
}

type createTripRequest struct {
	// route | date | coordinate | clone — analytics only; what the trip
	// actually becomes is decided by the fields below.
	EntryType          string   `json:"entry_type"`
	Title              string   `json:"title" validate:"required"`
	DestinationCities  []string `json:"destination_cities"`
	StartDate          *string  `json:"start_date"`
	EndDate            *string  `json:"end_date"`
	PartySize          int      `json:"party_size"`
	BudgetPerPersonTHB float64  `json:"budget_per_person_thb"`
	// A date-first room is created with no dates at all — that is the whole
	// point of the date board (M2.5).
	CoordinateDates bool   `json:"coordinate_dates"`
	SourceTripID    string `json:"source_trip_id"`
	// The route the group already booked (M1 — A1.3). When it is present it
	// wins: the dates, the destinations and the country all come from the legs
	// rather than from anything typed alongside them.
	Flights []flightRequest `json:"flights"`
}

func (s *Server) handleCreateTrip(c echo.Context) error {
	var req createTripRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	userID := request.UserID(c)

	trip := &models.Trip{
		OwnerID:            userID,
		Title:              req.Title,
		DestinationCountry: "JP",
		DestinationCities:  jsonArray(req.DestinationCities),
		PartySize:          maxInt(req.PartySize, 1),
		HomeCurrency:       "THB",
		DestCurrency:       "JPY",
		Visibility:         models.VisibilityPrivate,
		Status:             models.TripStatusPlanning,
		BudgetPerPersonTHB: req.BudgetPerPersonTHB,
		CoverImageURL:      "/brand/covers/cover-japan.webp",
	}

	if !req.CoordinateDates {
		if start, ok := parseDateParam(str.Deref(req.StartDate, "")); ok {
			trip.StartDate = &start
			trip.DatesLockedAt = ptrTime(time.Now().UTC())
			trip.DatesLockedBy = &userID
		}
		if end, ok := parseDateParam(str.Deref(req.EndDate, "")); ok {
			trip.EndDate = &end
		}
	}

	// A route decides the frame before the row is written, so the trip is never
	// stored with dates that disagree with the tickets.
	legs := make([]models.TripFlight, 0, len(req.Flights))
	for _, in := range req.Flights {
		legs = append(legs, toFlightModel(in))
	}
	if len(legs) > 0 {
		s.applyRouteToTrip(trip, legs, userID)
	}

	// The rate is snapshotted at creation so the budget does not drift day to
	// day underneath the group (A7.2).
	if rate, err := s.fx.Rate(ctx, "JPY", "THB"); err == nil {
		now := time.Now().UTC()
		trip.FxRate = &rate
		trip.FxRateAt = &now
	}

	if err := s.trips.Create(ctx, trip); err != nil {
		return request.Internal(c, "สร้างทริปไม่สำเร็จ")
	}

	if err := s.members.Add(ctx, &models.TripMember{
		TripID: trip.ID,
		UserID: userID,
		Role:   models.TripRoleOwner,
	}); err != nil {
		return request.Internal(c, "เพิ่มเจ้าของทริปไม่สำเร็จ")
	}

	if len(legs) > 0 {
		if err := s.flights.ReplaceAll(ctx, trip.ID, legs); err != nil {
			return request.Internal(c, "บันทึกเส้นทางไม่สำเร็จ")
		}
	}

	_ = s.collab.Log(ctx, &models.Activity{TripID: trip.ID, UserID: userID, Text: "สร้างห้องทริป"})

	return c.JSON(http.StatusCreated, s.withRoute(ctx, toTripDTO(*trip), trip.ID))
}

func (s *Server) handleGetTrip(c echo.Context) error {
	ctx := c.Request().Context()
	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	return c.JSON(http.StatusOK, s.withRoute(ctx, toTripDTO(*trip), trip.ID))
}

// withRoute attaches the legs to a trip DTO. It is best effort: a route that
// fails to load must not take the trip room down with it.
func (s *Server) withRoute(ctx context.Context, dto tripDTO, tripID string) tripDTO {
	flights, err := s.flights.ListByTrip(ctx, tripID)
	if err != nil {
		return dto
	}
	route := s.toRouteDTO(flights)
	dto.Route = &route
	return dto
}

type updateTripRequest struct {
	Title              *string   `json:"title"`
	DestinationCities  *[]string `json:"destination_cities"`
	StartDate          *string   `json:"start_date"`
	EndDate            *string   `json:"end_date"`
	PartySize          *int      `json:"party_size"`
	BudgetPerPersonTHB *float64  `json:"budget_per_person_thb"`
	Status             *string   `json:"status"`
	CoverImageURL      *string   `json:"cover_image_url"`
}

func (s *Server) handleUpdateTrip(c echo.Context) error {
	var req updateTripRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	if req.Title != nil {
		trip.Title = *req.Title
	}
	if req.DestinationCities != nil {
		trip.DestinationCities = jsonArray(*req.DestinationCities)
	}
	if req.StartDate != nil {
		if start, ok := parseDateParam(*req.StartDate); ok {
			trip.StartDate = &start
		} else {
			trip.StartDate = nil
		}
	}
	if req.EndDate != nil {
		if end, ok := parseDateParam(*req.EndDate); ok {
			trip.EndDate = &end
		} else {
			trip.EndDate = nil
		}
	}
	if req.PartySize != nil {
		trip.PartySize = maxInt(*req.PartySize, 1)
	}
	if req.BudgetPerPersonTHB != nil {
		trip.BudgetPerPersonTHB = *req.BudgetPerPersonTHB
	}
	if req.Status != nil {
		trip.Status = *req.Status
	}
	if req.CoverImageURL != nil {
		trip.CoverImageURL = *req.CoverImageURL
	}

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.track(c, tripID, "แก้กรอบทริป", events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, s.withRoute(ctx, toTripDTO(*trip), tripID))
}

func (s *Server) handleDeleteTrip(c echo.Context) error {
	if err := s.trips.Delete(c.Request().Context(), request.TripID(c)); err != nil {
		return request.Internal(c, "ลบทริปไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

// handleCloneTrip copies the frame and the itinerary, never the money: expenses
// and settlements belong to the group that spent them (W16.5).
func (s *Server) handleCloneTrip(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)
	sourceID := request.TripID(c)

	source, err := s.trips.GetByID(ctx, sourceID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริปต้นทาง")
	}

	copyTrip, err := s.cloneTripForUser(ctx, source, userID)
	if err != nil {
		return request.Internal(c, "คัดลอกทริปไม่สำเร็จ")
	}
	return c.JSON(http.StatusCreated, toTripDTO(*copyTrip))
}

// cloneTripForUser is the shared clone core (A11.1): the member route above and
// the public clone route (public.handler.go) both come through here.
func (s *Server) cloneTripForUser(ctx contextT, source *models.Trip, userID string) (*models.Trip, error) {
	copyTrip := *source
	copyTrip.ID = ""
	copyTrip.OwnerID = userID
	copyTrip.Title = source.Title + " (คัดลอก)"
	copyTrip.Slug = nil
	copyTrip.ShareToken = nil
	copyTrip.Visibility = models.VisibilityPrivate
	copyTrip.SourceTripID = &source.ID
	copyTrip.SourceCreatorID = &source.OwnerID
	copyTrip.CloneCount = 0
	copyTrip.ViewCount = 0
	copyTrip.CreatedAt = time.Time{}
	copyTrip.UpdatedAt = time.Time{}

	if err := s.trips.Create(ctx, &copyTrip); err != nil {
		return nil, err
	}
	if err := s.members.Add(ctx, &models.TripMember{
		TripID: copyTrip.ID,
		UserID: userID,
		Role:   models.TripRoleOwner,
	}); err != nil {
		return nil, err
	}

	// Copy the itinerary itself. New ids are minted here rather than left to
	// the create hook, because the item map has to be keyed by the *new* day id
	// before anything is written.
	if days, err := s.plans.ListDays(ctx, source.ID); err == nil && len(days) > 0 {
		items, _ := s.plans.ListItems(ctx, source.ID)
		byDay := map[string][]models.PlanItem{}
		for _, item := range items {
			byDay[item.DayID] = append(byDay[item.DayID], item)
		}

		if plan, err := s.plans.EnsurePlan(ctx, copyTrip.ID, userID); err == nil {
			newDays := make([]models.PlanDay, 0, len(days))
			newItems := map[string][]models.PlanItem{}

			for _, day := range days {
				newDay := day
				newDay.ID = uuid.NewString()
				newDay.PlanID = plan.ID
				newDay.TripID = copyTrip.ID
				newDay.CreatedAt, newDay.UpdatedAt = time.Time{}, time.Time{}

				copied := make([]models.PlanItem, 0, len(byDay[day.ID]))
				for _, item := range byDay[day.ID] {
					newItem := item
					newItem.ID = uuid.NewString()
					newItem.DayID = newDay.ID
					newItem.TripID = copyTrip.ID
					newItem.CreatedAt, newItem.UpdatedAt = time.Time{}, time.Time{}
					copied = append(copied, newItem)
				}

				newDays = append(newDays, newDay)
				newItems[newDay.ID] = copied
			}

			_ = s.plans.ReplaceDays(ctx, copyTrip.ID, newDays, newItems)
		}
	}

	_ = s.trips.BumpCloneCount(ctx, source.ID)

	// Points for the creator whose trip was worth copying (§6.5).
	if source.OwnerID != userID {
		_ = s.points.Add(ctx, &models.UserPoints{
			UserID: source.OwnerID,
			Delta:  domain.PointsPerClone,
			Reason: models.PointsReasonClone,
			Note:   "มีคนคัดลอกทริป \"" + source.Title + "\"",
			TripID: &source.ID,
		})
	}

	return &copyTrip, nil
}

/* -------------------------------------------------------------- overview -- */

func (s *Server) handleTripOverview(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}

	coverage, err := s.recomputeCoverage(ctx, tripID)
	if err != nil {
		return request.Internal(c, "คำนวณความครอบคลุมไม่สำเร็จ")
	}

	wishes, _ := s.wishlist.ListByTrip(ctx, tripID)
	days, _ := s.plans.ListDays(ctx, tripID)
	items, _ := s.plans.ListItems(ctx, tripID)
	bookings, _ := s.bookings.ListByTrip(ctx, tripID)
	prep, _ := s.prep.ListByTrip(ctx, tripID)
	activity, _ := s.collab.ListActivity(ctx, tripID, "", 8)

	withoutWishlist := 0
	for _, m := range roster.members {
		if !roster.hasWishlist[m.UserID] {
			withoutWishlist++
		}
	}
	bookedCount := 0
	for _, b := range bookings {
		if b.Status == models.BookingBooked {
			bookedCount++
		}
	}
	openPrep := 0
	for _, p := range prep {
		if !p.Done {
			openPrep++
		}
	}

	locked := lockedDTO(*trip, roster)

	hint := "ยังไม่ได้เลือกวัน"
	if locked != nil {
		hint = domain.ThaiRangeLabel(*trip.StartDate, *trip.EndDate)
	}
	memberHint := plural(len(roster.members), "คนแล้ว")

	checklist := []checklistDTO{
		{Key: "room", Label: "สร้างห้องทริป", Done: true},
		{Key: "invite", Label: "ชวนเพื่อนเข้าห้อง", Done: len(roster.members) > 1, Hint: &memberHint},
		{Key: "dates", Label: "ล็อควันเดินทาง", Done: locked != nil, Hint: &hint},
		{Key: "wishlist", Label: "ทุกคนใส่ที่อยากไป", Done: withoutWishlist == 0},
		{Key: "plan", Label: "ให้ AI ร่างแพลน", Done: len(days) > 0},
	}
	if withoutWishlist > 0 {
		h := plural(withoutWishlist, "คนที่ยังไม่ได้ใส่")
		checklist[3].Hint = &h
	}
	if len(days) > 0 {
		h := plural(len(days), "วันในแพลน")
		checklist[4].Hint = &h
	}

	activityDTOs := make([]activityDTO, 0, len(activity))
	for _, a := range activity {
		activityDTOs = append(activityDTOs, toActivityDTO(a))
	}

	return c.JSON(http.StatusOK, tripOverviewDTO{
		Trip:      s.withRoute(ctx, toTripDTO(*trip), tripID),
		Members:   roster.dtos(),
		Coverage:  toCoverageDTO(coverage),
		Checklist: checklist,
		Activity:  activityDTOs,
		Counts: overviewCountsDTO{
			WishlistItems:          len(wishes),
			PlanDays:               len(days),
			PlanItems:              len(items),
			MembersWithoutWishlist: withoutWishlist,
			Bookings:               bookedCount,
			OpenPrep:               openPrep,
		},
		Locked: locked,
	})
}

// lockedDTO renders the agreed window. A trip only counts as locked when
// someone actually locked it — dates typed into the frame are a plan, not an
// agreement (M2.5).
func lockedDTO(trip models.Trip, roster memberSet) *lockedDatesDTO {
	if trip.StartDate == nil || trip.EndDate == nil || trip.DatesLockedAt == nil {
		return nil
	}
	return &lockedDatesDTO{
		StartDate: trip.StartDate.Format("2006-01-02"),
		EndDate:   trip.EndDate.Format("2006-01-02"),
		Days:      domain.DaysBetween(*trip.StartDate, *trip.EndDate),
		LockedBy:  str.Deref(trip.DatesLockedBy, ""),
		LockedAt:  trip.DatesLockedAt.UTC().Format(time.RFC3339),
		MemberIDs: roster.ids(),
	}
}

/* ----------------------------------------------------------------- share -- */

func (s *Server) handleShareState(c echo.Context) error {
	trip, err := s.trips.GetByID(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	return c.JSON(http.StatusOK, s.shareStateOf(*trip))
}

type setVisibilityRequest struct {
	Visibility string `json:"visibility" validate:"required,oneof=private link public"`
}

func (s *Server) handleSetVisibility(c echo.Context) error {
	var req setVisibilityRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	trip.Visibility = req.Visibility

	switch req.Visibility {
	case models.VisibilityPrivate:
		// The token is dropped, not kept: "private" has to mean the old link is
		// dead, otherwise the switch is decoration.
		trip.ShareToken = nil
		trip.Slug = nil
	default:
		if trip.ShareToken == nil {
			token := str.RandomToken(32)
			trip.ShareToken = &token
		}
		if req.Visibility == models.VisibilityPublic && trip.Slug == nil {
			slug := str.Slugify(trip.Title) + "-" + str.RandomToken(6)
			trip.Slug = &slug

			// First publish is worth points (§6.5).
			_ = s.points.Add(ctx, &models.UserPoints{
				UserID: trip.OwnerID,
				Delta:  domain.PointsPerPublish,
				Reason: models.PointsReasonPublish,
				Note:   "เปิดทริป \"" + trip.Title + "\" เป็นสาธารณะ",
				TripID: &trip.ID,
			})
		}
	}

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกการแชร์ไม่สำเร็จ")
	}

	s.track(c, trip.ID, "เปลี่ยนการแชร์เป็น "+req.Visibility, events.TypeTripUpdated, "trip", trip.ID)
	return c.JSON(http.StatusOK, s.shareStateOf(*trip))
}

func (s *Server) handleRotateShareToken(c echo.Context) error {
	ctx := c.Request().Context()
	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	token := str.RandomToken(32)
	trip.ShareToken = &token
	if trip.Visibility == models.VisibilityPrivate {
		trip.Visibility = models.VisibilityLink
	}
	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "สร้างลิงก์ใหม่ไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, s.shareStateOf(*trip))
}

func (s *Server) shareStateOf(trip models.Trip) shareStateDTO {
	out := shareStateDTO{
		Visibility: trip.Visibility,
		ShareToken: trip.ShareToken,
		PublicSlug: trip.Slug,
		ViewCount:  trip.ViewCount,
		CloneCount: trip.CloneCount,
	}
	if trip.ShareToken != nil {
		url := s.cfg.WebBaseURL + "/s/" + *trip.ShareToken
		out.ShareURL = &url
	}
	return out
}

/* ------------------------------------------------------------------ util -- */

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func ptrTime(t time.Time) *time.Time { return &t }

func plural(n int, suffix string) string {
	return itoa(n) + " " + suffix
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
