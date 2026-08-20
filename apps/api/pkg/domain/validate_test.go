package domain

import (
	"testing"
	"time"
)

// 2026-04-06 is a Monday, which is the day most Japanese museums close.
var monday = time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
var tuesday = monday.AddDate(0, 0, 1)

func codes(issues []Issue) map[string]int {
	m := map[string]int{}
	for _, i := range issues {
		m[i.Code]++
	}
	return m
}

func TestValidatePlanClosedDay(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: monday,
			Items: []ValidationItem{{ID: "i1", Title: "Ueno Museum", POIID: "p1", StartTime: "10:00"}},
		}},
		POIs: map[string]POIFacts{
			"p1": {ID: "p1", Name: "Ueno Museum", ClosedDays: []string{"monday"}},
		},
	}

	got := ValidatePlan(in)

	if codes(got)[IssueClosedDay] != 1 {
		t.Fatalf("expected one closed_day issue, got %+v", got)
	}
	if got[0].Severity != SeverityError {
		t.Errorf("closed_day should be an error, got %q", got[0].Severity)
	}
}

func TestValidatePlanClosedDayNotTriggeredOnOtherDays(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{{ID: "i1", Title: "Ueno Museum", POIID: "p1", StartTime: "10:00"}},
		}},
		POIs: map[string]POIFacts{
			"p1": {ID: "p1", Name: "Ueno Museum", ClosedDays: []string{"monday"}},
		},
	}

	if n := codes(ValidatePlan(in))[IssueClosedDay]; n != 0 {
		t.Errorf("closed_day fired on an open day (%d issues)", n)
	}
}

func TestValidatePlanOutsideHours(t *testing.T) {
	pois := map[string]POIFacts{
		"p1": {ID: "p1", Name: "Sensoji", OpenHours: map[string]string{"tuesday": "09:00-17:00"}},
	}

	cases := []struct {
		name       string
		start, end string
		want       int
	}{
		{"inside the window", "10:00", "11:30", 0},
		{"starts before opening", "07:00", "08:00", 1},
		{"ends after closing", "16:00", "19:00", 1},
		{"exactly at the edges", "09:00", "17:00", 0},
		{"no start time is not checked", "", "", 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := ValidationInput{
				Days: []ValidationDay{{
					Index: 0, Date: tuesday,
					Items: []ValidationItem{{ID: "i1", Title: "Sensoji", POIID: "p1", StartTime: tc.start, EndTime: tc.end}},
				}},
				POIs: pois,
			}
			if n := codes(ValidatePlan(in))[IssueOutsideHours]; n != tc.want {
				t.Errorf("outside_hours count = %d, want %d", n, tc.want)
			}
		})
	}
}

// Unknown hours must stay silent. Warning on every POI we have no data for
// would train people to ignore the warnings entirely.
func TestValidatePlanUnknownHoursIsNotAWarning(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{{ID: "i1", Title: "Somewhere", POIID: "p1", StartTime: "06:00"}},
		}},
		POIs: map[string]POIFacts{"p1": {ID: "p1", Name: "Somewhere"}},
	}

	if n := codes(ValidatePlan(in))[IssueOutsideHours]; n != 0 {
		t.Errorf("outside_hours fired without opening-hours data (%d)", n)
	}
}

func TestValidatePlanDayTooLong(t *testing.T) {
	items := make([]ValidationItem, 7)
	for i := range items {
		items[i] = ValidationItem{ID: string(rune('a' + i)), Title: "stop"}
	}
	in := ValidationInput{
		Days:           []ValidationDay{{Index: 0, Date: tuesday, Items: items}},
		MaxItemsPerDay: MaxChillItems,
	}

	if n := codes(ValidatePlan(in))[IssueDayTooLong]; n != 1 {
		t.Errorf("day_too_long count = %d, want 1", n)
	}
}

func TestValidatePlanTravelUnrealistic(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{
				{ID: "i1", Title: "Fuji", TravelMin: 15, TravelMinRealistic: 120},
				{ID: "i2", Title: "Nearby", TravelMin: 15, TravelMinRealistic: 20}, // within slack
			},
		}},
		TravelSlackMin: DefaultTravelSlackMin,
	}

	got := ValidatePlan(in)

	if n := codes(got)[IssueTravelUnrealistic]; n != 1 {
		t.Fatalf("travel_unrealistic count = %d, want 1: %+v", n, got)
	}
}

