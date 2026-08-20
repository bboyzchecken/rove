package domain

import (
	"testing"
	"time"
)

func day(y, m, d int) *time.Time {
	t := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	return &t
}

func TestComputeStatsCountsOnlyFinishedTrips(t *testing.T) {
	now := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	trips := []TripStat{
		{ID: "1", Country: "JP", Status: "done", StartDate: day(2026, 4, 6), EndDate: day(2026, 4, 9)},
		{ID: "2", Country: "JP", Status: "done", StartDate: day(2025, 1, 1), EndDate: day(2025, 1, 3)},
		{ID: "3", Country: "KR", Status: "planning", StartDate: day(2026, 12, 1), EndDate: day(2026, 12, 5)},
	}

	got := ComputeStats(trips, 45678.5, now)

	if got.TotalTrips != 2 {
		t.Errorf("TotalTrips = %d, want 2 (planning excluded)", got.TotalTrips)
	}
	// 4 days + 3 days
	if got.TotalDays != 7 {
		t.Errorf("TotalDays = %d, want 7", got.TotalDays)
	}
	if len(got.Countries) != 1 || got.Countries[0] != "JP" {
		t.Errorf("Countries = %v, want [JP]", got.Countries)
	}
	if got.TripsThisYear != 1 {
		t.Errorf("TripsThisYear = %d, want 1", got.TripsThisYear)
	}
	if got.TotalSpendTHB != 45678.5 {
		t.Errorf("TotalSpendTHB = %v, want 45678.5", got.TotalSpendTHB)
	}
}

func TestComputeStatsEmpty(t *testing.T) {
	got := ComputeStats(nil, 0, time.Now())

	if got.TotalTrips != 0 || got.TotalDays != 0 {
		t.Errorf("empty stats should be zero, got %+v", got)
	}
	if got.Countries == nil {
		t.Error("Countries must serialise as [] not null")
	}
}

func TestDaysUntil(t *testing.T) {
	now := time.Date(2026, 8, 20, 18, 0, 0, 0, time.UTC)

	cases := []struct {
		name  string
		start *time.Time
		want  int
	}{
		{"future trip", day(2026, 9, 1), 12},
		{"today", day(2026, 8, 20), 0},
		{"already started", day(2026, 8, 18), -2},
		{"no date", nil, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DaysUntil(tc.start, now); got != tc.want {
				t.Errorf("DaysUntil = %d, want %d", got, tc.want)
			}
		})
	}
}
