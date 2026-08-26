package api

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Public read-only views (M10 — A10.1) and the explore feed (M11 — A11.2).
//
// One handler serves both /s/:token (unlisted link) and /p/:slug (indexed
// page): the payload is identical, and the only difference is how you found
// it. Expenses are never included, at any visibility — that is a rule of the
// endpoint, not a setting (W16.5).
func (s *Server) registerPublicRoutes(g *echo.Group) {
	g.GET("/public/trips/:tokenOrSlug", s.handlePublicTrip)
	// Explore is public, but ?match= compares against a trip the caller owns —
	// optional auth rather than a second endpoint (A11.3).
	g.GET("/public/explore", s.handleExplore, s.OptionalJwt)
	g.GET("/public/creators/:handle", s.handleCreatorProfile)
	// Cloning needs an account to own the copy — the one public action that
	// asks you to sign in first (A11.1).
	g.POST("/public/trips/:tokenOrSlug/clone", s.handlePublicClone, s.JwtMiddleware)
	// The same copy, reshaped to the dates, group and budget of whoever is
	// taking it (A11.4).
	g.POST("/public/trips/:tokenOrSlug/adapt/preview", s.handleAdaptPreview, s.JwtMiddleware)
	g.POST("/public/trips/:tokenOrSlug/adapt", s.handleAdaptClone, s.JwtMiddleware)
}

/* -------------------------------------------------------------- payloads -- */

type publicCreatorDTO struct {
	Name        string  `json:"name"`
	Handle      *string `json:"handle"`
	CharacterID string  `json:"character_id"`
}

type publicTripDTO struct {
	Trip    tripDTO          `json:"trip"`
	Days    []planDayDTO     `json:"days"`
	Members []memberDTO      `json:"members"`
	Creator publicCreatorDTO `json:"creator"`
	// The social proof numbers the page shows next to the clone button.
	ViewCount  int `json:"view_count"`
	CloneCount int `json:"clone_count"`
	// How it actually went, from the people who went (A11.5). The expense
	// ledger stays out of every public payload; this is the one figure the
	// travellers themselves chose to publish.
	Reviews      reviewSummaryDTO `json:"reviews"`
	ReviewEntries []reviewDTO     `json:"review_entries"`
}

func (s *Server) publicCreatorOf(ctx contextT, ownerID string) publicCreatorDTO {
	if owner, err := s.users.GetByID(ctx, ownerID); err == nil {
		return toPublicCreatorDTO(*owner)
	}
	return unknownCreator()
}

// unknownCreator is what a trip whose owner cannot be read renders as. A public
// page must not 500 because one account row is missing.
func unknownCreator() publicCreatorDTO {
	return publicCreatorDTO{Name: "นักเดินทาง", CharacterID: defaultCharacter}
}

func toPublicCreatorDTO(owner models.User) publicCreatorDTO {
	return publicCreatorDTO{
		Name:        owner.DisplayName,
		Handle:      owner.Handle,
		CharacterID: characterOf(owner),
	}
}

// publicCreatorsFor resolves every owner on a page of trips in one query. The
// explore feed and the creator profile both render a creator per card, and
// looking each one up separately made a twelve-card page thirteen queries — and
// the creator profile, which is every card by the SAME person, one query per
// trip for a row it already had.
func (s *Server) publicCreatorsFor(ctx contextT, trips []models.Trip) map[string]publicCreatorDTO {
	out := make(map[string]publicCreatorDTO, len(trips))
	ids := make([]string, 0, len(trips))
	for _, t := range trips {
		if _, ok := out[t.OwnerID]; ok {
			continue
		}
		out[t.OwnerID] = unknownCreator()
		ids = append(ids, t.OwnerID)
	}

	owners, err := s.users.ListByIDs(ctx, ids)
	if err != nil {
		return out
	}
	for _, owner := range owners {
		out[owner.ID] = toPublicCreatorDTO(owner)
	}
	return out
}

