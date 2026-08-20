package airports

import "testing"

func svc(t *testing.T) Service {
	t.Helper()
	s := New()
	if s.Count() < 3000 {
		t.Fatalf("airport index looks empty: %d rows — rebuild with scripts/gen-airports.mjs", s.Count())
	}
	return s
}

func TestSearchByIATACode(t *testing.T) {
	s := svc(t)

	for _, code := range []string{"NRT", "bkk", " icn "} {
		got := s.Search(code, 5)
		if len(got) == 0 {
			t.Fatalf("%q returned nothing", code)
		}
		// The exact code always wins, whatever else contains those letters.
		if want := trimUpper(code); got[0].IATA != want {
			t.Errorf("%q ranked %s first, want %s", code, got[0].IATA, want)
		}
	}
}

func TestSearchByCityRanksTheHubFirst(t *testing.T) {
	s := svc(t)

	got := s.Search("tokyo", 5)
	if len(got) < 2 {
		t.Fatalf("tokyo returned %d airports, want both Narita and Haneda", len(got))
	}
	if got[0].IATA != "HND" && got[0].IATA != "NRT" {
		t.Errorf("tokyo ranked %s first, want a Tokyo airport", got[0].IATA)
	}
	if got[0].CountryCode != "JP" || got[0].Country != "Japan" || got[0].CountryTH != "ญี่ปุ่น" {
		t.Errorf("country not joined: %+v", got[0])
	}
}

func TestSearchInThai(t *testing.T) {
	s := svc(t)

	for query, want := range map[string]string{
		"โตเกียว": "JP",
		"กรุงเทพ": "TH",
		"โซล":     "KR",
	} {
		got := s.Search(query, 3)
		if len(got) == 0 {
			t.Fatalf("%q returned nothing", query)
		}
		if got[0].CountryCode != want {
			t.Errorf("%q ranked %s (%s) first, want a %s airport", query, got[0].IATA, got[0].CountryCode, want)
		}
	}
}

func TestSearchIsWorldwide(t *testing.T) {
	s := svc(t)

	// One per continent — the index is not a Japan/Korea shortlist.
	for query, want := range map[string]string{
		"keflavik":   "KEF",
		"queenstown": "ZQN",
		"cape town":  "CPT",
		"lisbon":     "LIS",
		"sao paulo":  "GRU",
	} {
		got := s.Search(query, 5)
		if !contains(got, want) {
			t.Errorf("%q did not return %s, got %v", query, want, codes(got))
		}
	}
}

func TestSearchEmptyQueryReturnsHubs(t *testing.T) {
	s := svc(t)

	got := s.Search("", 6)
	if len(got) != 6 {
		t.Fatalf("empty query returned %d, want 6 hub suggestions", len(got))
	}
	if got[0].IATA != "BKK" {
		t.Errorf("first suggestion is %s, want BKK for a Thai audience", got[0].IATA)
	}
}

func TestSearchLimitIsCapped(t *testing.T) {
	s := svc(t)

	if got := s.Search("international", 500); len(got) > maxLimit {
		t.Errorf("limit not capped: %d rows", len(got))
	}
}

func TestGet(t *testing.T) {
	s := svc(t)

	got := s.Get("nrt")
	if got == nil {
		t.Fatal("NRT not found")
	}
	if got.City != "Tokyo" || got.CityTH != "โตเกียว" || got.Timezone != "Asia/Tokyo" {
		t.Errorf("unexpected row: %+v", got)
	}
	if s.Get("ZZZ") != nil {
		t.Error("ZZZ should not resolve")
	}
}

func trimUpper(s string) string {
	out := ""
	for _, r := range s {
		if r == ' ' {
			continue
		}
		if r >= 'a' && r <= 'z' {
			r -= 32
		}
		out += string(r)
	}
	return out
}

func contains(list []Airport, iata string) bool {
	for _, a := range list {
		if a.IATA == iata {
			return true
		}
	}
	return false
}

func codes(list []Airport) []string {
	out := make([]string, 0, len(list))
	for _, a := range list {
		out = append(out, a.IATA)
	}
	return out
}
