package api

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/hashutil"
)

// registerTripRoutes registers the trip endpoints (DEV_SPEC §5.3).
//
//	POST   /trips                    entry_type: date|city|ticket|clone
//	GET    /trips                    my trips (paginated)
//	GET    /trips/:tripId            overview payload   [viewer]
//	PATCH  /trips/:tripId            edit frame         [editor]
//	DELETE /trips/:tripId                               [owner]
//	POST   /trips/:tripId/flights                       [editor]
//	PATCH  /trips/:tripId/visibility                    [owner]
//	POST   /trips/:tripId/clone      -> new trip
//	GET    /trips/:tripId/activity                      [viewer]
func (s *Server) registerTripRoutes(v1, trips *echo.Group) {
	authed := v1.Group("", s.JwtMiddleware)
	authed.POST("/trips", s.handleCreateTrip)
	authed.GET("/trips", s.handleListTrips)

	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	editor := s.TripRoleMiddleware(models.TripRoleEditor)
	owner := s.TripRoleMiddleware(models.TripRoleOwner)

	trips.GET("/:tripId", s.handleGetTrip, viewer)
	trips.PATCH("/:tripId", s.handleUpdateTrip, editor)
	trips.DELETE("/:tripId", s.handleDeleteTrip, owner)
	trips.POST("/:tripId/flights", s.handleSaveFlights, editor)
	trips.PATCH("/:tripId/visibility", s.handleSetVisibility, owner)
	trips.POST("/:tripId/clone", s.handleCloneTrip, viewer)
	trips.GET("/:tripId/activity", s.handleActivity, viewer)
}

// Entry types (M1). Every one of them lands on the same trip row; they differ
// only in which fields the client already knows.
const (
	EntryDate   = "date"
	EntryCity   = "city"
	EntryTicket = "ticket"
	EntryClone  = "clone"
)

type createTripRequest struct {
	EntryType  string        `json:"entry_type" validate:"required,oneof=date city ticket clone"`
	Title      string        `json:"title" validate:"omitempty,max=200"`
	StartDate  string        `json:"start_date" validate:"omitempty,datetime=2006-01-02"`
	EndDate    string        `json:"end_date" validate:"omitempty,datetime=2006-01-02"`
	Cities     []string      `json:"cities" validate:"omitempty,max=10,dive,max=80"`
	PartySize  int           `json:"party_size" validate:"omitempty,min=1,max=30"`
	SourceTrip string        `json:"source_trip_id" validate:"omitempty,uuid4"`
	Flights    []flightInput `json:"flights" validate:"omitempty,max=8,dive"`
}

type flightInput struct {
	Direction  string `json:"direction" validate:"required,oneof=out return"`
	Airline    string `json:"airline" validate:"omitempty,max=80"`
	FlightNo   string `json:"flight_no" validate:"omitempty,max=20"`
	DepAirport string `json:"dep_airport" validate:"omitempty,max=10"`
	ArrAirport string `json:"arr_airport" validate:"omitempty,max=10"`
	DepAt      string `json:"dep_at"`
	ArrAt      string `json:"arr_at"`
	RawText    string `json:"raw_text"`
}

// handleCreateTrip is the one endpoint all four entry flows land on (A1.1).
// Creating the trip and its owner membership is a transaction: a trip whose
// creator is not a member would be invisible to everyone including its owner.
func (s *Server) handleCreateTrip(c echo.Context) error {
	var req createTripRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	userID := request.UserID(c)

	if req.EntryType == EntryClone {
		if req.SourceTrip == "" {
			return request.BadRequest(c, "entry_type=clone ต้องมี source_trip_id")
		}
		return s.cloneInto(c, req.SourceTrip, userID)
	}

	start, err := parseDate(req.StartDate)
	if err != nil {
		return request.BadRequest(c, "start_date ไม่ถูกต้อง")
	}
	end, err := parseDate(req.EndDate)
	if err != nil {
		return request.BadRequest(c, "end_date ไม่ถูกต้อง")
	}
	if start != nil && end != nil && end.Before(*start) {
		return request.BadRequest(c, "วันจบต้องไม่มาก่อนวันเริ่ม")
	}

	cities := normalizeCities(req.Cities)
	trip := &models.Trip{
		OwnerID:            userID,
		Title:              tripTitle(req.Title, cities, start),
		DestinationCountry: "JP",
		StartDate:          start,
		EndDate:            end,
		PartySize:          orDefault(req.PartySize, 1),
		HomeCurrency:       "THB",
		DestCurrency:       "JPY",
		Visibility:         models.VisibilityPrivate,
		Status:             models.TripStatusDraft,
		PublicHideExpense:  true,
	}
	if raw, err := json.Marshal(cities); err == nil {
		trip.DestinationCities = datatypes.JSON(raw)
	}

	ctx := c.Request().Context()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(trip).Error; err != nil {
			return err
		}
		member := &models.TripMember{
			TripID: trip.ID, UserID: userID,
			Role: models.TripRoleOwner, JoinedAt: time.Now().UTC(),
		}
		if err := tx.Create(member).Error; err != nil {
			return err
		}
		if len(req.Flights) == 0 {
			return nil
		}
		flights := toFlightModels(trip.ID, req.Flights)
		return tx.Create(&flights).Error
	})
	if err != nil {
		return request.Internal(c, "สร้างทริปไม่สำเร็จ")
	}

	s.emit(c, trip.ID, emitOpts{
		Action:     models.ActionTripCreated,
		EventType:  events.TypeTripUpdated,
		TargetType: "trip", TargetID: trip.ID,
		Meta: map[string]any{"entry_type": req.EntryType},
	})
	return request.Created(c, trip)
}

