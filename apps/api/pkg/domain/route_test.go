package domain

import "testing"

// The index, reduced to the rows these tests need. The real lookup comes from
// pkg/services/airports.
var testAirports = map[string]Airport{
	"BKK": {IATA: "BKK", City: "Bangkok", CityTH: "กรุงเทพ", CountryCode: "TH", Country: "Thailand", CountryTH: "ไทย"},
	"NRT": {IATA: "NRT", City: "Tokyo", CityTH: "โตเกียว", CountryCode: "JP", Country: "Japan", CountryTH: "ญี่ปุ่น"},
	"KIX": {IATA: "KIX", City: "Osaka", CityTH: "โอซาก้า", CountryCode: "JP", Country: "Japan", CountryTH: "ญี่ปุ่น"},
	"ICN": {IATA: "ICN", City: "Seoul", CityTH: "โซล", CountryCode: "KR", Country: "South Korea", CountryTH: "เกาหลีใต้"},
}

func lookup(iata string) *Airport {
	if a, ok := testAirports[iata]; ok {
		return &a
	}
	return nil
}

// The trip from the brief: BKK→NRT arriving 08:05 on 4 Dec, NRT→BKK arriving
// 22:05 on 10 Dec.
func TestBuildRouteReturnTrip(t *testing.T) {
	route := BuildRoute([]Leg{
		{Direction: "out", DepAirport: "BKK", ArrAirport: "NRT", DepDate: "2026-12-04", ArrDate: "2026-12-04", ArrTime: "08:05"},
		{Direction: "back", DepAirport: "NRT", ArrAirport: "BKK", DepDate: "2026-12-10", ArrDate: "2026-12-10", ArrTime: "22:05"},
	}, lookup)

	if !route.RoundTrip {
		t.Error("landing back at BKK should read as a round trip")
	}
	if route.StartDate != "2026-12-04" || route.EndDate != "2026-12-10" {
		t.Errorf("frame is %s → %s", route.StartDate, route.EndDate)
	}
	if route.Days != 7 || route.Nights != 6 {
		t.Errorf("got %d days / %d nights, want 7/6", route.Days, route.Nights)
	}
	if len(route.Stops) != 1 {
		t.Fatalf("got %d stops, want only Tokyo", len(route.Stops))
	}

	stop := route.Stops[0]
	if stop.City != "โตเกียว" || stop.Nights != 6 || stop.ArriveTime != "08:05" || stop.Open {
		t.Errorf("unexpected stop: %+v", stop)
	}
	if got := route.Cities(); len(got) != 1 || got[0] != "โตเกียว" {
		t.Errorf("cities = %v", got)
	}
	if route.PrimaryCountry() != "JP" {
		t.Errorf("primary country = %q", route.PrimaryCountry())
	}
}

// "Seoul and Tokyo" — the ambiguity that used to be a chip list. Two countries,
// and the nights land where the legs say they land.
func TestBuildRouteTwoCountries(t *testing.T) {
	route := BuildRoute([]Leg{
		{Direction: "out", DepAirport: "BKK", ArrAirport: "ICN", DepDate: "2026-12-04", ArrTime: "07:30"},
		{Direction: "inter", DepAirport: "ICN", ArrAirport: "NRT", DepDate: "2026-12-07", ArrTime: "12:10"},
		{Direction: "back", DepAirport: "NRT", ArrAirport: "BKK", DepDate: "2026-12-11", ArrTime: "22:05"},
	}, lookup)

	if len(route.Stops) != 2 {
		t.Fatalf("got %d stops, want Seoul then Tokyo", len(route.Stops))
	}
	if route.Stops[0].City != "โซล" || route.Stops[0].Nights != 3 {
		t.Errorf("first stop: %+v", route.Stops[0])
	}
	if route.Stops[1].City != "โตเกียว" || route.Stops[1].Nights != 4 {
		t.Errorf("second stop: %+v", route.Stops[1])
	}

	if len(route.Countries) != 2 {
		t.Fatalf("got %d countries, want 2: %+v", len(route.Countries), route.Countries)
	}
	if route.Countries[0].Code != "KR" || route.Countries[0].Nights != 3 {
		t.Errorf("first country: %+v", route.Countries[0])
	}
	if route.Countries[1].Code != "JP" || route.Countries[1].Nights != 4 {
		t.Errorf("second country: %+v", route.Countries[1])
	}
	if route.PrimaryCountry() != "JP" {
		t.Errorf("primary country = %q, want the one with most nights", route.PrimaryCountry())
	}
}