func (s *Server) handlePublicTrip(c echo.Context) error {
	ctx := c.Request().Context()
	key := c.Param("tokenOrSlug")

	trip, err := s.trips.GetByShareToken(ctx, key)
	if err != nil {
		trip, err = s.trips.GetBySlug(ctx, key)
	}
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลนนี้")
	}
	// A trip switched back to private must stop resolving even if someone kept
	// the old URL.
	if trip.Visibility == models.VisibilityPrivate {
		return request.NotFound(c, "แพลนนี้ถูกปิดการแชร์แล้ว")
	}

	days, _ := s.plans.ListDays(ctx, trip.ID)
	items, _ := s.plans.ListItems(ctx, trip.ID)
	byDay := map[string][]models.PlanItem{}
	for _, item := range items {
		byDay[item.DayID] = append(byDay[item.DayID], item)
	}

	roster, _ := s.loadMembers(ctx, trip.ID)

	// Counted after the payload is assembled: a failed render should not
	// inflate the number.
	_ = s.trips.BumpViewCount(ctx, trip.ID)

	reviews, _ := s.reviews.ListByTrip(ctx, trip.ID)

	return c.JSON(http.StatusOK, publicTripDTO{
		Trip:          toTripDTO(*trip),
		Days:          planDayDTOs(days, byDay),
		Members:       roster.dtos(),
		Creator:       s.publicCreatorOf(ctx, trip.OwnerID),
		ViewCount:     trip.ViewCount,
		CloneCount:    trip.CloneCount,
		Reviews:       toReviewSummaryDTO(summariseReviews(reviews)),
		ReviewEntries: s.reviewDTOs(ctx, reviews),
	})
}

/* --------------------------------------------------------------- explore -- */

type exploreTripDTO struct {
	Slug               string           `json:"slug"`
	Title              string           `json:"title"`
	CoverImageURL      string           `json:"cover_image_url"`
	Cities             []string         `json:"cities"`
	Country            string           `json:"country"`
	Days               int              `json:"days"`
	BudgetPerPersonTHB float64          `json:"budget_per_person_thb"`
	ViewCount          int              `json:"view_count"`
	CloneCount         int              `json:"clone_count"`
	Creator            publicCreatorDTO `json:"creator"`
	UpdatedAt          string           `json:"updated_at"`
	// Only set when the caller asked for ?match= (A11.3).
	Match *domain.MatchResult `json:"match,omitempty"`
	// Zero until somebody who went says otherwise (A11.5).
	Reviews reviewSummaryDTO `json:"reviews"`
}

