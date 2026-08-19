package api

import "github.com/labstack/echo/v4"

// registerPOIRoutes registers the poi endpoints.
//
// TODO(A4.2 — DEV_SPEC §5.8): not implemented yet.
//
// Planned routes:
//
//	GET  /pois/search?q=&city=&category=   FULLTEXT + redis cache
//	GET  /pois/:id
//	POST /pois/resolve                     {google_maps_url|place_id|text} -> POI
func (s *Server) registerPOIRoutes(g *echo.Group) {
	_ = g
}
