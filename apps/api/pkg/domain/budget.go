package domain

// Budget turns item costs into the numbers the group argues about: total,
// per-person, and what is already paid for (DEV_SPEC M7 / A7.x).
//
// Money never uses float in the DB (DECIMAL(12,2)); keep the rounding rules in
// one place here so the API and the export agree to the last baht.

// Cost basis values.
const (
	BasisPerPerson = "per_person"
	BasisPerGroup  = "per_group"
	BasisPerNight  = "per_night"
	BasisPerUnit   = "per_unit"
)

type CostInput struct {
	ItemID    string
	Category  string // derived from item type
	Amount    float64
	Currency  string
	Basis     string
	Nights    int
	IsPrepaid bool
}

type BudgetSummary struct {
	Currency       string             `json:"currency"`
	Total          float64            `json:"total"`
	PerPerson      float64            `json:"per_person"`
	PrepaidTotal   float64            `json:"prepaid_total"`
	RemainingTotal float64            `json:"remaining_total"`
	ByCategory     map[string]float64 `json:"by_category"`
}

// ComputeBudget converts every cost to the trip's home currency using fxRate
// and splits it across partySize.
//
// TODO(A7.1): implement + unit tests covering each basis, prepaid handling,
// and a zero/missing fx rate.
func ComputeBudget(costs []CostInput, partySize int, fxRate float64, homeCurrency string) BudgetSummary {
	return BudgetSummary{Currency: homeCurrency, ByCategory: map[string]float64{}}
}