func (s *Server) handleListTrips(c echo.Context) error {
	p := request.BindPagination(c)
	trips, total, err := s.trips.ListForUser(c.Request().Context(), request.UserID(c), p.Limit, p.Offset())
	if err != nil {
		return request.Internal(c, "อ่านรายการทริปไม่สำเร็จ")
	}
	return request.OK(c, store.NewListResult(trips, total, p))
}

// TripOverview is one request that fills the whole Overview tab (W2.2): the
// trip, who is in it, and the counts the onboarding checklist reads.
type TripOverview struct {
	Trip    *models.Trip        `json:"trip"`
	Members []MemberView        `json:"members"`
	Flights []models.TripFlight `json:"flights"`
	Counts  overviewCounts      `json:"counts"`
	Flags   overviewFlags       `json:"flags"`
	MyRole  string              `json:"my_role"`
}

type overviewCounts struct {
	WishlistItems          int64    `json:"wishlist_items"`
	Plans                  int64    `json:"plans"`
	Members                int64    `json:"members"`
	MembersWithoutWishlist int      `json:"members_without_wishlist"`
	WaitingOn              []string `json:"waiting_on"`
}

type overviewFlags struct {
	HasFlights bool `json:"has_flights"`
	HasPlan    bool `json:"has_plan"`
	HasProfile bool `json:"has_profile"`
	IsShared   bool `json:"is_shared"`
}

