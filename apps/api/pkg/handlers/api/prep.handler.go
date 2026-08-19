package api

import "github.com/labstack/echo/v4"

// registerPrepRoutes registers the prep endpoints.
//
// TODO(A8.x — DEV_SPEC §5.5): not implemented yet.
//
// Planned routes:
//
//	GET    /trips/:tripId/prep
//	POST   /trips/:tripId/prep              custom block
//	PATCH  /prep/:blockId                   edit / tick checklist
//	POST   /trips/:tripId/prep/regenerate   refresh weather + packing
func (s *Server) registerPrepRoutes(g *echo.Group) {
	_ = g
}
