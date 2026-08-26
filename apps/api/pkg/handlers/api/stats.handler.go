package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Platform social proof (M24 — A24.1 / A24.2).
//
// Everything the product could say about itself so far was per-trip
// (`ReviewStore.SummaryByTrips`) or per-creator (`/public/creators/:handle`).
// A stranger landing on the home page saw neither. These two endpoints are the
// aggregate, and they are public because that is the only place the numbers
// are of any use.
//
// The rule the UI must keep: real numbers or no section. Nothing here rounds
// up, pads, or invents — a young install returns small numbers and the page is
// expected to hide itself rather than dress them up (W24.1).
func (s *Server) registerStatsRoutes(g *echo.Group) {
	g.GET("/public/stats", s.handlePublicStats)
	g.GET("/public/reviews/recent", s.handleRecentPublicReviews)
}

type publicStatsDTO struct {
	// People who have started at least one trip. Signing up is not planning.
	Planners int64 `json:"planners"`
	// Plans their owners chose to publish.
	PublicTrips int64 `json:"public_trips"`
	// Copies of somebody else's plan that still exist.
	Clones        int64   `json:"clones"`
	Reviews       int64   `json:"reviews"`
	AverageRating float64 `json:"average_rating"`
	// When these numbers were computed — they are cached, and a page that
	// shows a total should be able to say how fresh it is.
	ComputedAt string `json:"computed_at"`
}

// publicStatsCacheKey / publicStatsTTL — the landing page calls this on every
// visit by every anonymous visitor, so it must never become four COUNT(*)
// queries per request. Ten minutes: these are trust numbers, not a live
// counter, and nobody has ever refreshed a home page to watch one tick.
const (
	publicStatsCacheKey = "public:stats"
	publicStatsTTL      = 10 * time.Minute
)

func (s *Server) handlePublicStats(c echo.Context) error {
	ctx := c.Request().Context()

	if cached, ok := s.cachedPublicStats(ctx); ok {
		return c.JSON(http.StatusOK, cached)
	}

	planners, err := s.trips.CountPlanners(ctx)
	if err != nil {
		return request.Internal(c, "โหลดสถิติไม่สำเร็จ")
	}
	publicTrips, err := s.trips.CountPublic(ctx)
	if err != nil {
		return request.Internal(c, "โหลดสถิติไม่สำเร็จ")
	}
	clones, err := s.trips.CountClones(ctx)
	if err != nil {
		return request.Internal(c, "โหลดสถิติไม่สำเร็จ")
	}
	reviews, err := s.reviews.Platform(ctx)
	if err != nil {
		return request.Internal(c, "โหลดสถิติไม่สำเร็จ")
	}

	out := publicStatsDTO{
		Planners:      planners,
		PublicTrips:   publicTrips,
		Clones:        clones,
		Reviews:       reviews.Count,
		AverageRating: reviews.AverageRating,
		ComputedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	s.cachePublicStats(ctx, out)

	return c.JSON(http.StatusOK, out)
}

// cachedPublicStats reads the cache, and treats every failure as a miss: a
// landing page must not go down because Redis did.
func (s *Server) cachedPublicStats(ctx contextT) (publicStatsDTO, bool) {
	if s.redis == nil {
		return publicStatsDTO{}, false
	}
	raw, err := s.redis.Get(ctx, publicStatsCacheKey).Bytes()
	if err != nil || len(raw) == 0 {
		return publicStatsDTO{}, false
	}

	var out publicStatsDTO
	if err := json.Unmarshal(raw, &out); err != nil {
		return publicStatsDTO{}, false
	}
	return out, true
}

func (s *Server) cachePublicStats(ctx contextT, stats publicStatsDTO) {
	if s.redis == nil {
		return
	}
	raw, err := json.Marshal(stats)
	if err != nil {
		return
	}
	if err := s.redis.Set(ctx, publicStatsCacheKey, raw, publicStatsTTL).Err(); err != nil {
		logger.L().WithError(err).Debug("public stats: cache write failed")
	}
}

/* ------------------------------------------------ recent reviews (A24.2) -- */

// recentReviewsLimit is what a testimonial strip can actually show. The store
// clamps too, so a hand-typed ?limit= cannot turn this into a table scan.
const recentReviewsLimit = 12

// handleRecentPublicReviews returns reviews written by people who went, about
// trips their owners published.
//
// The expense ledger stays out of this payload exactly as it stays out of
// every other public one (W16.5): `actual_budget_per_person` is the single
// figure a reviewer chose to publish about their own trip, and it is the only
// money that appears here.
func (s *Server) handleRecentPublicReviews(c echo.Context) error {
	ctx := c.Request().Context()

	reviews, err := s.reviews.ListRecentPublic(ctx, recentReviewsLimit)
	if err != nil {
		return request.Internal(c, "โหลดรีวิวไม่สำเร็จ")
	}
	if reviews == nil {
		reviews = []models.PublicReview{}
	}

	return c.JSON(http.StatusOK, map[string]any{"items": reviews})
}
