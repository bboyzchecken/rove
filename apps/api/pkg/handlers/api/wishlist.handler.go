package api

import "github.com/labstack/echo/v4"

// registerWishlistRoutes registers the wishlist endpoints.
//
// TODO(A3.2 / A3.4 — DEV_SPEC §5.3): not implemented yet.
//
// Planned routes:
//
//	GET    /trips/:tripId/wishlist          all items + coverage   [viewer]
//	POST   /trips/:tripId/wishlist          own items only         [editor]
//	PATCH  /trips/:tripId/wishlist/:id
//	DELETE /trips/:tripId/wishlist/:id
//	GET    /trips/:tripId/profile/me
//	PUT    /trips/:tripId/profile/me
//	GET    /trips/:tripId/coverage          computed live (pkg/domain/coverage.go)
func (s *Server) registerWishlistRoutes(g *echo.Group) {
	_ = g
}
