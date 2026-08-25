package domain

import (
	"strings"
	"testing"
)

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

func TestZonesForCountryKeepsCountriesApart(t *testing.T) {
	jp := ZonesForCountry("JP")
	kr := ZonesForCountry("kr")

	if len(jp) == 0 || len(kr) == 0 {
		t.Fatalf("jp=%d kr=%d, want both countries populated", len(jp), len(kr))
	}
	for _, zone := range jp {
		if zone.Country != "JP" {
			t.Errorf("%q is not a Japanese zone", zone.Code)
		}
	}
	// An unknown country gets nothing: a Tokyo zone list for a trip to Vietnam
	// is worse than no list at all.
	if got := ZonesForCountry("VN"); len(got) != 0 {
		t.Errorf("ZonesForCountry(VN) = %+v, want none", got)
	}
}

func TestZoneNeighboursAreMutualAndReal(t *testing.T) {
	byCode := map[string]Zone{}
	for _, zone := range Zones {
		byCode[zone.Code] = zone
	}

	for _, zone := range Zones {
		for _, code := range zone.NeighbourCodes {
			other, ok := byCode[code]
			if !ok {
				t.Errorf("%q lists a neighbour that does not exist: %q", zone.Code, code)
				continue
			}
			if other.Country != zone.Country {
				t.Errorf("%q and %q are in different countries and cannot share a day", zone.Code, code)
			}
			if !CanShareDay(code, zone.Code) {
				t.Errorf("%q says it can share a day with %q, but not the other way round", zone.Code, code)
			}
		}
	}
}

func TestEveryZoneIsNamedInBothLanguages(t *testing.T) {
	for _, zone := range Zones {
		if zone.NameTH == "" || zone.NameEN == "" || zone.Country == "" || zone.City == "" {
			t.Errorf("zone %+v is missing a name, a country or a city", zone)
		}
	}
}

func TestPrepTemplateLeadsWithWhatCatchesPeopleOut(t *testing.T) {
	jp := PrepTemplateFor("JP")
	kr := PrepTemplateFor("kr")

	if jp[0].TitleTH == kr[0].TitleTH {
		t.Fatal("two countries opened with the same first item — the country list is not country-specific")
	}
	if !strings.Contains(jp[0].TitleEN, "Visit Japan Web") {
		t.Errorf("JP leads with %q", jp[0].TitleEN)
	}
	if !strings.Contains(kr[0].TitleEN, "K-ETA") {
		t.Errorf("KR leads with %q", kr[0].TitleEN)
	}

	// Both still end with the things every trip abroad needs.
	if jp[len(jp)-1].TitleTH != kr[len(kr)-1].TitleTH {
		t.Error("the common items differ between countries")
	}
}

func TestPrepTemplateAlwaysReturnsSomethingUseful(t *testing.T) {
	got := PrepTemplateFor("VN")
	if len(got) != len(prepCommon) {
		t.Fatalf("an unknown country got %d items, want the common list", len(got))
	}
	for _, item := range got {
		if item.TitleTH == "" || item.TitleEN == "" || item.Category == "" {
			t.Errorf("item %+v is incomplete", item)
		}
	}
}

func TestPrepTitleFallsBackToThai(t *testing.T) {
	item := PrepTemplateItem{TitleTH: "ก", TitleEN: "a", Category: PrepOther}
	if got := item.Title("en"); got != "a" {
		t.Errorf("en title = %q", got)
	}
	if got := item.Title("th"); got != "ก" {
		t.Errorf("th title = %q", got)
	}
	// No locale, and an unknown one, both take the product's first language.
	if got := item.Title(""); got != "ก" {
		t.Errorf("default title = %q", got)
	}
	blank := PrepTemplateItem{TitleTH: "ก", Category: PrepOther}
	if got := blank.Title("en"); got != "ก" {
		t.Errorf("missing translation = %q, want the Thai", got)
	}
}
