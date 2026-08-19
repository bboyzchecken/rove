package api

import "github.com/labstack/echo/v4"

// registerBookingRoutes registers the booking endpoints.
//
// TODO(A12.x — DEV_SPEC §5.8): not implemented yet.
//
// Planned routes:
//
//	POST /items/:itemId/booking-link     -> {tracking_id, redirect_url}
//	POST /items/:itemId/booking-status   {status}
//	GET  /trips/:tripId/bookings
//
//	Registered outside this group (no auth):
//	GET  /go/:trackingId                 302 -> partner, records the click
//	POST /webhooks/affiliate/:partner    verify signature before trusting
func (s *Server) registerBookingRoutes(g *echo.Group) {
	_ = g
}
