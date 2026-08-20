package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Public read-only views (M10 — A10.1).
//
// One handler serves both /s/:token (unlisted link) and /p/:slug (indexed
// page): the payload is identical, and the only difference is how you found
// it. Expenses are never included, at any visibility — that is a rule of the
// endpoint, not a setting (W16.5).
func (s *Server) registerPublicRoutes(g *echo.Group) {
	g.GET("/public/trips/:tokenOrSlug", s.handlePublicTrip)
	g.GET("/public/explore", s.handleExplore)
}

type publicTripDTO struct {
	Trip    tripDTO      `json:"trip"`
	Days    []planDayDTO `json:"days"`
	Members []memberDTO  `json:"members"`
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
		Trip:    toTripDTO(*trip),
		Days:    planDayDTOs(days, byDay),
		Members: roster.dtos(),
	})
}

// handleExplore lists public trips. Phase 1 keeps it deliberately plain — the
// ranked, points-driven feed is Phase 2 (M11), and shipping an empty version of
// it now would just be a page nobody visits twice.
func (s *Server) handleExplore(c echo.Context) error {
	return c.JSON(http.StatusOK, []tripDTO{})
}
