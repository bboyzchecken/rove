package domain

import "testing"

// M6 — the compare table's numbers and the pre-generate conflict check.

func TestComputeVariantMetricsSumsAndConverts(t *testing.T) {
	items := []VariantItemInput{
		{ID: "a", DayIndex: 1, Title: "Sensoji", POIID: "poi-1", CostJPY: 1000, TravelMin: 30, StartTime: "09:00"},
		{ID: "b", DayIndex: 1, Title: "Skytree", POIID: "poi-2", CostJPY: 2100, TravelMin: 20, StartTime: "11:00"},
		{ID: "c", DayIndex: 2, Title: "DisneySea", POIID: "poi-3", CostJPY: 8400, StartTime: "08:00"},
	}
	wishes := []WishInput{
		{ID: "w1", Kind: "must", Text: "DisneySea", POIID: "poi-3"},
		{ID: "w2", Kind: "nice", Text: "Ghibli Museum"},
	}

	m := ComputeVariantMetrics(items, wishes, 4, 0.23)

	if m.DayCount != 2 || m.ItemCount != 3 {
		t.Errorf("days/items = %d/%d, want 2/3", m.DayCount, m.ItemCount)
	}
	if m.TotalCostJPY != 11500 {
		t.Errorf("total = %v, want 11500", m.TotalCostJPY)
	}
	// Costs are per-person: THB per person is the sum converted and rounded.
	if m.PerPersonTHB != 2645 {
		t.Errorf("per person THB = %v, want 2645", m.PerPersonTHB)
	}
	if m.TravelMinutes != 50 {
		t.Errorf("travel = %d, want 50", m.TravelMinutes)
	}
	if m.MustCovered != 1 || m.MustTotal != 1 {
		t.Errorf("must = %d/%d, want 1/1", m.MustCovered, m.MustTotal)
	}
}

func TestComputeVariantMetricsCountsWarnings(t *testing.T) {
	// Same POI twice → at least the duplicate warning must show up in the count.
	items := []VariantItemInput{
		{ID: "a", DayIndex: 1, Title: "Sensoji", POIID: "poi-1", StartTime: "09:00"},
		{ID: "b", DayIndex: 2, Title: "Sensoji", POIID: "poi-1", StartTime: "09:00"},
	}
	m := ComputeVariantMetrics(items, nil, 2, 0.23)
	if m.WarningCount == 0 {
		t.Error("duplicate POI produced no warning — the compare table would hide a real problem")
	}
}

func TestDetectConflictsPace(t *testing.T) {
	conflicts := DetectConflicts([]ConflictProfile{
		{UserID: "u1", Name: "ตอง", Pace: "relaxed"},
		{UserID: "u2", Name: "มายด์", Pace: "packed"},
		{UserID: "u3", Name: "ปอนด์", Pace: "balanced"},
	}, nil)

	if len(conflicts) != 1 || conflicts[0].Kind != "pace" {
		t.Fatalf("got %+v, want one pace conflict", conflicts)
	}

	// All-balanced is not a conflict.
	if got := DetectConflicts([]ConflictProfile{
		{Name: "a", Pace: "balanced"}, {Name: "b", Pace: "balanced"},
	}, nil); len(got) != 0 {
		t.Errorf("agreeing group flagged: %+v", got)
	}
}

func TestDetectConflictsBudget(t *testing.T) {
	conflicts := DetectConflicts([]ConflictProfile{
		{Name: "หรู", Pace: "balanced", BudgetMinTHB: 60_000, BudgetMaxTHB: 90_000},
		{Name: "ประหยัด", Pace: "balanced", BudgetMinTHB: 20_000, BudgetMaxTHB: 35_000},
	}, nil)

	if len(conflicts) != 1 || conflicts[0].Kind != "budget" || conflicts[0].Severity != "error" {
		t.Fatalf("got %+v, want one budget error", conflicts)
	}

	// Overlapping ranges are fine; an unfilled range (max 0) says nothing.
	if got := DetectConflicts([]ConflictProfile{
		{Name: "a", BudgetMinTHB: 30_000, BudgetMaxTHB: 50_000},
		{Name: "b", BudgetMinTHB: 40_000, BudgetMaxTHB: 70_000},
		{Name: "c"}, // never filled the form in
	}, nil); len(got) != 0 {
		t.Errorf("overlapping budgets flagged: %+v", got)
	}
}

func TestDetectConflictsWish(t *testing.T) {
	conflicts := DetectConflicts(nil, []ConflictWish{
		{Kind: "must", Text: "Disneyland", OwnerName: "ตอง"},
		{Kind: "avoid", Text: "disneyland", OwnerName: "มายด์"},
		{Kind: "must", Text: "Skytree", OwnerName: "ปอนด์"},
	})

	if len(conflicts) != 1 || conflicts[0].Kind != "wish" {
		t.Fatalf("got %+v, want one wish conflict", conflicts)
	}
}

func TestFormatTHB(t *testing.T) {
	cases := map[int]string{0: "0", 900: "900", 45000: "45,000", 1234567: "1,234,567"}
	for in, want := range cases {
		if got := formatTHB(in); got != want {
			t.Errorf("formatTHB(%d) = %q, want %q", in, got, want)
		}
	}
}