// exploreTripOf takes the creator rather than looking it up, so a page of cards
// costs one owner query instead of one per card. Build the map with
// publicCreatorsFor.
func exploreTripOf(trip models.Trip, creator publicCreatorDTO) exploreTripDTO {
	slug := ""
	if trip.Slug != nil {
		slug = *trip.Slug
	}
	return exploreTripDTO{
		Slug:               slug,
		Title:              trip.Title,
		CoverImageURL:      trip.CoverImageURL,
		Cities:             jsonStrings(toJSONRaw(trip.DestinationCities)),
		Country:            trip.DestinationCountry,
		Days:               trip.Nights() + 1,
		BudgetPerPersonTHB: trip.BudgetPerPersonTHB,
		ViewCount:          trip.ViewCount,
		CloneCount:         trip.CloneCount,
		Creator:            creator,
		UpdatedAt:          trip.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// matchPoolSize caps how many public trips are scored for one ?match= request.
// The score cannot be expressed in SQL, so ranking happens in Go over a window
// of the most popular plans rather than the whole table — which is honest while
// the catalogue is small, and the number to raise when it is not.
const matchPoolSize = 200

// withReviews fills in the rating and the real cost for a page of cards in one
// query rather than one per card.
func (s *Server) withReviews(ctx contextT, cards []exploreTripDTO, tripIDs []string) []exploreTripDTO {
	summaries, err := s.reviews.SummaryByTrips(ctx, tripIDs)
	if err != nil {
		// A missing rating is a worse card, not a failed request.
		return cards
	}
	for i := range cards {
		cards[i].Reviews = toReviewSummaryDTO(summaries[tripIDs[i]])
	}
	return cards
}

// handleExplore lists public trips (A11.2).
//
// Without ?match= it is a column sort: where, how long, roughly how much.
// With ?match=<tripId> it is ranked against a trip the caller is a member of
// (A11.3) — every card carries its score and the reasons behind it.
func (s *Server) handleExplore(c echo.Context) error {
	ctx := c.Request().Context()

	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 {
		limit = 12
	}
	if offset < 0 {
		offset = 0
	}

	filter := models.ExploreFilter{
		Query:   c.QueryParam("q"),
		Country: c.QueryParam("country"),
		Sort:    c.QueryParam("sort"),
		Limit:   limit,
		Offset:  offset,
	}

	if matchTripID := c.QueryParam("match"); matchTripID != "" {
		return s.exploreByMatch(c, filter, matchTripID)
	}

	trips, total, err := s.trips.ListPublic(ctx, filter)
	if err != nil {
		return request.Internal(c, "โหลดแพลนสาธารณะไม่สำเร็จ")
	}

	creators := s.publicCreatorsFor(ctx, trips)
	items := make([]exploreTripDTO, 0, len(trips))
	ids := make([]string, 0, len(trips))
	for _, trip := range trips {
		items = append(items, exploreTripOf(trip, creators[trip.OwnerID]))
		ids = append(ids, trip.ID)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items": s.withReviews(ctx, items, ids),
		"total": total,
	})
}

/* ----------------------------------------------------------- match (A11.3) -- */

// exploreByMatch ranks the pool against the caller's own trip.
//
// Membership is required rather than ownership: everyone in the room is
// planning the same holiday, and any of them may go looking for a plan like it.
func (s *Server) exploreByMatch(c echo.Context, filter models.ExploreFilter, matchTripID string) error {
	ctx := c.Request().Context()

	userID := request.UserID(c)
	if userID == "" {
		return request.Unauthorized(c, "ต้องเข้าสู่ระบบก่อนถึงจะเทียบกับทริปของคุณได้")
	}
	if _, err := s.members.Get(ctx, matchTripID, userID); err != nil {
		// Same answer whether the trip is someone else's or does not exist.
		return request.NotFound(c, "ไม่พบทริปที่ใช้เทียบ")
	}

	want, err := s.matchProfileOf(ctx, matchTripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริปที่ใช้เทียบ")
	}
	// The country comes from the trip being matched, unless the caller narrowed
	// it further with the country filter.
	if filter.Country == "" {
		filter.Country = want.Country
	}

	pool := filter
	pool.Limit, pool.Offset, pool.Sort = matchPoolSize, 0, "popular"

	trips, _, err := s.trips.ListPublic(ctx, pool)
	if err != nil {
		return request.Internal(c, "โหลดแพลนสาธารณะไม่สำเร็จ")
	}

	ids := make([]string, 0, len(trips))
	for _, trip := range trips {
		ids = append(ids, trip.ID)
	}
	signals, err := s.plans.TagSignals(ctx, ids)
	if err != nil {
		return request.Internal(c, "โหลดแพลนสาธารณะไม่สำเร็จ")
	}

	type scored struct {
		trip   models.Trip
		result domain.MatchResult
	}
	ranked := make([]scored, 0, len(trips))

	for _, trip := range trips {
		// A trip never matches itself, and neither does its own clone source.
		if trip.ID == matchTripID {
			continue
		}
		have := tripMatchProfile(trip, signals[trip.ID])
		result := domain.ScoreMatch(want, have)
		if result.Score == 0 {
			continue
		}
		ranked = append(ranked, scored{trip: trip, result: result})
	}

	// Popularity is the tie-break: two equally fitting plans are ordered by the
	// one more people already followed.
	sort.SliceStable(ranked, func(a, b int) bool {
		if ranked[a].result.Score != ranked[b].result.Score {
			return ranked[a].result.Score > ranked[b].result.Score
		}
		return ranked[a].trip.ViewCount+ranked[a].trip.CloneCount*5 >
			ranked[b].trip.ViewCount+ranked[b].trip.CloneCount*5
	})

	total := len(ranked)
	if filter.Offset < total {
		ranked = ranked[filter.Offset:]
	} else {
		ranked = nil
	}
	if len(ranked) > filter.Limit {
		ranked = ranked[:filter.Limit]
	}

	page := make([]models.Trip, 0, len(ranked))
	for _, row := range ranked {
		page = append(page, row.trip)
	}
	creators := s.publicCreatorsFor(ctx, page)

	items := make([]exploreTripDTO, 0, len(ranked))
	pageIDs := make([]string, 0, len(ranked))
	for _, row := range ranked {
		dto := exploreTripOf(row.trip, creators[row.trip.OwnerID])
		result := row.result
		dto.Match = &result
		items = append(items, dto)
		pageIDs = append(pageIDs, row.trip.ID)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items": s.withReviews(ctx, items, pageIDs),
		"total": total,
		// The window that was scored, so the caller knows the ranking is not
		// over the entire catalogue.
		"scored": len(trips),
	})
}

