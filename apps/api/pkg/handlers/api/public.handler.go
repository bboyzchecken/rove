package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

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
	g.GET("/public/explore", s.handleExplore)
	g.GET("/public/creators/:handle", s.handleCreatorProfile)
	// Cloning needs an account to own the copy — the one public action that
	// asks you to sign in first (A11.1).
	g.POST("/public/trips/:tokenOrSlug/clone", s.handlePublicClone, s.JwtMiddleware)
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
}

func (s *Server) publicCreatorOf(ctx contextT, ownerID string) publicCreatorDTO {
	creator := publicCreatorDTO{Name: "นักเดินทาง", CharacterID: "shiba"}
	if owner, err := s.users.GetByID(ctx, ownerID); err == nil {
		creator.Name = owner.DisplayName
		creator.Handle = owner.Handle
		if owner.CharacterID != nil && *owner.CharacterID != "" {
			creator.CharacterID = *owner.CharacterID
		}
	}
	return creator
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

	return c.JSON(http.StatusOK, publicTripDTO{
		Trip:       toTripDTO(*trip),
		Days:       planDayDTOs(days, byDay),
		Members:    roster.dtos(),
		Creator:    s.publicCreatorOf(ctx, trip.OwnerID),
		ViewCount:  trip.ViewCount,
		CloneCount: trip.CloneCount,
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
}

func (s *Server) exploreTripOf(ctx contextT, trip models.Trip) exploreTripDTO {
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
		Creator:            s.publicCreatorOf(ctx, trip.OwnerID),
		UpdatedAt:          trip.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// handleExplore lists public trips (A11.2). Filters are deliberately the ones
// a traveller actually asks — where, how long, roughly how much — and the
// ranked, points-weighted feed remains a later story.
func (s *Server) handleExplore(c echo.Context) error {
	ctx := c.Request().Context()

	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))

	trips, total, err := s.trips.ListPublic(ctx, models.ExploreFilter{
		Query:   c.QueryParam("q"),
		Country: c.QueryParam("country"),
		Sort:    c.QueryParam("sort"),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		return request.Internal(c, "โหลดแพลนสาธารณะไม่สำเร็จ")
	}

	items := make([]exploreTripDTO, 0, len(trips))
	for _, trip := range trips {
		items = append(items, s.exploreTripOf(ctx, trip))
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items": items,
		"total": total,
	})
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
		CharacterID: "shiba",
		Trips:       make([]exploreTripDTO, 0, len(trips)),
	}
	if user.CharacterID != nil && *user.CharacterID != "" {
		out.CharacterID = *user.CharacterID
	}
	for _, trip := range trips {
		out.PublicTrips++
		out.TotalViews += trip.ViewCount
		out.TotalClones += trip.CloneCount
		out.Trips = append(out.Trips, s.exploreTripOf(ctx, trip))
	}
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
