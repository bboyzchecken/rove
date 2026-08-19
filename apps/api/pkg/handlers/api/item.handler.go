package api

import "github.com/labstack/echo/v4"

// registerItemRoutes registers the item endpoints.
//
// TODO(A5.x — DEV_SPEC §5.4): not implemented yet.
//
// Planned routes:
//
//	POST   /plans/:planId/days
//	POST   /plans/:planId/items
//	PATCH  /items/:itemId
//	POST   /items/:itemId/move       {day_id, position}
//	DELETE /items/:itemId
//	POST   /items/:itemId/undo       restore from item_versions
func (s *Server) registerItemRoutes(g *echo.Group) {
	_ = g
}