// matchProfileOf describes the caller's own trip the same way a candidate is
// described, so the scorer compares like with like. The wishlist joins in on
// this side only: it is the caller's own list, and it says what they actually
// want far better than the plan they have not drafted yet.
func (s *Server) matchProfileOf(ctx contextT, tripID string) (domain.MatchProfile, error) {
	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return domain.MatchProfile{}, err
	}

	signals, _ := s.plans.TagSignals(ctx, []string{tripID})
	tags := signals[tripID]

	if wishes, err := s.wishlist.ListByTrip(ctx, tripID); err == nil {
		for _, wish := range wishes {
			if wish.Kind == models.WishAvoid {
				continue
			}
			tags = append(tags, jsonStrings(toJSONRaw(wish.Tags))...)
		}
	}

	return tripMatchProfile(*trip, tags), nil
}

func tripMatchProfile(trip models.Trip, tags []string) domain.MatchProfile {
	return domain.MatchProfile{
		Country:            trip.DestinationCountry,
		StartDate:          trip.StartDate,
		EndDate:            trip.EndDate,
		Days:               tripDays(trip),
		BudgetPerPersonTHB: trip.BudgetPerPersonTHB,
		PartySize:          trip.PartySize,
		Tags:               append(jsonStrings(toJSONRaw(trip.DestinationCities)), tags...),
	}
}

// tripDays is the itinerary length. A trip with no dates has no length — zero
// rather than one, so the scorer treats it as unknown instead of as a day trip.
func tripDays(trip models.Trip) int {
	if trip.StartDate == nil || trip.EndDate == nil {
		return 0
	}
	return trip.Nights() + 1
}

/* --------------------------------------------------------------- creator -- */

type creatorProfileDTO struct {
	Name         string           `json:"name"`
	Handle       string           `json:"handle"`
	CharacterID  string           `json:"character_id"`
	PublicTrips  int              `json:"public_trips"`
	TotalViews   int              `json:"total_views"`
	TotalClones  int              `json:"total_clones"`
	PointsEarned int              `json:"points_earned"`
	Trips        []exploreTripDTO `json:"trips"`
}

// handleCreatorProfile is the public face of a member (W11.2): their published
// trips and what those trips have earned. Nothing private leaks here — the
// balance, the history and every unpublished trip stay behind sign-in.
func (s *Server) handleCreatorProfile(c echo.Context) error {
	ctx := c.Request().Context()
	handle := c.Param("handle")

	user, err := s.users.GetByHandle(ctx, handle)
	if err != nil || user.Status != models.UserStatusActive {
		return request.NotFound(c, "ไม่พบโปรไฟล์นี้")
	}

	trips, err := s.trips.ListPublicByOwner(ctx, user.ID)
	if err != nil {
		return request.Internal(c, "โหลดโปรไฟล์ไม่สำเร็จ")
	}

	out := creatorProfileDTO{
		Name:        user.DisplayName,
		Handle:      handle,
		CharacterID: characterOf(*user),
		Trips:       make([]exploreTripDTO, 0, len(trips)),
	}
	// Every card on this page belongs to the person the page is about, and that
	// row is already in hand — the old code looked it up once per trip.
	creator := toPublicCreatorDTO(*user)
	ids := make([]string, 0, len(trips))
	for _, trip := range trips {
		out.PublicTrips++
		out.TotalViews += trip.ViewCount
		out.TotalClones += trip.CloneCount
		out.Trips = append(out.Trips, exploreTripOf(trip, creator))
		ids = append(ids, trip.ID)
	}
	out.Trips = s.withReviews(ctx, out.Trips, ids)
	out.PointsEarned, _ = s.points.Earned(ctx, user.ID)

	return c.JSON(http.StatusOK, out)
}

/* ----------------------------------------------------------------- clone -- */

// handlePublicClone copies a published trip into the signed-in user's account
// (A11.1). The membership-scoped clone route stays for members; this one is
// how a stranger follows a plan they found.
func (s *Server) handlePublicClone(c echo.Context) error {
	ctx := c.Request().Context()
	key := c.Param("tokenOrSlug")

	trip, err := s.trips.GetByShareToken(ctx, key)
	if err != nil {
		trip, err = s.trips.GetBySlug(ctx, key)
	}
	if err != nil || trip.Visibility == models.VisibilityPrivate {
		return request.NotFound(c, "ไม่พบแพลนนี้")
	}

	copyTrip, err := s.cloneTripForUser(ctx, trip, request.UserID(c))
	if err != nil {
		return request.Internal(c, "คัดลอกทริปไม่สำเร็จ")
	}

	// Tell the source room someone followed their plan — that is the loop the
	// whole public model runs on (§6.5).
	_ = s.collab.Log(ctx, &models.Activity{
		TripID: trip.ID,
		UserID: trip.OwnerID,
		Text:   "มีคนคัดลอกทริปนี้ไปเที่ยวตาม 🎉",
	})

	return c.JSON(http.StatusCreated, toTripDTO(*copyTrip))
}