// Two cities in one country still aggregate into one country line.
func TestBuildRouteTwoCitiesOneCountry(t *testing.T) {
	route := BuildRoute([]Leg{
		{DepAirport: "BKK", ArrAirport: "NRT", DepDate: "2026-12-04"},
		{Mode: "ground", DepAirport: "NRT", ArrAirport: "KIX", DepDate: "2026-12-08"},
		{DepAirport: "KIX", ArrAirport: "BKK", DepDate: "2026-12-11"},
	}, lookup)

	if len(route.Countries) != 1 || route.Countries[0].Code != "JP" || route.Countries[0].Nights != 7 {
		t.Fatalf("countries = %+v", route.Countries)
	}
	if route.Countries[0].Cities != "โตเกียว · โอซาก้า" {
		t.Errorf("cities line = %q", route.Countries[0].Cities)
	}
}

// A one-way ticket is a real answer: the last stop simply stays open.
func TestBuildRouteOneWay(t *testing.T) {
	route := BuildRoute([]Leg{
		{DepAirport: "BKK", ArrAirport: "NRT", DepDate: "2026-12-04", ArrTime: "08:05"},
	}, lookup)

	if route.RoundTrip {
		t.Error("one leg is not a round trip")
	}
	if len(route.Stops) != 1 || !route.Stops[0].Open {
		t.Fatalf("stops = %+v", route.Stops)
	}
	if route.Stops[0].Nights != 0 {
		t.Errorf("an open stop has no night count yet, got %d", route.Stops[0].Nights)
	}
}

// Legs arrive in whatever order the user typed them; the route is chronological.
func TestBuildRouteSortsAndSkipsIncompleteLegs(t *testing.T) {
	route := BuildRoute([]Leg{
		{DepAirport: "NRT", ArrAirport: "BKK", DepDate: "2026-12-10"},
		{DepAirport: "BKK", ArrAirport: "NRT", DepDate: "2026-12-04"},
		{DepAirport: "BKK", ArrAirport: "", DepDate: "2026-12-04"}, // half-typed
		{DepAirport: "BKK", ArrAirport: "KIX"},                     // no date yet
	}, lookup)

	if route.StartDate != "2026-12-04" || route.EndDate != "2026-12-10" {
		t.Errorf("frame is %s → %s", route.StartDate, route.EndDate)
	}
	if len(route.Stops) != 1 || route.Stops[0].Airport != "NRT" {
		t.Errorf("stops = %+v", route.Stops)
	}
}

// An airport the index has never heard of must not disappear from the route.
func TestBuildRouteUnknownAirport(t *testing.T) {
	route := BuildRoute([]Leg{
		{DepAirport: "BKK", ArrAirport: "ZZZ", DepDate: "2026-12-04"},
		{DepAirport: "ZZZ", ArrAirport: "BKK", DepDate: "2026-12-08"},
	}, lookup)

	if len(route.Stops) != 1 || route.Stops[0].City != "ZZZ" || route.Stops[0].Nights != 4 {
		t.Fatalf("stops = %+v", route.Stops)
	}
}

func TestBuildRouteEmpty(t *testing.T) {
	route := BuildRoute(nil, lookup)
	if len(route.Stops) != 0 || route.Days != 0 || route.StartDate != "" {
		t.Errorf("empty route should stay empty: %+v", route)
	}
}
