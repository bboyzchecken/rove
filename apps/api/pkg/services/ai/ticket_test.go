package ai

import "testing"

const sample = `Thai Airways — Booking confirmed
TG 682  BKK 23:59 → HND 07:05  15 Nov 2026
TG 673  KIX 12:20 → BKK 16:30  22 Nov 2026
Passengers: 4`

func TestParseTicketHeuristicReadsBothLegs(t *testing.T) {
	got := parseTicketHeuristic(sample)

	if len(got.Flights) != 2 {
		t.Fatalf("flights = %d, want 2", len(got.Flights))
	}
	if got.Flights[0].FlightNo != "TG682" || got.Flights[0].ArrAirport != "HND" {
		t.Errorf("outbound = %+v", got.Flights[0])
	}
	if got.Flights[0].Direction != "out" || got.Flights[1].Direction != "back" {
		t.Errorf("directions = %s/%s", got.Flights[0].Direction, got.Flights[1].Direction)
	}
	if got.StartDate != "2026-11-15" || got.EndDate != "2026-11-22" {
		t.Errorf("dates = %s..%s", got.StartDate, got.EndDate)
	}
	if got.SuggestedTitle != "โตเกียว 2569" {
		t.Errorf("title = %q", got.SuggestedTitle)
	}
}

func TestTicketCitiesSkipsTheReturnLeg(t *testing.T) {
	cities := TicketCities(parseTicketHeuristic(sample))
	if len(cities) != 1 || cities[0] != "โตเกียว" {
		t.Fatalf("cities = %v, want [โตเกียว]", cities)
	}
}

func TestTicketPartySize(t *testing.T) {
	if got := TicketPartySize(sample); got != 4 {
		t.Fatalf("party = %d, want 4", got)
	}
	if got := TicketPartySize("no passenger line here"); got != 0 {
		t.Fatalf("party = %d, want 0", got)
	}
}

func TestParseTicketHeuristicOnGarbage(t *testing.T) {
	got := parseTicketHeuristic("สวัสดีครับ ไม่มีตั๋วอะไรเลย")
	if len(got.Flights) != 0 || got.StartDate != "" {
		t.Fatalf("got %+v, want an empty result", got)
	}
}