/* ------------------------------------------------------ adapt (A11.4) ---- */

// Copying a plan built for a different group used to hand you six days for
// four people whether or not that was your trip. These two endpoints reshape
// it: /adapt/preview shows what would change and writes nothing, /adapt does
// the copy with the changes already applied.
//
// The reshaping itself is pkg/domain.AdaptPlan — deterministic, so the preview
// and the copy cannot disagree.

type adaptRequest struct {
	// Zero means "keep what the source had".
	Days               int     `json:"days"`
	PartySize          int     `json:"party_size"`
	BudgetPerPersonTHB float64 `json:"budget_per_person_thb"`
	StartDate          string  `json:"start_date"`
}

type adaptDiffDTO struct {
	Changes  []domain.AdaptChange `json:"changes"`
	Before   domain.AdaptTotals   `json:"before"`
	After    domain.AdaptTotals   `json:"after"`
	Warnings []string             `json:"warnings"`
	// Costs in the diff are in the destination currency, like the plan itself.
	Currency string `json:"currency"`
}

type adaptCloneDTO struct {
	Trip tripDTO      `json:"trip"`
	Diff adaptDiffDTO `json:"diff"`
}

func (s *Server) handleAdaptPreview(c echo.Context) error {
	ctx := c.Request().Context()

	trip, err := s.publicTripByKey(ctx, c.Param("tokenOrSlug"))
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลนนี้")
	}

	var req adaptRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}

	days, _ := s.plans.ListDays(ctx, trip.ID)
	items, _ := s.plans.ListItems(ctx, trip.ID)

	result := domain.AdaptPlan(adaptDaysOf(days, items), adaptOptionsOf(*trip, req))

	return c.JSON(http.StatusOK, adaptDiffOf(*trip, result))
}

// handleAdaptClone is the clone route with the reshaping applied. It is its own
// endpoint rather than a flag on /clone so that a plain copy stays a plain
// copy — the two have different answers to "what did I just get?".
func (s *Server) handleAdaptClone(c echo.Context) error {
	ctx := c.Request().Context()

	trip, err := s.publicTripByKey(ctx, c.Param("tokenOrSlug"))
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลนนี้")
	}

	var req adaptRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}

	userID := request.UserID(c)
	copyTrip, err := s.cloneTripForUser(ctx, trip, userID)
	if err != nil {
		return request.Internal(c, "คัดลอกทริปไม่สำเร็จ")
	}

	// Reshape the copy, never the original: the published plan belongs to
	// somebody else and this endpoint does not touch it.
	days, _ := s.plans.ListDays(ctx, copyTrip.ID)
	items, _ := s.plans.ListItems(ctx, copyTrip.ID)
	result := domain.AdaptPlan(adaptDaysOf(days, items), adaptOptionsOf(*trip, req))

	if err := s.writeAdapted(ctx, copyTrip, userID, days, items, result, req); err != nil {
		return request.Internal(c, "ปรับแพลนไม่สำเร็จ")
	}

	_ = s.collab.Log(ctx, &models.Activity{
		TripID: trip.ID,
		UserID: trip.OwnerID,
		Text:   "มีคนคัดลอกทริปนี้ไปปรับให้เข้ากับกลุ่มตัวเอง 🎉",
	})

	return c.JSON(http.StatusCreated, adaptCloneDTO{
		Trip: toTripDTO(*copyTrip),
		Diff: adaptDiffOf(*copyTrip, result),
	})
}

// publicTripByKey resolves the share token or the public slug — the same two
// keys every public route accepts.
func (s *Server) publicTripByKey(ctx contextT, key string) (*models.Trip, error) {
	trip, err := s.trips.GetByShareToken(ctx, key)
	if err != nil {
		trip, err = s.trips.GetBySlug(ctx, key)
	}
	if err != nil {
		return nil, err
	}
	if trip.Visibility == models.VisibilityPrivate {
		return nil, echo.ErrNotFound
	}
	return trip, nil
}

