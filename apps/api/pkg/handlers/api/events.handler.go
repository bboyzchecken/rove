package api

import "github.com/labstack/echo/v4"

// registerEventRoutes registers the events endpoints.
//
// TODO(A2.5 — DEV_SPEC §5.9): not implemented yet.
//
// Planned routes:
//
//	GET /trips/:tripId/events    SSE stream
//
//	Redis pub/sub channel "trip:{tripId}". Every mutation anywhere in the API
//	publishes {type, target_type, target_id, actor_id, ts}. Heartbeat every 20s;
//	the browser EventSource reconnects on its own.
func (s *Server) registerEventRoutes(g *echo.Group) {
	_ = g
}
