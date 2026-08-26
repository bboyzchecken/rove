package domain

import "testing"

// A7.1 — the rollup rules the Budget tab depends on. Money maths is the one
// place a quiet regression turns into a group argument, so every basis and
// every rounding rule gets its own case.

func TestComputeBudgetPerPersonBasisMultipliesByParty(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ตั๋วเข้า", Amount: 1000, Basis: BasisPerPerson},
	}, 4, 0, "THB")

	if got.Total != 4000 {
		t.Errorf("total = %v, want 4000 — per-person cost × 4 people", got.Total)
	}
	if got.PerPerson != 1000 {
		t.Errorf("per person = %v, want the sticker price back", got.PerPerson)
	}
}

func TestComputeBudgetEmptyBasisMeansPerPerson(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ของกิน", Amount: 500, Basis: ""},
	}, 2, 0, "THB")
	if got.Total != 1000 {
		t.Errorf("total = %v, want 1000 — missing basis defaults to per person", got.Total)
	}
}

func TestComputeBudgetPerNightMultipliesByNights(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "stay", Category: "ที่พัก", Amount: 8000, Basis: BasisPerNight, Nights: 5},
	}, 4, 0, "THB")
	if got.Total != 40000 {
		t.Errorf("total = %v, want 40000 — 8000 × 5 nights, party size irrelevant", got.Total)
	}
	if got.PerPerson != 10000 {
		t.Errorf("per person = %v, want 10000", got.PerPerson)
	}

	// Zero nights is treated as one: a stay with no dates yet still costs at
	// least one night, never nothing.
	oneNight := ComputeBudget([]CostInput{
		{ItemID: "stay", Category: "ที่พัก", Amount: 8000, Basis: BasisPerNight},
	}, 4, 0, "THB")
	if oneNight.Total != 8000 {
		t.Errorf("total with 0 nights = %v, want 8000", oneNight.Total)
	}
}

func TestComputeBudgetGroupAndUnitBasesAreFlat(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "van", Category: "เดินทาง", Amount: 12000, Basis: BasisPerGroup},
		{ItemID: "sim", Category: "อื่นๆ", Amount: 300, Basis: BasisPerUnit},
	}, 6, 0, "THB")
	if got.Total != 12300 {
		t.Errorf("total = %v, want 12300 — flat costs never multiply", got.Total)
	}
	if got.PerPerson != 2050 {
		t.Errorf("per person = %v, want 12300 / 6", got.PerPerson)
	}
}

func TestComputeBudgetZeroAmountCountsAsMissing(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ของกิน", Amount: 0},
		{ItemID: "b", Category: "ของกิน", Amount: 0},
		{ItemID: "c", Category: "ของกิน", Amount: 400, Basis: BasisPerGroup},
	}, 2, 0, "THB")

	if got.ItemsWithoutCost != 2 {
		t.Errorf("items without cost = %d, want 2", got.ItemsWithoutCost)
	}
	if got.Total != 400 {
		t.Errorf("total = %v — a zero amount must not drag categories in", got.Total)
	}
}

func TestComputeBudgetPrepaidSplitsRemaining(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "stay", Category: "ที่พัก", Amount: 10000, Basis: BasisPerGroup, IsPrepaid: true},
		{ItemID: "food", Category: "ของกิน", Amount: 6000, Basis: BasisPerGroup},
	}, 2, 0, "THB")

	if got.PrepaidTotal != 10000 {
		t.Errorf("prepaid = %v, want 10000", got.PrepaidTotal)
	}
	if got.RemainingTotal != 6000 {
		t.Errorf("remaining = %v, want total − prepaid", got.RemainingTotal)
	}

	var stay *BudgetLine
	for i := range got.Lines {
		if got.Lines[i].Category == "ที่พัก" {
			stay = &got.Lines[i]
		}
	}
	if stay == nil || !stay.Prepaid {
		t.Error("the prepaid category line must carry the flag the tab renders")
	}
}

func TestComputeBudgetCategoryLinesKeepFirstSeenOrder(t *testing.T) {
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ของกิน", Amount: 100, Basis: BasisPerGroup},
		{ItemID: "b", Category: "ตั๋วเข้า", Amount: 200, Basis: BasisPerGroup},
		{ItemID: "c", Category: "ของกิน", Amount: 300, Basis: BasisPerGroup},
	}, 1, 0, "THB")

	if len(got.Lines) != 2 {
		t.Fatalf("%d lines, want 2", len(got.Lines))
	}
	if got.Lines[0].Category != "ของกิน" || got.Lines[1].Category != "ตั๋วเข้า" {
		t.Errorf("line order = %q, %q — must follow first appearance, not the map", got.Lines[0].Category, got.Lines[1].Category)
	}
	if got.Lines[0].TotalJPY != 400 {
		t.Errorf("ของกิน total = %v, want the two entries summed", got.Lines[0].TotalJPY)
	}
	if got.ByCategory["ของกิน"] != 400 {
		t.Errorf("ByCategory = %v, want 400", got.ByCategory["ของกิน"])
	}
}

func TestComputeBudgetDegenerateInputs(t *testing.T) {
	// Party size zero or negative is treated as one person, never a division
	// by zero.
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ของกิน", Amount: 100, Basis: BasisPerGroup},
	}, 0, 0, "THB")
	if got.PerPerson != 100 {
		t.Errorf("per person with party 0 = %v, want 100", got.PerPerson)
	}

	empty := ComputeBudget(nil, 4, 0.23, "THB")
	if empty.Total != 0 || empty.PerPerson != 0 || len(empty.Lines) != 0 {
		t.Errorf("empty plan produced numbers: %+v", empty)
	}
	if empty.Currency != "THB" {
		t.Errorf("currency = %q, want passthrough", empty.Currency)
	}
}

func TestComputeBudgetRoundsToTwoPlaces(t *testing.T) {
	// 100 / 3 people = 33.333… — the tab shows 33.33 and the sum of parts is
	// allowed to differ from the total by a satang, never by more.
	got := ComputeBudget([]CostInput{
		{ItemID: "a", Category: "ของกิน", Amount: 100, Basis: BasisPerGroup},
	}, 3, 0, "THB")
	if got.PerPerson != 33.33 {
		t.Errorf("per person = %v, want 33.33", got.PerPerson)
	}
}

func TestToHomeCurrency(t *testing.T) {
	// Whole-unit rounding: nobody splits a satang.
	if got := ToHomeCurrency(1000, 0.2349); got != 235 {
		t.Errorf("1000 × 0.2349 = %v, want 235", got)
	}
	if got := ToHomeCurrency(1000, 0.2344); got != 234 {
		t.Errorf("1000 × 0.2344 = %v, want 234", got)
	}
	// A missing rate converts to nothing rather than pretending 1:1.
	if got := ToHomeCurrency(1000, 0); got != 0 {
		t.Errorf("zero rate = %v, want 0", got)
	}
	if got := ToHomeCurrency(1000, -1); got != 0 {
		t.Errorf("negative rate = %v, want 0", got)
	}
}
