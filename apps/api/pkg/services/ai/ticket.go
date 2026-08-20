package ai

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/services/airports"
)

// Reading a pasted booking e-mail without a model (M1 — A1.2 fallback).
//
// This is what MOCK_MODE uses and what the live path falls back to when the
// model is unavailable. It handles the shape airline confirmations actually
// take — a flight number, two airport codes and a date on one line — which is
// enough to reach a trip frame the user can correct.

// TG 682  BKK 23:59 → HND 07:05  15 Nov 2026
var flightLine = regexp.MustCompile(
	`([A-Z]{2})\s?(\d{2,4})\s+\b([A-Z]{3})\b\s*(\d{2}:\d{2})?[^A-Za-z0-9]*(?:→|->|to)?\s*\b([A-Z]{3})\b[^\n]*?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})`,
)

var monthByAbbrev = map[string]time.Month{
	"jan": time.January, "feb": time.February, "mar": time.March,
	"apr": time.April, "may": time.May, "jun": time.June,
	"jul": time.July, "aug": time.August, "sep": time.September,
	"oct": time.October, "nov": time.November, "dec": time.December,
}

// cityByIATA resolves an airport code through the worldwide index (M1 — A1.3).
// It used to be a thirteen-entry map of the Phase 1 destinations, which meant a
// ticket to anywhere else parsed into a trip with no destination at all.
func cityByIATA(code string) (string, bool) {
	found := airports.New().Get(code)
	if found == nil {
		return "", false
	}
	if found.CityTH != "" {
		return found.CityTH, true
	}
	return found.City, true
}

func parseTicketHeuristic(text string) *ParsedTicket {
	out := &ParsedTicket{}

	for _, m := range flightLine.FindAllStringSubmatch(text, -1) {
		month, ok := monthByAbbrev[strings.ToLower(m[7])]
		if !ok {
			continue
		}
		day, _ := strconv.Atoi(m[6])
		year, _ := strconv.Atoi(m[8])

		depAt := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
		if m[4] != "" {
			if hh, mm, ok := parseHHMM(m[4]); ok {
				depAt = time.Date(year, month, day, hh, mm, 0, 0, time.UTC)
			}
		}

		direction := "back"
		if len(out.Flights) == 0 {
			direction = "out"
		}

		out.Flights = append(out.Flights, struct {
			Direction  string `json:"direction"`
			Airline    string `json:"airline"`
			FlightNo   string `json:"flight_no"`
			DepAirport string `json:"dep_airport"`
			ArrAirport string `json:"arr_airport"`
			DepAt      string `json:"dep_at"`
			ArrAt      string `json:"arr_at"`
		}{
			Direction:  direction,
			Airline:    m[1],
			FlightNo:   m[1] + m[2],
			DepAirport: m[3],
			ArrAirport: m[5],
			DepAt:      depAt.Format("2006-01-02T15:04"),
		})
	}

	if len(out.Flights) == 0 {
		return out
	}

	dates := make([]string, 0, len(out.Flights))
	for _, f := range out.Flights {
		dates = append(dates, f.DepAt[:10])
	}
	out.StartDate = minString(dates)
	out.EndDate = maxString(dates)

	// The destination of the outbound leg is what the trip is named after.
	if city, ok := cityByIATA(out.Flights[0].ArrAirport); ok {
		year, _ := strconv.Atoi(out.StartDate[:4])
		out.SuggestedTitle = fmt.Sprintf("%s %d", city, year+543)
	}

	return out
}

// TicketCities returns the destination cities a parsed ticket implies, in
// arrival order and without duplicates.
func TicketCities(t *ParsedTicket) []string {
	seen := map[string]bool{}
	out := make([]string, 0, 2)

	for _, f := range t.Flights {
		city, ok := cityByIATA(f.ArrAirport)
		if !ok || seen[city] {
			continue
		}
		// The return leg lands back home; only the outbound side is a destination.
		if f.Direction == "back" {
			continue
		}
		seen[city] = true
		out = append(out, city)
	}
	return out
}

// TicketPartySize reads "Passengers: 4" and its Thai equivalent.
var passengerLine = regexp.MustCompile(`(?i)(?:passengers?|ผู้โดยสาร)\D{0,10}(\d{1,2})`)

func TicketPartySize(text string) int {
	m := passengerLine.FindStringSubmatch(text)
	if len(m) < 2 {
		return 0
	}
	n, err := strconv.Atoi(m[1])
	if err != nil || n <= 0 || n > 20 {
		return 0
	}
	return n
}

func parseHHMM(s string) (int, int, bool) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return h, m, true
}

func minString(values []string) string {
	out := values[0]
	for _, v := range values {
		if v < out {
			out = v
		}
	}
	return out
}

func maxString(values []string) string {
	out := values[0]
	for _, v := range values {
		if v > out {
			out = v
		}
	}
	return out
}
