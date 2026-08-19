package api

import "github.com/labstack/echo/v4"

// registerPublicRoutes registers the public endpoints.
//
// TODO(A11.x — DEV_SPEC §5.8): not implemented yet.
//
// Planned routes:
//
//	GET  /public/plans/:slug          respects the trip privacy settings
//	GET  /public/explore?city=&days=&month=&budget=&tags=&sort=
//	POST /public/plans/:slug/view     fire-and-forget view counter
//
//	These are the only routes that may be read without a token — use OptionalJwt so
//	a logged-in visitor still gets personalised data, and never expose member
//	emails or private notes here.
func (s *Server) registerPublicRoutes(g *echo.Group) {
	_ = g
}
