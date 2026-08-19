package api

import "github.com/labstack/echo/v4"

// registerAuthRoutes registers the auth endpoints.
//
// TODO(A0.4 / A0.5 — DEV_SPEC §5.1): not implemented yet.
//
// Planned routes:
//
//	POST   /auth/oauth/line     {code, redirect_uri} -> {token, user}
//	POST   /auth/oauth/google   {code, redirect_uri} -> {token, user}
//	POST   /auth/login          email+password (dev/admin only)
//	GET    /auth/me             [jwt]
//	POST   /auth/refresh        [jwt]
func (s *Server) registerAuthRoutes(g *echo.Group) {
	_ = g
}
