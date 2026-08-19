package api

import "github.com/labstack/echo/v4"

// registerTripRoutes registers the trip endpoints.
//
// TODO(A1.1 / A2.1 — DEV_SPEC §5.2): not implemented yet.
//
// Planned routes:
//
//	POST   /trips                    entry_type: date|city|ticket|clone
//	GET    /trips                    my trips (paginated)
//	GET    /trips/:tripId            overview payload   [viewer]
//	PATCH  /trips/:tripId            edit frame         [editor]
//	DELETE /trips/:tripId                               [owner]
//	POST   /trips/:tripId/flights                       [editor]
//	PATCH  /trips/:tripId/visibility                    [owner]
//	POST   /trips/:tripId/clone      -> new trip
func (s *Server) registerTripRoutes(g *echo.Group) {
	_ = g
}
