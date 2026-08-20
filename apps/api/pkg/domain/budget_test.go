package domain

import "testing"

func TestGroupTotal(t *testing.T) {
	cases := []struct {
		name  string
		cost  CostInput
		party int
		want  float64
	}{
		{"per person scales with party", CostInput{Amount: 100, Basis: BasisPerPerson}, 4, 400},
		{"per group is flat", CostInput{Amount: 100, Basis: BasisPerGroup}, 4, 100},
		{"per night scales with nights", CostInput{Amount: 100, Basis: BasisPerNight, Nights: 3}, 4, 300},
		{"per night without nights counts one", CostInput{Amount: 100, Basis: BasisPerNight}, 4, 100},
		{"per unit is flat", CostInput{Amount: 100, Basis: BasisPerUnit}, 4, 100},
		{"unknown basis is flat", CostInput{Amount: 100, Basis: "weird"}, 4, 100},
		{"party size zero is treated as one", CostInput{Amount: 100, Basis: BasisPerPerson}, 0, 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := GroupTotal(tc.cost, tc.party); got != tc.want {
				t.Errorf("GroupTotal = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestComputeBudgetConvertsAndSplits(t *testing.T) {
	// 0.23 THB per JPY, party of 4.
	costs := []CostInput{
		{ItemID: "i1", Category: "ticket", Amount: 1000, Currency: "JPY", Basis: BasisPerPerson},
		{ItemID: "i2", Category: "stay", Amount: 8000, Currency: "JPY", Basis: BasisPerNight, Nights: 2, IsPrepaid: true},
	}

	got := ComputeBudget(costs, 4, 0.23, "THB")

	// tickets: 1000 * 4 * 0.23 = 920 ; stay: 8000 * 2 * 0.23 = 3680
	if got.ByCategory["ticket"] != 920 {
		t.Errorf("ticket = %v, want 920", got.ByCategory["ticket"])
	}
	if got.ByCategory["stay"] != 3680 {
		t.Errorf("stay = %v, want 3680", got.ByCategory["stay"])
	}
	if got.Total != 4600 {
		t.Errorf("Total = %v, want 4600", got.Total)
	}
	if got.PrepaidTotal != 3680 {
		t.Errorf("PrepaidTotal = %v, want 3680", got.PrepaidTotal)
	}
	if got.RemainingTotal != 920 {
		t.Errorf("RemainingTotal = %v, want 920", got.RemainingTotal)
	}
	if got.PerPerson != 1150 {
		t.Errorf("PerPerson = %v, want 1150", got.PerPerson)
	}
	if got.Currency != "THB" {
		t.Errorf("Currency = %v, want THB", got.Currency)
	}
}

// A missing FX rate must leave the numbers alone. Zeroing the budget would be
// worse than showing it in the wrong currency, because it looks correct.
func TestComputeBudgetMissingFxRateDoesNotZero(t *testing.T) {
	costs := []CostInput{{ItemID: "i1", Amount: 1000, Currency: "JPY", Basis: BasisPerGroup}}

	got := ComputeBudget(costs, 2, 0, "THB")

	if got.Total != 1000 {
		t.Errorf("Total = %v, want 1000 (unconverted)", got.Total)
	}
}

func TestComputeBudgetSameCurrencyIsNotConverted(t *testing.T) {
	costs := []CostInput{{ItemID: "i1", Amount: 500, Currency: "THB", Basis: BasisPerGroup}}

	got := ComputeBudget(costs, 2, 0.23, "THB")

	if got.Total != 500 {
		t.Errorf("Total = %v, want 500", got.Total)
	}
}

func TestComputeBudgetCollectsItemsMissingCost(t *testing.T) {
	costs := []CostInput{
		{ItemID: "i1", Amount: 0, Currency: "JPY", Basis: BasisPerPerson},
		{ItemID: "i2", Amount: 100, Currency: "JPY", Basis: BasisPerPerson},
	}

	got := ComputeBudget(costs, 1, 1, "JPY")

	if len(got.ItemsMissingCost) != 1 || got.ItemsMissingCost[0] != "i1" {
		t.Errorf("ItemsMissingCost = %v, want [i1]", got.ItemsMissingCost)
	}
}

func TestComputeBudgetEmpty(t *testing.T) {
	got := ComputeBudget(nil, 3, 0.23, "THB")

	if got.Total != 0 || got.PerPerson != 0 {
		t.Errorf("empty plan should total zero, got %+v", got)
	}
	if got.ByCategory == nil {
		t.Error("ByCategory must be a usable map, not nil")
	}
}
