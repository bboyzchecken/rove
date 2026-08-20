package prep

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
)

func forecast(min, max, rain float64) weather.Forecast {
	return weather.Forecast{Date: time.Now(), TempMinC: min, TempMaxC: max, RainChance: rain}
}

func labels(b models.PrepBlock) []string {
	var entries []models.ChecklistEntry
	_ = json.Unmarshal(b.Checklist, &entries)
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Label)
	}
	return out
}

func hasMatching(list []string, substr string) bool {
	for _, l := range list {
		if strings.Contains(l, substr) {
			return true
		}
	}
	return false
}

func TestBandFor(t *testing.T) {
	cases := []struct {
		name     string
		in       []weather.Forecast
		wantLow  TempBand
		wantHigh TempBand
	}{
		{"winter", []weather.Forecast{forecast(1, 8, 0)}, BandFreezing, BandCold},
		{"spring", []weather.Forecast{forecast(12, 20, 0)}, BandCold, BandMild},
		{"summer", []weather.Forecast{forecast(25, 34, 0)}, BandHot, BandHot},
		{"no data defaults to mild", nil, BandMild, BandMild},
		{
			"spans the whole trip, not the average",
			[]weather.Forecast{forecast(2, 10, 0), forecast(18, 26, 0)},
			BandFreezing, BandHot,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			low, high := BandFor(tc.in)
			if low != tc.wantLow || high != tc.wantHigh {
				t.Errorf("bands = %s/%s, want %s/%s", low, high, tc.wantLow, tc.wantHigh)
			}
		})
	}
}

func TestPackingBlockAddsColdWeatherItems(t *testing.T) {
	got := packingBlock(&models.Trip{}, []weather.Forecast{forecast(1, 6, 0)}, nil, 0)

	list := labels(got)
	if !hasMatching(list, "โค้ท") {
		t.Errorf("freezing trip has no coat: %v", list)
	}
	if !hasMatching(list, "พาสปอร์ต") {
		t.Error("packing list is missing the always-items")
	}
}

func TestPackingBlockRespondsToItemTags(t *testing.T) {
	got := packingBlock(&models.Trip{}, []weather.Forecast{forecast(18, 24, 0)},
		[]string{"theme_park", "onsen"}, 0)

	list := labels(got)
	if !hasMatching(list, "พาวเวอร์แบงก์") {
		t.Errorf("theme park day has no power bank: %v", list)
	}
	if !hasMatching(list, "ผ้าเช็ดตัว") {
		t.Errorf("onsen day has no towel: %v", list)
	}
}

func TestPackingBlockAddsUmbrellaWhenRainy(t *testing.T) {
	dry := labels(packingBlock(&models.Trip{}, []weather.Forecast{forecast(18, 24, 10)}, nil, 0))
	wet := labels(packingBlock(&models.Trip{}, []weather.Forecast{forecast(18, 24, 70)}, nil, 0))

	if hasMatching(dry, "ร่ม") {
		t.Error("dry forecast should not add an umbrella")
	}
	if !hasMatching(wet, "ร่ม") {
		t.Error("rainy forecast should add an umbrella")
	}
}

func TestPackingBlockHasNoDuplicates(t *testing.T) {
	got := packingBlock(&models.Trip{},
		[]weather.Forecast{forecast(2, 26, 0)}, // spans two bands
		[]string{"theme_park", "theme_park"}, 0)

	seen := map[string]bool{}
	for _, l := range labels(got) {
		if seen[l] {
			t.Errorf("duplicate packing item: %q", l)
		}
		seen[l] = true
	}
}

// The IDP line is noise for a group taking the train, so it only appears when
// somebody said they can drive.
func TestDocsBlockOnlyMentionsIDPWhenSomeoneDrives(t *testing.T) {
	without := labels(docsBlock(&models.Trip{}, []models.MemberProfile{{CanDrive: false}}, 0))
	with := labels(docsBlock(&models.Trip{}, []models.MemberProfile{{CanDrive: false}, {CanDrive: true}}, 0))

	if hasMatching(without, "IDP") {
		t.Error("IDP listed for a group with no drivers")
	}
	if !hasMatching(with, "IDP") {
		t.Error("IDP missing for a group with a driver")
	}
}

func TestDocsBlockAlwaysHasVisitJapanWeb(t *testing.T) {
	if !hasMatching(labels(docsBlock(&models.Trip{}, nil, 0)), "Visit Japan Web") {
		t.Error("Visit Japan Web is missing from the docs checklist")
	}
}

func TestWeatherBlockFallsBackToASeasonNote(t *testing.T) {
	start := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	trip := &models.Trip{StartDate: &start}

	got, ok := weatherBlock(trip, nil, 0)

	if !ok {
		t.Fatal("expected a season note when there is no forecast")
	}
	if got.Trigger != "season" {
		t.Errorf("Trigger = %q, want season", got.Trigger)
	}
	if !strings.Contains(got.ContentMD, "ฤดูหนาว") {
		t.Errorf("January note does not mention winter: %q", got.ContentMD)
	}
}

func TestWeatherBlockRendersTheForecastTable(t *testing.T) {
	got, ok := weatherBlock(&models.Trip{}, []weather.Forecast{forecast(10, 18, 20)}, 0)

	if !ok {
		t.Fatal("expected a forecast block")
	}
	if !strings.Contains(got.ContentMD, "|") {
		t.Errorf("forecast block is not a table: %q", got.ContentMD)
	}
}
