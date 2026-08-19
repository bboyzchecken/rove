package api

import "github.com/labstack/echo/v4"

// registerMemberRoutes registers the member endpoints.
//
// TODO(A2.2 / A2.3 — DEV_SPEC §5.2): not implemented yet.
//
// Planned routes:
//
//	POST   /trips/:tripId/invites                  [owner]
//	POST   /invites/:token/accept
//	GET    /trips/:tripId/members                   [viewer]
//	PATCH  /trips/:tripId/members/:userId           [owner]
//	DELETE /trips/:tripId/members/:userId           [owner]
func (s *Server) registerMemberRoutes(g *echo.Group) {
	_ = g
}