// MemberView joins trip_members with the user's public profile so the frontend
// renders an avatar without a second round trip.
type MemberView struct {
	UserID      string    `json:"user_id"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	CharacterID *int16    `json:"character_id"`
	HasWishlist bool      `json:"has_wishlist"`
}

func (s *Server) handleGetTrip(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	members, err := s.memberViews(c, tripID)
	if err != nil {
		return request.Internal(c, "อ่านสมาชิกไม่สำเร็จ")
	}
	flights, _ := s.flights.ListByTrip(ctx, tripID)
	wishCount, _ := s.wishlists.CountByTrip(ctx, tripID)
	planCount, _ := s.plans.CountByTrip(ctx, tripID)
	memberCount, _ := s.members.CountByTrip(ctx, tripID)

	counts := overviewCounts{
		WishlistItems: wishCount,
		Plans:         planCount,
		Members:       memberCount,
		WaitingOn:     []string{},
	}
	for _, m := range members {
		if !m.HasWishlist {
			counts.MembersWithoutWishlist++
			counts.WaitingOn = append(counts.WaitingOn, m.DisplayName)
		}
	}

	profile, _ := s.profiles.Get(ctx, tripID, request.UserID(c))
	return request.OK(c, TripOverview{
		Trip:    trip,
		Members: members,
		Flights: flights,
		Counts:  counts,
		Flags: overviewFlags{
			HasFlights: len(flights) > 0,
			HasPlan:    planCount > 0,
			HasProfile: profile != nil && profile.Notes != "",
			IsShared:   trip.Visibility != models.VisibilityPrivate,
		},
		MyRole: request.TripRole(c),
	})
}

// memberViews is the two-query join used by the overview and the members list.
func (s *Server) memberViews(c echo.Context, tripID string) ([]MemberView, error) {
	ctx := c.Request().Context()

	members, err := s.members.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}

	users, err := s.users.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]models.User, len(users))
	for _, u := range users {
		byID[u.ID] = u
	}

	withWishes, _ := s.wishlists.MembersWithItems(ctx, tripID)
	hasWish := make(map[string]bool, len(withWishes))
	for _, id := range withWishes {
		hasWish[id] = true
	}

	out := make([]MemberView, 0, len(members))
	for _, m := range members {
		u := byID[m.UserID]
		out = append(out, MemberView{
			UserID: m.UserID, Role: m.Role, JoinedAt: m.JoinedAt,
			DisplayName: u.DisplayName, AvatarURL: u.AvatarURL,
			CharacterID: u.CharacterID,
			HasWishlist: hasWish[m.UserID],
		})
	}
	return out, nil
}

type updateTripRequest struct {
	Title     *string   `json:"title" validate:"omitempty,max=200"`
	StartDate *string   `json:"start_date" validate:"omitempty,datetime=2006-01-02"`
	EndDate   *string   `json:"end_date" validate:"omitempty,datetime=2006-01-02"`
	Cities    *[]string `json:"cities" validate:"omitempty,max=10,dive,max=80"`
	PartySize *int      `json:"party_size" validate:"omitempty,min=1,max=30"`
	Summary   *string   `json:"summary" validate:"omitempty,max=2000"`
	Status    *string   `json:"status" validate:"omitempty,oneof=draft planning final done"`
}

func (s *Server) handleUpdateTrip(c echo.Context) error {
	var req updateTripRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	if req.Title != nil {
		trip.Title = *req.Title
	}
	if req.StartDate != nil {
		if d, err := parseDate(*req.StartDate); err == nil {
			trip.StartDate = d
		}
	}
	if req.EndDate != nil {
		if d, err := parseDate(*req.EndDate); err == nil {
			trip.EndDate = d
		}
	}
	if trip.StartDate != nil && trip.EndDate != nil && trip.EndDate.Before(*trip.StartDate) {
		return request.BadRequest(c, "วันจบต้องไม่มาก่อนวันเริ่ม")
	}
	if req.Cities != nil {
		if raw, err := json.Marshal(normalizeCities(*req.Cities)); err == nil {
			trip.DestinationCities = datatypes.JSON(raw)
		}
	}
	if req.PartySize != nil {
		trip.PartySize = *req.PartySize
	}
	if req.Summary != nil {
		trip.Summary = *req.Summary
	}
	if req.Status != nil {
		trip.Status = *req.Status
	}

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกทริปไม่สำเร็จ")
	}

	s.emit(c, trip.ID, emitOpts{
		Action:     models.ActionTripUpdated,
		EventType:  events.TypeTripUpdated,
		TargetType: "trip", TargetID: trip.ID,
	})
	return request.OK(c, trip)
}

func (s *Server) handleDeleteTrip(c echo.Context) error {
	if err := s.trips.Delete(c.Request().Context(), request.TripID(c)); err != nil {
		return request.Internal(c, "ลบทริปไม่สำเร็จ")
	}
	return request.NoContent(c)
}

type saveFlightsRequest struct {
	Flights []flightInput `json:"flights" validate:"omitempty,max=8,dive"`
}

func (s *Server) handleSaveFlights(c echo.Context) error {
	var req saveFlightsRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	tripID := request.TripID(c)

	flights := toFlightModels(tripID, req.Flights)
	if err := s.flights.ReplaceAll(c.Request().Context(), tripID, flights); err != nil {
		return request.Internal(c, "บันทึกเที่ยวบินไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionTripUpdated,
		EventType:  events.TypeTripUpdated,
		TargetType: "trip", TargetID: tripID,
		Meta: map[string]any{"flights": len(flights)},
	})

	saved, _ := s.flights.ListByTrip(c.Request().Context(), tripID)
	return request.OK(c, map[string]any{"flights": saved})
}

type visibilityRequest struct {
	Visibility string `json:"visibility" validate:"required,oneof=private link public"`
}

// handleSetVisibility issues a share token the first time a trip leaves private,
// and keeps it afterwards so an already-shared link never breaks.
//
// Expense is force-hidden on every non-private trip regardless of what the
// client sends — DEV_SPEC §4.3 makes that a rule, not a preference.
func (s *Server) handleSetVisibility(c echo.Context) error {
	var req visibilityRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	trip.Visibility = req.Visibility
	trip.PublicHideExpense = true

	if req.Visibility != models.VisibilityPrivate && trip.ShareToken == nil {
		token, err := hashutil.RandomToken(24)
		if err != nil {
			return request.Internal(c, "สร้างลิงก์แชร์ไม่สำเร็จ")
		}
		trip.ShareToken = &token
	}
	if req.Visibility == models.VisibilityPublic && trip.Slug == nil {
		slug := slugify(trip.Title) + "-" + shortID(trip.ID)
		trip.Slug = &slug
	}

	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกการแชร์ไม่สำเร็จ")
	}

	s.emit(c, trip.ID, emitOpts{
		Action:     models.ActionTripUpdated,
		EventType:  events.TypeTripUpdated,
		TargetType: "trip", TargetID: trip.ID,
		Meta: map[string]any{"visibility": trip.Visibility},
	})
	return request.OK(c, map[string]any{
		"visibility":  trip.Visibility,
		"share_token": trip.ShareToken,
		"slug":        trip.Slug,
		"share_url":   s.shareURL(trip),
	})
}

func (s *Server) shareURL(t *models.Trip) string {
	if t.ShareToken == nil {
		return ""
	}
	return strings.TrimRight(s.cfg.WebBaseURL, "/") + "/s/" + *t.ShareToken
}

func (s *Server) handleCloneTrip(c echo.Context) error {
	return s.cloneInto(c, request.TripID(c), request.UserID(c))
}

func (s *Server) handleActivity(c echo.Context) error {
	limit := atoiDefault(c.QueryParam("limit"), 30)
	logs, err := s.activities.List(c.Request().Context(),
		request.TripID(c), c.QueryParam("cursor"), limit)
	if err != nil {
		return request.Internal(c, "อ่าน activity ไม่สำเร็จ")
	}

	// The feed renders "ใครทำอะไร", so resolve the actors in one query.
	ids := make([]string, 0, len(logs))
	for _, l := range logs {
		if l.UserID != "" {
			ids = append(ids, l.UserID)
		}
	}
	users, _ := s.users.ListByIDs(c.Request().Context(), ids)
	actors := make(map[string]models.PublicUser, len(users))
	for _, u := range users {
		actors[u.ID] = u.Public()
	}

	var next string
	if len(logs) > 0 {
		next = logs[len(logs)-1].CreatedAt.Format(time.RFC3339Nano)
	}
	return request.OK(c, map[string]any{
		"items":       logs,
		"actors":      actors,
		"next_cursor": next,
	})
}

// --- helpers ----------------------------------------------------------------

func parseDate(s string) (*time.Time, error) {
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func toFlightModels(tripID string, in []flightInput) []models.TripFlight {
	out := make([]models.TripFlight, 0, len(in))
	for _, f := range in {
		row := models.TripFlight{
			TripID: tripID, Direction: f.Direction,
			Airline: f.Airline, FlightNo: f.FlightNo,
			DepAirport: strings.ToUpper(f.DepAirport),
			ArrAirport: strings.ToUpper(f.ArrAirport),
			RawText:    f.RawText,
		}
		if t, err := time.Parse(time.RFC3339, f.DepAt); err == nil {
			row.DepAt = &t
		}
		if t, err := time.Parse(time.RFC3339, f.ArrAt); err == nil {
			row.ArrAt = &t
		}
		out = append(out, row)
	}
	return out
}

func normalizeCities(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, city := range in {
		city = strings.ToLower(strings.TrimSpace(city))
		if city == "" || seen[city] {
			continue
		}
		seen[city] = true
		out = append(out, city)
	}
	return out
}

// tripTitle gives a trip a name the group recognises in a list, even when the
// entry flow never asked for one.
func tripTitle(title string, cities []string, start *time.Time) string {
	if t := strings.TrimSpace(title); t != "" {
		return t
	}
	name := "ทริปญี่ปุ่น"
	if len(cities) > 0 {
		name = "ทริป" + strings.Join(cities, " + ")
	}
	if start != nil {
		name += " " + start.Format("Jan 2006")
	}
	return name
}

func orDefault(v, fallback int) int {
	if v <= 0 {
		return fallback
	}
	return v
}

func atoiDefault(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	var n int
	for _, r := range s {
		if r < '0' || r > '9' {
			return fallback
		}
		n = n*10 + int(r-'0')
	}
	if n <= 0 || n > 100 {
		return fallback
	}
	return n
}

// slugify keeps Thai characters — a Thai slug is more readable to the audience
// than a transliteration nobody recognises.
func slugify(s string) string {
	var b strings.Builder
	lastDash := true
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r == ' ' || r == '-' || r == '_':
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		case r < 128 && !isAlnum(r):
			// drop ASCII punctuation
		default:
			b.WriteRune(r)
			lastDash = false
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "trip"
	}
	return out
}

func isAlnum(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
}

func shortID(id string) string {
	id = strings.ReplaceAll(id, "-", "")
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
