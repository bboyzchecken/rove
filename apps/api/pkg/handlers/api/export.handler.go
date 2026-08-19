package api

import "github.com/labstack/echo/v4"

// registerExportRoutes registers the export endpoints.
//
// TODO(A10.x — DEV_SPEC §5.8): not implemented yet.
//
// Planned routes:
//
//	POST /trips/:tripId/export   {format: 'html'|'pdf'} -> {job_id}
//	GET  /exports/:id            -> signed R2 url
func (s *Server) registerExportRoutes(g *echo.Group) {
	_ = g
}
