package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// The route of a trip (M1 — A1.3).
//
// Legs are the detail the "I already know where I am going" group starts from:
// BKK→NRT arriving 08:05 on 4 Dec, NRT→BKK arriving 22:05 on 10 Dec. Everything
// else about the frame — the dates, the destinations, how many countries, how
// many nights in each — is derived from them, so these endpoints are also what
// keeps the trip frame honest.
func (s *Server) registerFlightRoutes(g *echo.Group) {
	g.GET("/:tripId/flights", s.handleListFlights, s.TripRoleMiddleware(models.TripRoleViewer))
	g.POST("/:tripId/flights", s.handleCreateFlight, s.TripRoleMiddleware(models.TripRoleEditor))
	g.PUT("/:tripId/flights", s.handleReplaceFlights, s.TripRoleMiddleware(models.TripRoleEditor))
	g.PATCH("/:tripId/flights/:flightId", s.handleUpdateFlight, s.TripRoleMiddleware(models.TripRoleEditor))
	g.DELETE("/:tripId/flights/:flightId", s.handleDeleteFlight, s.TripRoleMiddleware(models.TripRoleEditor))
}

type flightRequest struct {
	Direction  string `json:"direction"`
	Mode       string `json:"mode"`
	Airline    string `json:"airline"`
	FlightNo   string `json:"flight_no"`
	DepAirport string `json:"dep_airport" validate:"required,len=3"`
	ArrAirport string `json:"arr_airport" validate:"required,len=3"`
	DepDate    string `json:"dep_date"`
	DepTime    string `json:"dep_time"`
	ArrDate    string `json:"arr_date"`
	ArrTime    string `json:"arr_time"`
	RawText    string `json:"raw_text"`
	Note       string `json:"note"`
}

type replaceFlightsRequest struct {
	Flights []flightRequest `json:"flights"`
}

func (s *Server) handleListFlights(c echo.Context) error {
	ctx := c.Request().Context()
	flights, err := s.flights.ListByTrip(ctx, request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดเที่ยวบินไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, s.toRouteDTO(flights))
}

func (s *Server) handleCreateFlight(c echo.Context) error {
	var req flightRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	existing, err := s.flights.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดเที่ยวบินไม่สำเร็จ")
	}

	flight := toFlightModel(req)
	flight.TripID = tripID
	flight.Seq = len(existing)
	if err := s.flights.Create(ctx, &flight); err != nil {
		return request.Internal(c, "เพิ่มเที่ยวบินไม่สำเร็จ")
	}

	return s.afterRouteChange(c, tripID, "เพิ่มเที่ยวบิน "+flight.DepAirport+"→"+flight.ArrAirport)
}

// handleReplaceFlights swaps the whole route at once — pasting the ticket again,
// or editing the route in the entry flow after the trip already exists.
func (s *Server) handleReplaceFlights(c echo.Context) error {
	var req replaceFlightsRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	flights := make([]models.TripFlight, 0, len(req.Flights))
	for _, in := range req.Flights {
		flights = append(flights, toFlightModel(in))
	}
	if err := s.flights.ReplaceAll(ctx, tripID, flights); err != nil {
		return request.Internal(c, "บันทึกเส้นทางไม่สำเร็จ")
	}

	return s.afterRouteChange(c, tripID, "แก้เส้นทางบิน")
}

func (s *Server) handleUpdateFlight(c echo.Context) error {
	var req flightRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	flight, err := s.flights.Get(ctx, tripID, c.Param("flightId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบเที่ยวบินนี้")
	}

	updated := toFlightModel(req)
	updated.Base = flight.Base
	updated.TripID = tripID
	updated.Seq = flight.Seq
	if err := s.flights.Update(ctx, &updated); err != nil {
		return request.Internal(c, "บันทึกเที่ยวบินไม่สำเร็จ")
	}

	return s.afterRouteChange(c, tripID, "แก้เที่ยวบิน "+updated.DepAirport+"→"+updated.ArrAirport)
}

func (s *Server) handleDeleteFlight(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.flights.Delete(ctx, tripID, c.Param("flightId")); err != nil {
		return request.Internal(c, "ลบเที่ยวบินไม่สำเร็จ")
	}
	return s.afterRouteChange(c, tripID, "ลบเที่ยวบินออกจากเส้นทาง")
}

// afterRouteChange re-derives the trip frame and answers with the new route, so
// one round trip is enough for the client to redraw everything a leg touches.
func (s *Server) afterRouteChange(c echo.Context, tripID, activity string) error {
	ctx := c.Request().Context()

	flights, err := s.flights.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดเที่ยวบินไม่สำเร็จ")
	}

	if trip, err := s.trips.GetByID(ctx, tripID); err == nil {
		if s.applyRouteToTrip(trip, flights, request.UserID(c)) {
			_ = s.trips.Update(ctx, trip)
		}
	}

	s.track(c, tripID, activity, events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, s.toRouteDTO(flights))
}

/* ------------------------------------------------------------------ frame -- */

