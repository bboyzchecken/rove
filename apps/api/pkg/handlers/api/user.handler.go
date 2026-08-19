package api

import "github.com/labstack/echo/v4"

// registerUserRoutes registers the user endpoints.
//
// TODO(A3.1 — DEV_SPEC §5.3): not implemented yet.
//
// Planned routes:
//
//	GET    /users/me
//	PATCH  /users/me            display_name, handle, locale, home_currency
func (s *Server) registerUserRoutes(g *echo.Group) {
	_ = g
}
