package api

import (
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
)

// registerPOIRoutes exposes the catalogue (DEV_SPEC §5.11).
//
//	GET  /pois/search?q=&city=&category=   [none — the catalogue is public data]
//	GET  /pois/:id                         [none]
//	POST /pois/resolve                     [jwt] paste a Google Maps URL
func (s *Server) registerPOIRoutes(g *echo.Group) {
	pois := g.Group("/pois")

	// Search is unauthenticated so the landing page can suggest places, but it
	// is also the cheapest endpoint to scrape, hence its own limit.
	pois.GET("/search", s.handleSearchPOI,
		s.OptionalJwt,
		s.RateLimit(RateLimitConfig{Key: "poi", Limit: 120, Window: time.Minute}))
	pois.GET("/:id", s.handleGetPOI, s.OptionalJwt)
	pois.POST("/resolve", s.handleResolvePOI, s.JwtMiddleware,
		s.RateLimit(RateLimitConfig{Key: "poi-resolve", Limit: 30, Window: time.Minute}))
}

func (s *Server) handleSearchPOI(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	limit := atoiDefault(c.QueryParam("limit"), 10)

	results, err := s.pois.Search(c.Request().Context(), q,
		strings.ToLower(c.QueryParam("city")), c.QueryParam("area"), limit)
	if err != nil {
		return request.Internal(c, "ค้นหาสถานที่ไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": results})
}

func (s *Server) handleGetPOI(c echo.Context) error {
	poi, err := s.pois.GetByID(c.Request().Context(), c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบสถานที่")
	}
	return request.OK(c, poi)
}

type resolvePOIRequest struct {
	GoogleMapsURL string `json:"google_maps_url" validate:"omitempty,url"`
	PlaceID       string `json:"place_id" validate:"omitempty,max=200"`
	Text          string `json:"text" validate:"omitempty,max=200"`
}

// handleResolvePOI backs "paste a Google Maps link" in the add-item flow
// (A5.3). It tries our own catalogue first: a place we already know has curated
// tips and opening hours that a fresh Places lookup does not.
func (s *Server) handleResolvePOI(c echo.Context) error {
	var req resolvePOIRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c, 15*time.Second)
	defer cancel()

	if req.Text != "" {
		if found, err := s.pois.Search(ctx, req.Text, "", "", 1); err == nil && len(found) > 0 {
			return request.OK(c, map[string]any{"poi": found[0], "source": "catalogue"})
		}
	}
	if req.PlaceID != "" {
		if found, err := s.pois.GetByPlaceID(ctx, req.PlaceID); err == nil {
			return request.OK(c, map[string]any{"poi": found, "source": "catalogue"})
		}
	}

	raw := firstNonEmpty(req.GoogleMapsURL, req.PlaceID)
	if raw == "" {
		return request.NotFound(c, "ไม่พบสถานที่ที่ตรงกับที่ค้นหา")
	}

	poi, err := s.aiTools.ResolveFromURL(ctx, raw)
	if err != nil {
		return request.BadRequest(c, "อ่านลิงก์ Google Maps ไม่สำเร็จ — ลองวางลิงก์แบบเต็ม")
	}
	return request.OK(c, map[string]any{"poi": poi, "source": "google"})
}
