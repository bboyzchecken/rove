package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/airports"
)

// Airport search (A1.3 — M1 W1.3).
//
// Deliberately outside the JWT group: the entry flow lets someone build the
// route before they sign in, exactly like a flight-booking search does, and the
// index is public reference data with nothing user-scoped in it.
func (s *Server) registerAirportRoutes(g *echo.Group) {
	g.GET("/airports", s.handleSearchAirports)
	g.GET("/airports/:iata", s.handleGetAirport)
}

func (s *Server) handleSearchAirports(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	found := s.airports.Search(c.QueryParam("q"), limit)

	// Always an array: the picker renders "ไม่พบสนามบิน" from an empty list.
	out := make([]airports.Airport, 0, len(found))
	out = append(out, found...)
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleGetAirport(c echo.Context) error {
	airport := s.airports.Get(c.Param("iata"))
	if airport == nil {
		return request.NotFound(c, "ไม่พบสนามบินรหัสนี้")
	}
	return c.JSON(http.StatusOK, airport)
}
