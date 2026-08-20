package api

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// POI lookup (A4.2 / A5.3). The catalogue is ours; Google is only consulted
// when someone pastes a link to a place we have never heard of.
func (s *Server) registerPOIRoutes(g *echo.Group) {
	g.GET("/poi/search", s.handleSearchPOI, s.JwtMiddleware)
	g.GET("/poi/:poiId", s.handleGetPOI, s.JwtMiddleware)
	g.POST("/poi/resolve", s.handleResolvePOI, s.JwtMiddleware)
}

func (s *Server) handleSearchPOI(c echo.Context) error {
	pois, err := s.pois.Search(
		c.Request().Context(),
		c.QueryParam("q"),
		c.QueryParam("city"),
		c.QueryParam("area"),
		20,
	)
	if err != nil {
		return request.Internal(c, "ค้นหาสถานที่ไม่สำเร็จ")
	}

	out := make([]poiDTO, 0, len(pois))
	for _, p := range pois {
		out = append(out, toPOIDTO(p))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleGetPOI(c echo.Context) error {
	poi, err := s.pois.GetByID(c.Request().Context(), c.Param("poiId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบสถานที่นี้")
	}
	return c.JSON(http.StatusOK, toPOIDTO(*poi))
}

type resolvePOIRequest struct {
	// A Google Maps URL, a place_id, or just what someone typed.
	Query string `json:"query" validate:"required"`
	City  string `json:"city"`
}

// handleResolvePOI turns "whatever the user pasted" into a POI (A5.3).
//
// Our own catalogue is tried first, because a POI we already know has opening
// hours and a cost the AI is allowed to quote. Google is the fallback, and
// anything that comes back from it is stored as unverified.
func (s *Server) handleResolvePOI(c echo.Context) error {
	var req resolvePOIRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	query := strings.TrimSpace(req.Query)

	if found, err := s.pois.Search(ctx, query, req.City, "", 1); err == nil && len(found) > 0 {
		return c.JSON(http.StatusOK, toPOIDTO(found[0]))
	}

	placeID := extractPlaceID(query)
	if placeID != "" {
		if place, err := s.places.Get(ctx, placeID); err == nil && place != nil {
			return c.JSON(http.StatusOK, s.storeExternalPlace(ctx, place.Name, place.PlaceID, place.Lat, place.Lng, req.City))
		}
	}

	if candidates, err := s.places.Lookup(ctx, query); err == nil && len(candidates) > 0 {
		place := candidates[0]
		return c.JSON(http.StatusOK, s.storeExternalPlace(ctx, place.Name, place.PlaceID, place.Lat, place.Lng, req.City))
	}

	// Nothing matched anywhere. Rather than 404, hand back a free-text POI the
	// editor can still put on the timeline — the user knows where they mean.
	return c.JSON(http.StatusOK, poiDTO{
		NameTH:   query,
		City:     req.City,
		Category: "อื่นๆ",
		Tags:     []string{"ยังไม่ยืนยัน"},
	})
}

// storeExternalPlace records a Google result in our own table so the next
// lookup is free — and marks it unverified, because nobody has checked its
// opening hours or price.
func (s *Server) storeExternalPlace(ctx contextT, name, placeID string, lat, lng float64, city string) poiDTO {
	poi := models.POI{
		NameTH:        name,
		NameEN:        name,
		City:          city,
		Category:      "อื่นๆ",
		Lat:           &lat,
		Lng:           &lng,
		GooglePlaceID: placeID,
		Source:        "google",
		IsActive:      true,
		Tags:          jsonArray([]string{"ยังไม่ยืนยัน"}),
	}
	if err := s.pois.Create(ctx, &poi); err != nil {
		// Failing to cache it is not a reason to fail the request.
		return toPOIDTO(poi)
	}
	return toPOIDTO(poi)
}

// extractPlaceID pulls a place_id out of a pasted Google Maps URL, or accepts
// one that was pasted directly.
func extractPlaceID(query string) string {
	if strings.HasPrefix(query, "ChIJ") && !strings.Contains(query, " ") {
		return query
	}
	if idx := strings.Index(query, "place_id="); idx >= 0 {
		rest := query[idx+len("place_id="):]
		if end := strings.IndexAny(rest, "&#? "); end >= 0 {
			return rest[:end]
		}
		return rest
	}
	return ""
}
