package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M1 — A1.3: a trip that starts from the flights people already booked.
//
// The frame is not typed alongside the legs, it is derived from them. These
// tests are what stops the two from drifting apart, because a trip whose dates
// disagree with its tickets is worse than one with no dates at all.

type routeResponse struct {
	Flights []struct {
		ID         string `json:"id"`
		Direction  string `json:"direction"`
		DepAirport string `json:"dep_airport"`
		ArrAirport string `json:"arr_airport"`
		ArrTime    string `json:"arr_time"`
	} `json:"flights"`
	Stops []struct {
		Airport string `json:"airport"`
		City    string `json:"city"`
		Country string `json:"country"`
		Nights  int    `json:"nights"`
	} `json:"stops"`
	Countries []struct {
		Code   string `json:"code"`
		Nights int    `json:"nights"`
	} `json:"countries"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Days      int    `json:"days"`
	RoundTrip bool   `json:"round_trip"`
}

type tripResponse struct {
	ID                 string         `json:"id"`
	StartDate          *string        `json:"start_date"`
	EndDate            *string        `json:"end_date"`
	DestinationCities  []string       `json:"destination_cities"`
	DestinationCountry string         `json:"destination_country"`
	Nights             int            `json:"nights"`
	Route              *routeResponse `json:"route"`
}

// The trip from the brief: BKK→NRT on 4 Dec landing 08:05, NRT→BKK on 10 Dec
// landing 22:05.
func TestCreateTripFromFlights(t *testing.T) {
	h := testsupport.New(t)
	_, token := h.User("alice")

	var trip tripResponse
	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{
		"entry_type": "route",
		"title":      "โตเกียว 2569",
		"party_size": 4,
		"flights": []map[string]any{
			{"direction": "out", "dep_airport": "BKK", "arr_airport": "NRT", "dep_date": "2026-12-04", "arr_time": "08:05"},
			{"direction": "back", "dep_airport": "NRT", "arr_airport": "BKK", "dep_date": "2026-12-10", "arr_time": "22:05"},
		},
	}).ExpectStatus(http.StatusCreated).Decode(&trip)

	if trip.StartDate == nil || *trip.StartDate != "2026-12-04" {
		t.Fatalf("start date = %v, want the outbound departure", trip.StartDate)
	}
	if trip.EndDate == nil || *trip.EndDate != "2026-12-10" {
		t.Fatalf("end date = %v, want the return arrival", trip.EndDate)
	}
	if trip.Nights != 6 {
		t.Errorf("nights = %d, want 6", trip.Nights)
	}
	if len(trip.DestinationCities) != 1 || trip.DestinationCities[0] != "โตเกียว" {
		t.Errorf("cities = %v, want the arrival city of the outbound leg", trip.DestinationCities)
	}
	if trip.DestinationCountry != "JP" {
		t.Errorf("country = %q, want JP", trip.DestinationCountry)
	}

	if trip.Route == nil {
		t.Fatal("the created trip should come back with its route attached")
	}
	if !trip.Route.RoundTrip || len(trip.Route.Stops) != 1 {
		t.Fatalf("route = %+v", trip.Route)
	}
	if trip.Route.Stops[0].Nights != 6 || trip.Route.Stops[0].City != "โตเกียว" {
		t.Errorf("stop = %+v", trip.Route.Stops[0])
	}
	if trip.Route.Flights[0].ArrTime != "08:05" {
		t.Errorf("arrival time was not kept: %+v", trip.Route.Flights[0])
	}
}

// Two countries in one trip — the case a list of city chips could never answer.
func TestAddingALegSplitsTheTripAcrossCountries(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "ทริปใหม่")
	base := "/api/v1/trips/" + trip.ID

	var route routeResponse
	h.Request(http.MethodPut, base+"/flights", token, map[string]any{
		"flights": []map[string]any{
			{"direction": "out", "dep_airport": "BKK", "arr_airport": "ICN", "dep_date": "2026-12-04", "arr_time": "07:30"},
			{"direction": "inter", "dep_airport": "ICN", "arr_airport": "NRT", "dep_date": "2026-12-07", "arr_time": "12:10"},
			{"direction": "back", "dep_airport": "NRT", "arr_airport": "BKK", "dep_date": "2026-12-11", "arr_time": "22:05"},
		},
	}).ExpectStatus(http.StatusOK).Decode(&route)

	if len(route.Countries) != 2 {
		t.Fatalf("countries = %+v, want Korea then Japan", route.Countries)
	}
	if route.Countries[0].Code != "KR" || route.Countries[0].Nights != 3 {
		t.Errorf("first country = %+v", route.Countries[0])
	}
	if route.Countries[1].Code != "JP" || route.Countries[1].Nights != 4 {
		t.Errorf("second country = %+v", route.Countries[1])
	}

	// The frame follows the legs: the trip is now 4–11 Dec, Seoul then Tokyo.
	var updated tripResponse
	h.Request(http.MethodGet, base, token, nil).ExpectStatus(http.StatusOK).Decode(&updated)
	if updated.StartDate == nil || *updated.StartDate != "2026-12-04" {
		t.Errorf("start date = %v", updated.StartDate)
	}
	if len(updated.DestinationCities) != 2 ||
		updated.DestinationCities[0] != "โซล" || updated.DestinationCities[1] != "โตเกียว" {
		t.Errorf("cities = %v, want visit order", updated.DestinationCities)
	}
}

func TestFlightCRUD(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "ทริปใหม่")
	base := "/api/v1/trips/" + trip.ID + "/flights"

	var created routeResponse
	h.Request(http.MethodPost, base, token, map[string]any{
		"direction": "out", "dep_airport": "bkk", "arr_airport": "hnd",
		"dep_date": "2026-12-04", "arr_time": "08:05", "flight_no": "tg660",
	}).ExpectStatus(http.StatusOK).Decode(&created)

	if len(created.Flights) != 1 {
		t.Fatalf("flights = %+v", created.Flights)
	}
	if created.Flights[0].DepAirport != "BKK" || created.Flights[0].ArrAirport != "HND" {
		t.Errorf("codes should be normalised upper case: %+v", created.Flights[0])
	}

	id := created.Flights[0].ID
	var updated routeResponse
	h.Request(http.MethodPatch, base+"/"+id, token, map[string]any{
		"direction": "out", "dep_airport": "BKK", "arr_airport": "NRT",
		"dep_date": "2026-12-04", "arr_time": "09:15",
	}).ExpectStatus(http.StatusOK).Decode(&updated)

	if updated.Flights[0].ArrAirport != "NRT" || updated.Flights[0].ArrTime != "09:15" {
		t.Errorf("update did not stick: %+v", updated.Flights[0])
	}

	var removed routeResponse
	h.Request(http.MethodDelete, base+"/"+id, token, nil).
		ExpectStatus(http.StatusOK).Decode(&removed)
	if len(removed.Flights) != 0 {
		t.Errorf("flight was not deleted: %+v", removed.Flights)
	}
}

// A leg is trip data like any other: a signed-in stranger must not see or
// change it (§4.3).
func TestOutsiderCannotTouchTheRoute(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	bob, outsider := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Trip(bob, "บ๊อบไปโอซาก้า")
	base := "/api/v1/trips/" + trip.ID + "/flights"

	h.Request(http.MethodGet, base, outsider, nil).ExpectDenied()
	h.Request(http.MethodPost, base, outsider, map[string]any{
		"dep_airport": "BKK", "arr_airport": "NRT", "dep_date": "2026-12-04",
	}).ExpectDenied()
	h.Request(http.MethodPut, base, outsider, map[string]any{"flights": []any{}}).ExpectDenied()
}

// A viewer reads the route; only an editor may change it.
func TestViewerCannotEditTheRoute(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	viewer, viewerToken := h.User("viewer")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, viewer, models.TripRoleViewer)
	base := "/api/v1/trips/" + trip.ID + "/flights"

	h.Request(http.MethodGet, base, viewerToken, nil).ExpectStatus(http.StatusOK)
	h.Request(http.MethodPost, base, viewerToken, map[string]any{
		"dep_airport": "BKK", "arr_airport": "NRT", "dep_date": "2026-12-04",
	}).ExpectDenied()
}

// Airport search is public reference data — the entry flow needs it before
// anyone has signed in.
func TestAirportSearchIsPublic(t *testing.T) {
	h := testsupport.New(t)

	var found []struct {
		IATA      string `json:"iata"`
		City      string `json:"city"`
		CityTH    string `json:"city_th"`
		CountryTH string `json:"country_th"`
	}
	h.Request(http.MethodGet, "/api/v1/airports?q=NRT", "", nil).
		ExpectStatus(http.StatusOK).Decode(&found)

	if len(found) == 0 || found[0].IATA != "NRT" {
		t.Fatalf("NRT search returned %+v", found)
	}
	if found[0].CityTH != "โตเกียว" || found[0].CountryTH != "ญี่ปุ่น" {
		t.Errorf("Thai labels missing: %+v", found[0])
	}
}