func adaptDaysOf(days []models.PlanDay, items []models.PlanItem) []domain.AdaptDay {
	byDay := map[string][]models.PlanItem{}
	for _, item := range items {
		byDay[item.DayID] = append(byDay[item.DayID], item)
	}

	out := make([]domain.AdaptDay, 0, len(days))
	for _, day := range days {
		stops := make([]domain.AdaptItem, 0, len(byDay[day.ID]))
		for _, item := range byDay[day.ID] {
			cost := 0.0
			if item.CostJPY != nil {
				cost = *item.CostJPY
			}
			stops = append(stops, domain.AdaptItem{
				ID:       item.ID,
				Title:    item.Title,
				Type:     item.Type,
				CostDest: cost,
				Bookable: item.Bookable,
				HasPOI:   item.POIID != nil && *item.POIID != "",
			})
		}
		out = append(out, domain.AdaptDay{Label: day.Label, City: day.City, Items: stops})
	}
	return out
}

func adaptOptionsOf(source models.Trip, req adaptRequest) domain.AdaptOptions {
	opt := domain.AdaptOptions{
		Days:          req.Days,
		PartySize:     req.PartySize,
		FromPartySize: source.PartySize,
	}
	// The traveller thinks in baht; the plan is priced in yen. Converting here
	// keeps the domain in one currency and the arithmetic in one place.
	if req.BudgetPerPersonTHB > 0 {
		if rate := tripFxRate(source); rate > 0 {
			opt.BudgetPerPersonDest = req.BudgetPerPersonTHB / rate
		}
	}
	return opt
}

func adaptDiffOf(trip models.Trip, result domain.AdaptResult) adaptDiffDTO {
	changes := result.Changes
	if changes == nil {
		changes = []domain.AdaptChange{}
	}
	warnings := result.Warnings
	if warnings == nil {
		warnings = []string{}
	}
	return adaptDiffDTO{
		Changes:  changes,
		Before:   result.Before,
		After:    result.After,
		Warnings: warnings,
		Currency: trip.DestCurrency,
	}
}

// writeAdapted rebuilds the copy from the adapted shape and moves the trip
// frame with it. Stops are carried over by id, so each keeps its cost, its
// booking flag and its note — only where it sits changes.
func (s *Server) writeAdapted(
	ctx contextT,
	copyTrip *models.Trip,
	userID string,
	days []models.PlanDay,
	items []models.PlanItem,
	result domain.AdaptResult,
	req adaptRequest,
) error {
	plan, err := s.plans.EnsurePlan(ctx, copyTrip.ID, userID)
	if err != nil {
		return err
	}

	byID := make(map[string]models.PlanItem, len(items))
	for _, item := range items {
		byID[item.ID] = item
	}

	start := time.Time{}
	if parsed, ok := parseDateParam(req.StartDate); ok {
		start = parsed
	} else if copyTrip.StartDate != nil {
		start = *copyTrip.StartDate
	} else if len(days) > 0 {
		start = days[0].Date
	}

	newDays := make([]models.PlanDay, 0, len(result.Days))
	newItems := map[string][]models.PlanItem{}

	for i, day := range result.Days {
		dayID := uuid.NewString()
		// Weather is deliberately not carried over: it belonged to the source
		// trip's dates and would now be a forecast for the wrong week.
		newDays = append(newDays, models.PlanDay{
			Base:     models.Base{ID: dayID},
			PlanID:   plan.ID,
			TripID:   copyTrip.ID,
			DayIndex: i,
			Date:     start.AddDate(0, 0, i),
			Label:    day.Label,
			City:     day.City,
		})

		stops := make([]models.PlanItem, 0, len(day.Items))
		for order, stop := range day.Items {
			item, ok := byID[stop.ID]
			if !ok {
				continue
			}
			item.DayID = dayID
			item.SortOrder = order
			stops = append(stops, item)
		}
		newItems[dayID] = stops
	}

	if err := s.plans.ReplaceDays(ctx, copyTrip.ID, newDays, newItems); err != nil {
		return err
	}

	if req.PartySize > 0 {
		copyTrip.PartySize = req.PartySize
	}
	if req.BudgetPerPersonTHB > 0 {
		copyTrip.BudgetPerPersonTHB = req.BudgetPerPersonTHB
	}
	if len(newDays) > 0 {
		first := newDays[0].Date
		last := newDays[len(newDays)-1].Date
		copyTrip.StartDate = &first
		copyTrip.EndDate = &last
	}

	return s.trips.Update(ctx, copyTrip)
}
