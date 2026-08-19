package domain

import "testing"

func TestCanShareDay(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"tokyo_east", "tokyo_east", true},
		{"tokyo_east", "tokyo_bay", true},
		{"tokyo_east", "fuji", false},
		{"kamakura", "yokohama", true},
		{"unknown", "tokyo_east", false},
	}
	for _, tc := range cases {
		if got := CanShareDay(tc.a, tc.b); got != tc.want {
			t.Errorf("CanShareDay(%q,%q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestZonesHaveUniqueCodes(t *testing.T) {
	seen := map[string]bool{}
	for _, z := range Zones {
		if seen[z.Code] {
			t.Fatalf("duplicate zone code %q", z.Code)
		}
		seen[z.Code] = true
	}
}