func TestValidatePlanDuplicatePOI(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{
			{Index: 0, Date: tuesday, Items: []ValidationItem{{ID: "i1", Title: "Skytree", POIID: "p1"}}},
			{Index: 1, Date: tuesday, Items: []ValidationItem{{ID: "i2", Title: "Skytree", POIID: "p1"}}},
		},
		POIs: map[string]POIFacts{"p1": {ID: "p1", Name: "Skytree"}},
	}

	got := ValidatePlan(in)

	if n := codes(got)[IssueDuplicatePOI]; n != 1 {
		t.Errorf("duplicate_poi count = %d, want 1", n)
	}
}

// Items without a poi_id are free text; two "lunch" entries are not a duplicate.
func TestValidatePlanDuplicateIgnoresItemsWithoutPOI(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{{ID: "i1", Title: "lunch"}, {ID: "i2", Title: "lunch"}},
		}},
	}

	if n := codes(ValidatePlan(in))[IssueDuplicatePOI]; n != 0 {
		t.Errorf("duplicate_poi fired on POI-less items (%d)", n)
	}
}

func TestValidatePlanMustDoMissing(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{{ID: "i1", Title: "Tokyo Skytree", POIID: "p1"}},
		}},
		POIs: map[string]POIFacts{"p1": {ID: "p1", Name: "Tokyo Skytree"}},
		Wishes: []WishInput{
			{ID: "w1", Kind: KindMust, Text: "Tokyo Skytree", POIID: "p1"},
			{ID: "w2", Kind: KindMust, Text: "DisneySea"},
			{ID: "w3", Kind: KindNice, Text: "Kawagoe"}, // nice-to-have never errors
		},
	}

	got := ValidatePlan(in)

	if n := codes(got)[IssueMustDoMissing]; n != 1 {
		t.Fatalf("must_do_missing count = %d, want 1: %+v", n, got)
	}
	if !HasErrors(got) {
		t.Error("a missing must-do should make HasErrors true")
	}
}

func TestValidatePlanZoneHop(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{
				{ID: "i1", Title: "Asakusa", Zone: "tokyo_east"},
				{ID: "i2", Title: "Kawaguchiko", Zone: "fuji"},
			},
		}},
	}

	if n := codes(ValidatePlan(in))[IssueZoneHop]; n != 1 {
		t.Errorf("zone_hop count = %d, want 1", n)
	}
}

func TestValidatePlanNeighbouringZonesAreFine(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{
				{ID: "i1", Title: "Asakusa", Zone: "tokyo_east"},
				{ID: "i2", Title: "Odaiba", Zone: "tokyo_bay"},
			},
		}},
	}

	if n := codes(ValidatePlan(in))[IssueZoneHop]; n != 0 {
		t.Errorf("zone_hop fired on neighbouring zones (%d)", n)
	}
}

func TestValidatePlanCleanPlanHasNoIssues(t *testing.T) {
	in := ValidationInput{
		Days: []ValidationDay{{
			Index: 0, Date: tuesday,
			Items: []ValidationItem{
				{ID: "i1", Title: "Sensoji", POIID: "p1", StartTime: "09:30", EndTime: "11:00", Zone: "tokyo_east"},
			},
		}},
		POIs: map[string]POIFacts{
			"p1": {ID: "p1", Name: "Sensoji", OpenHours: map[string]string{"tuesday": "06:00-17:00"}},
		},
		Wishes:         []WishInput{{ID: "w1", Kind: KindMust, Text: "Sensoji", POIID: "p1"}},
		MaxItemsPerDay: MaxNormalItems,
	}

	if got := ValidatePlan(in); len(got) != 0 {
		t.Errorf("clean plan produced issues: %+v", got)
	}
}

func TestParseWindowCrossingMidnight(t *testing.T) {
	open, close, ok := parseWindow("18:00-02:00")
	if !ok {
		t.Fatal("parseWindow failed on a window crossing midnight")
	}
	if open != 18*60 || close != 26*60 {
		t.Errorf("open/close = %d/%d, want %d/%d", open, close, 18*60, 26*60)
	}
}
