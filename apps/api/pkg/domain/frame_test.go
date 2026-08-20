package domain

import (
	"testing"
	"time"
)

func date(y, m, d, hh, mm int) time.Time {
	return time.Date(y, time.Month(m), d, hh, mm, 0, 0, time.UTC)
}

func TestBuildFrameDayCount(t *testing.T) {
	got, err := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 9, 0, 0),
		PartySize: 4,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 6th to 9th inclusive is four days.
	if len(got.Days) != 4 {
		t.Errorf("day count = %d, want 4", len(got.Days))
	}
	if got.Days[0].Date != "2026-04-06" || got.Days[3].Date != "2026-04-09" {
		t.Errorf("date range = %s..%s", got.Days[0].Date, got.Days[3].Date)
	}
}

func TestBuildFrameRejectsBackwardsRange(t *testing.T) {
	_, err := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 9, 0, 0),
		EndDate:   date(2026, 4, 6, 0, 0),
	})
	if err == nil {
		t.Error("expected an error for an end date before the start date")
	}
}

func TestBuildFrameArrivalShortensTheDay(t *testing.T) {
	got, err := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 7, 0, 0),
		Flights: []FrameFlight{
			{Direction: "out", Airport: "NRT", At: date(2026, 4, 6, 15, 0)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Landing 15:00 + 2h slack leaves until 21:00 → 4h.
	if got.Days[0].UsableHours != 4*60 {
		t.Errorf("arrival day usable = %d min, want 240", got.Days[0].UsableHours)
	}
	if len(got.Days[0].Anchors) != 1 || got.Days[0].Anchors[0].Kind != "arrival" {
		t.Errorf("arrival anchor missing: %+v", got.Days[0].Anchors)
	}
	if got.Days[1].UsableHours != fullDayMinutes {
		t.Errorf("a day with no flight should be full, got %d", got.Days[1].UsableHours)
	}
}

// A late arrival leaves nothing planable; the planner must see zero, not a
// negative number it might treat as "plenty of time".
func TestBuildFrameLateArrivalLeavesNoTime(t *testing.T) {
	got, _ := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 6, 0, 0),
		Flights: []FrameFlight{
			{Direction: "out", Airport: "HND", At: date(2026, 4, 6, 23, 30)},
		},
	})

	if got.Days[0].UsableHours != 0 {
		t.Errorf("usable = %d, want 0", got.Days[0].UsableHours)
	}
}

func TestBuildFrameDepartureAnchor(t *testing.T) {
	got, _ := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 6, 0, 0),
		Flights: []FrameFlight{
			{Direction: "return", Airport: "NRT", At: date(2026, 4, 6, 11, 0)},
		},
	})

	if got.Days[0].Anchors[0].Kind != "departure" {
		t.Errorf("kind = %q, want departure", got.Days[0].Anchors[0].Kind)
	}
	// 11:00 minus 2h slack leaves 9h of morning.
	if got.Days[0].UsableHours != 9*60 {
		t.Errorf("usable = %d, want 540", got.Days[0].UsableHours)
	}
}

func TestBuildFrameDatedMustLandsOnItsDay(t *testing.T) {
	got, _ := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 8, 0, 0),
		DatedMusts: []DatedMust{
			{Date: date(2026, 4, 7, 0, 0), Title: "ดอกไม้ไฟ", StartTime: "19:00"},
		},
	})

	if len(got.Days[0].Anchors) != 0 {
		t.Errorf("day 0 should have no anchors, got %+v", got.Days[0].Anchors)
	}
	if len(got.Days[1].Anchors) != 1 || got.Days[1].Anchors[0].Title != "ดอกไม้ไฟ" {
		t.Errorf("dated must did not land on day 1: %+v", got.Days[1].Anchors)
	}
}

// A stay covers the nights between check-in and check-out, not the checkout day.
func TestBuildFramePrepaidStayCoversItsNights(t *testing.T) {
	got, _ := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 9, 0, 0),
		PrepaidStays: []PrepaidStay{
			{CheckIn: date(2026, 4, 6, 15, 0), CheckOut: date(2026, 4, 8, 10, 0), Title: "APA Ueno"},
		},
	})

	hasStay := func(d FrameDay) bool {
		for _, a := range d.Anchors {
			if a.Kind == "stay" {
				return true
			}
		}
		return false
	}

	if !hasStay(got.Days[0]) || !hasStay(got.Days[1]) {
		t.Error("stay should cover the 6th and 7th")
	}
	if hasStay(got.Days[2]) {
		t.Error("stay should not cover the checkout day")
	}
}

func TestBuildFrameDefaults(t *testing.T) {
	got, _ := BuildFrame(FrameInput{
		StartDate: date(2026, 4, 6, 0, 0),
		EndDate:   date(2026, 4, 6, 0, 0),
	})

	if got.PartySize != 1 {
		t.Errorf("PartySize = %d, want 1", got.PartySize)
	}
	if got.MaxItemsPerDay != MaxNormalItems {
		t.Errorf("MaxItemsPerDay = %d, want %d", got.MaxItemsPerDay, MaxNormalItems)
	}
}
