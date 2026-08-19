package api

import "github.com/labstack/echo/v4"

// registerPlanRoutes registers the plan endpoints.
//
// TODO(A4.8 / A5.x — DEV_SPEC §5.4): not implemented yet.
//
// Planned routes:
//
//	GET    /trips/:tripId/plans            list variants   [viewer]
//	POST   /trips/:tripId/plans            fork / copy     [editor]
//	GET    /plans/:planId                  full plan (days + items + rationales)
//	PATCH  /plans/:planId                                  [editor]
//	DELETE /plans/:planId                                  [editor]
//	POST   /plans/:planId/freeze           set final       [owner]
//	POST   /plans/:planId/snapshot         version++       [editor]
//	GET    /plans/:planId/validate         issues[] (pkg/domain/validate.go)
func (s *Server) registerPlanRoutes(g *echo.Group) {
	_ = g
}
