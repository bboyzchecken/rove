package api

import "github.com/labstack/echo/v4"

// registerCollaborationRoutes registers the comment endpoints.
//
// TODO(A9.x — DEV_SPEC §5.6): not implemented yet.
//
// Planned routes:
//
//	GET    /trips/:tripId/comments?target_type=&target_id=
//	POST   /trips/:tripId/comments
//	DELETE /comments/:id
//	POST   /votes                    {target_type, target_id, choice, reason}
//	GET    /trips/:tripId/activity   activity feed (cursor paginated)
func (s *Server) registerCollaborationRoutes(g *echo.Group) {
	_ = g
}
