package domain

import (
	"sort"
	"strings"
	"time"
)

// The route a trip is built on (DEV_SPEC M1 — A1.3).
//
// This file is the server-side twin of `apps/web/lib/data/route.ts`; the two
// must agree, because the entry flow computes the route in the browser before
// the trip exists and the trip room reads it back from here afterwards.
//
// The whole point is that a route answers questions a list of city names never
// could. "โซล, อูเอโนะ" left three of them open — is that two countries, how
// many nights in each, and how do you get between them. Legs answer all three:
// each arrival opens a stop, the next departure closes it, and the nights in
// between are the plan.

// Leg is one hop of the route, already validated by the caller.
type Leg struct {
	Direction  string // out | inter | back
	Mode       string // flight | ground
	FlightNo   string
	DepAirport string // IATA
	ArrAirport string // IATA
	DepDate    string // "2026-12-04", required
	DepTime    string // "18:00", may be empty
	ArrDate    string // defaults to DepDate when empty
	ArrTime    string // "08:05", may be empty
}

// Airport is the slice of the index the route needs. It is an interface-free
// struct so pkg/domain keeps depending on nothing.
type Airport struct {
	IATA        string `json:"iata"`
	City        string `json:"city"`
	CityTH      string `json:"city_th"`
	CountryCode string `json:"country_code"`
	Country     string `json:"country"`
	CountryTH   string `json:"country_th"`
}

// Stop is one place the group actually stays, with the nights it gets.
type Stop struct {
	Airport     string `json:"airport"`
	City        string `json:"city"`
	CountryCode string `json:"country_code"`
	Country     string `json:"country"`
	ArriveDate  string `json:"arrive_date"`
	ArriveTime  string `json:"arrive_time"`
	DepartDate  string `json:"depart_date"`
	DepartTime  string `json:"depart_time"`
	Nights      int    `json:"nights"`
	// True while no leg leaves this stop — a one-way route, or a route still
	// being filled in.
	Open bool `json:"open"`
}

// CountryStay aggregates the stops that share a country, in visit order.
type CountryStay struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	Cities string `json:"cities"`
	Nights int    `json:"nights"`
}

// Route is everything derived from the legs.
type Route struct {
	HomeAirport string        `json:"home_airport"`
	Stops       []Stop        `json:"stops"`
	Countries   []CountryStay `json:"countries"`
	StartDate   string        `json:"start_date"`
	EndDate     string        `json:"end_date"`
	Days        int           `json:"days"`
	Nights      int           `json:"nights"`
	RoundTrip   bool          `json:"round_trip"`
}

// BuildRoute derives the frame from the legs. `lookup` resolves a IATA code;
// an unknown code still produces a stop, named after the code itself, because
// dropping a leg would silently shorten the trip.
func BuildRoute(legs []Leg, lookup func(iata string) *Airport) Route {
	route := Route{Stops: []Stop{}, Countries: []CountryStay{}}
	legs = sortedLegs(legs)
	if len(legs) == 0 {
		return route
	}

	route.HomeAirport = strings.ToUpper(legs[0].DepAirport)
	route.StartDate = legs[0].DepDate
	route.EndDate = arrivalDate(legs[len(legs)-1])

	for i, leg := range legs {
		arr := strings.ToUpper(leg.ArrAirport)

		// The last leg landing back where the trip started is the way home, not
		// a stop. Anything else is somewhere the group wakes up.
		if i == len(legs)-1 && arr == route.HomeAirport {
			route.RoundTrip = true
			continue
		}

		stop := Stop{
			Airport:    arr,
			ArriveDate: arrivalDate(leg),
			ArriveTime: leg.ArrTime,
			Open:       true,
		}
		if a := lookup(arr); a != nil {
			stop.City = firstNonEmpty(a.CityTH, a.City, arr)
			stop.CountryCode = a.CountryCode
			stop.Country = firstNonEmpty(a.CountryTH, a.Country, a.CountryCode)
		} else {
			stop.City = arr
		}

		if i+1 < len(legs) {
			next := legs[i+1]
			stop.DepartDate = next.DepDate
			stop.DepartTime = next.DepTime
			stop.Nights = nightsBetween(stop.ArriveDate, stop.DepartDate)
			stop.Open = false
		}

		route.Stops = append(route.Stops, stop)
	}

	route.Days = nightsBetween(route.StartDate, route.EndDate) + 1
	route.Nights = maxOf(route.Days-1, 0)
	route.Countries = countryStays(route.Stops)
	return route
}

// Cities lists the destinations in visit order, without repeats — what the trip
// frame stores in destination_cities.
func (r Route) Cities() []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(r.Stops))
	for _, s := range r.Stops {
		if s.City == "" || seen[s.City] {
			continue
		}
		seen[s.City] = true
		out = append(out, s.City)
	}
	return out
}

// PrimaryCountry is the country with the most nights — the one the trip is
// priced and named after when a route crosses several.
func (r Route) PrimaryCountry() string {
	best := ""
	nights := -1
	for _, c := range r.Countries {
		if c.Nights > nights {
			best, nights = c.Code, c.Nights
		}
	}
	return best
}

/* ------------------------------------------------------------------ utils -- */

func sortedLegs(legs []Leg) []Leg {
	out := make([]Leg, 0, len(legs))
	for _, l := range legs {
		if strings.TrimSpace(l.DepAirport) == "" || strings.TrimSpace(l.ArrAirport) == "" {
			continue
		}
		if strings.TrimSpace(l.DepDate) == "" {
			continue
		}
		out = append(out, l)
	}
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].DepDate != out[b].DepDate {
			return out[a].DepDate < out[b].DepDate
		}
		return out[a].DepTime < out[b].DepTime
	})
	return out
}

func arrivalDate(l Leg) string {
	if strings.TrimSpace(l.ArrDate) != "" {
		return l.ArrDate
	}
	return l.DepDate
}

func countryStays(stops []Stop) []CountryStay {
	order := make([]string, 0, len(stops))
	byCode := map[string]*CountryStay{}

	for _, s := range stops {
		code := s.CountryCode
		if code == "" {
			code = s.Airport
		}
		stay, ok := byCode[code]
		if !ok {
			stay = &CountryStay{Code: code, Name: firstNonEmpty(s.Country, code)}
			byCode[code] = stay
			order = append(order, code)
		}
		stay.Nights += s.Nights
		if stay.Cities == "" {
			stay.Cities = s.City
		} else if !strings.Contains(stay.Cities, s.City) {
			stay.Cities += " · " + s.City
		}
	}

	out := make([]CountryStay, 0, len(order))
	for _, code := range order {
		out = append(out, *byCode[code])
	}
	return out
}

func nightsBetween(from, to string) int {
	start, err1 := time.Parse(isoDate, from)
	end, err2 := time.Parse(isoDate, to)
	if err1 != nil || err2 != nil {
		return 0
	}
	return maxOf(int(end.Sub(start).Hours()/24), 0)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func maxOf(a, b int) int {
	if a > b {
		return a
	}
	return b
}