// applyRouteToTrip pushes what the legs imply back onto the trip: the dates the
// tickets already decided, the destinations in visit order, and the country the
// trip is priced in. It reports whether anything actually changed.
//
// Dates that come from a ticket are locked dates — there is nothing left to
// coordinate once someone has paid for the seat (M2.5).
func (s *Server) applyRouteToTrip(trip *models.Trip, flights []models.TripFlight, userID string) bool {
	route := domain.BuildRoute(toLegs(flights), s.airportLookup)
	if len(route.Stops) == 0 && route.StartDate == "" {
		return false
	}

	changed := false

	if start, ok := parseDateParam(route.StartDate); ok && !sameDay(trip.StartDate, start) {
		trip.StartDate = &start
		if trip.DatesLockedAt == nil {
			now := time.Now().UTC()
			trip.DatesLockedAt = &now
			if userID != "" {
				trip.DatesLockedBy = &userID
			}
		}
		changed = true
	}
	if end, ok := parseDateParam(route.EndDate); ok && !sameDay(trip.EndDate, end) {
		trip.EndDate = &end
		changed = true
	}

	if cities := route.Cities(); len(cities) > 0 {
		encoded := jsonArray(cities)
		if string(encoded) != string(trip.DestinationCities) {
			trip.DestinationCities = encoded
			changed = true
		}
	}
	if country := route.PrimaryCountry(); country != "" && country != trip.DestinationCountry {
		trip.DestinationCountry = country
		changed = true
	}

	return changed
}

func (s *Server) airportLookup(iata string) *domain.Airport {
	found := s.airports.Get(iata)
	if found == nil {
		return nil
	}
	return &domain.Airport{
		IATA:        found.IATA,
		City:        found.City,
		CityTH:      found.CityTH,
		CountryCode: found.CountryCode,
		Country:     found.Country,
		CountryTH:   found.CountryTH,
	}
}

func toLegs(flights []models.TripFlight) []domain.Leg {
	out := make([]domain.Leg, 0, len(flights))
	for _, f := range flights {
		out = append(out, domain.Leg{
			Direction:  f.Direction,
			Mode:       f.Mode,
			FlightNo:   f.FlightNo,
			DepAirport: f.DepAirport,
			ArrAirport: f.ArrAirport,
			DepDate:    dateOnly(f.DepDate),
			DepTime:    f.DepTime,
			ArrDate:    dateOnly(f.ArrDate),
			ArrTime:    f.ArrTime,
		})
	}
	return out
}

func toFlightModel(in flightRequest) models.TripFlight {
	flight := models.TripFlight{
		Direction:  directionOrDefault(in.Direction),
		Mode:       modeOrDefault(in.Mode),
		Airline:    strings.TrimSpace(in.Airline),
		FlightNo:   strings.ToUpper(strings.TrimSpace(in.FlightNo)),
		DepAirport: strings.ToUpper(strings.TrimSpace(in.DepAirport)),
		ArrAirport: strings.ToUpper(strings.TrimSpace(in.ArrAirport)),
		DepTime:    clockOrEmpty(in.DepTime),
		ArrTime:    clockOrEmpty(in.ArrTime),
		RawText:    in.RawText,
		Note:       in.Note,
	}
	if dep, ok := parseDateParam(in.DepDate); ok {
		flight.DepDate = &dep
	}
	if arr, ok := parseDateParam(in.ArrDate); ok {
		flight.ArrDate = &arr
	} else {
		// A red-eye is the exception, not the rule: same-day arrival unless the
		// client says otherwise.
		flight.ArrDate = flight.DepDate
	}
	return flight
}

func directionOrDefault(v string) string {
	switch v {
	case models.FlightOut, models.FlightInter, models.FlightBack:
		return v
	default:
		return models.FlightOut
	}
}

func modeOrDefault(v string) string {
	if v == models.FlightModeGround {
		return v
	}
	return models.FlightModeFlight
}

// clockOrEmpty keeps "08:05" and drops anything that is not a wall clock —
// the column is display data and must never hold half a timestamp.
func clockOrEmpty(v string) string {
	v = strings.TrimSpace(v)
	if len(v) != 5 || v[2] != ':' {
		return ""
	}
	if _, err := time.Parse("15:04", v); err != nil {
		return ""
	}
	return v
}

func sameDay(a *time.Time, b time.Time) bool {
	return a != nil && a.Format("2006-01-02") == b.Format("2006-01-02")
}

func dateOnly(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

/* -------------------------------------------------------------------- dto -- */

func (s *Server) toRouteDTO(flights []models.TripFlight) routeDTO {
	legs := make([]flightDTO, 0, len(flights))
	for _, f := range flights {
		legs = append(legs, flightDTO{
			ID:         f.ID,
			Seq:        f.Seq,
			Direction:  f.Direction,
			Mode:       f.Mode,
			Airline:    f.Airline,
			FlightNo:   f.FlightNo,
			DepAirport: f.DepAirport,
			ArrAirport: f.ArrAirport,
			DepDate:    dateOnly(f.DepDate),
			DepTime:    f.DepTime,
			ArrDate:    dateOnly(f.ArrDate),
			ArrTime:    f.ArrTime,
			Note:       f.Note,
		})
	}

	route := domain.BuildRoute(toLegs(flights), s.airportLookup)
	return routeDTO{
		Flights:     legs,
		Stops:       route.Stops,
		Countries:   route.Countries,
		HomeAirport: route.HomeAirport,
		StartDate:   route.StartDate,
		EndDate:     route.EndDate,
		Days:        route.Days,
		Nights:      route.Nights,
		RoundTrip:   route.RoundTrip,
	}
}
