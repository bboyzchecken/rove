package api

import "github.com/labstack/echo/v4"

// registerBudgetRoutes registers the budget endpoints.
//
// TODO(A7.x — DEV_SPEC §5.5): not implemented yet.
//
// Planned routes:
//
//	GET    /plans/:planId/budget   by category + per person + prepaid split
//	                              logic lives in pkg/domain/budget.go
func (s *Server) registerBudgetRoutes(g *echo.Group) {
	_ = g
}
