package api

import "github.com/labstack/echo/v4"

// registerAdminRoutes registers the admin endpoints.
//
// TODO(A13.x — DEV_SPEC §10 M13): not implemented yet.
//
// Planned routes:
//
//	GET   /admin/pois          list / search
//	POST  /admin/pois          create
//	PATCH /admin/pois/:id      edit, toggle is_active
//	GET   /admin/trips         moderation queue
//	GET   /admin/ai-jobs       token + cost dashboard
func (s *Server) registerAdminRoutes(g *echo.Group) {
	_ = g
}
