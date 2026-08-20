package domain

// Budget turns item costs into the numbers the group argues about: total,
// per-person, and what is already paid for (DEV_SPEC M7 / A7.x).
//
// This is an ESTIMATE derived from plan items. Real spending lives in
// expense.go and the two are never added together.

// Cost basis values (mirrors models.CostBasis*).
const (
	BasisPerPerson = "per_person"
	BasisPerGroup  = "per_group"
	BasisPerNight  = "per_night"
	BasisPerUnit   = "per_unit"
)

// CostInput is one plan item's cost, flattened.
type CostInput struct {
	ItemID    string
	Category  string // derived from item type: place/food/stay/transport/...
	Amount    float64
	Currency  string
	Basis     string
	Nights    int // only read for BasisPerNight
	IsPrepaid bool
}

type BudgetSummary struct {
	Currency       string             `json:"currency"`
	Total          float64            `json:"total"`
	PerPerson      float64            `json:"per_person"`
	PrepaidTotal   float64            `json:"prepaid_total"`
	RemainingTotal float64            `json:"remaining_total"`
	ByCategory     map[string]float64 `json:"by_category"`
	// ItemsMissingCost is what W7.2 highlights — the reason a total is too low.
	ItemsMissingCost []string `json:"items_missing_cost"`
}

// GroupTotal expands one cost to what the whole party pays, before FX.
//
//	per_person → amount × partySize
//	per_group  → amount
//	per_night  → amount × nights   (a room rate, already for the whole party)
//	per_unit   → amount            (one ticket, one transfer — as entered)
func GroupTotal(c CostInput, partySize int) float64 {
	if partySize < 1 {
		partySize = 1
	}
	switch c.Basis {
	case BasisPerPerson:
		return c.Amount * float64(partySize)
	case BasisPerNight:
		nights := c.Nights
		if nights < 1 {
			nights = 1
		}
		return c.Amount * float64(nights)
	default: // per_group, per_unit, and anything unrecognised
		return c.Amount
	}
}

// ComputeBudget converts every cost into homeCurrency using fxRate and splits
// the result across partySize.
//
// fxRate is "how many homeCurrency units one unit of the item's currency buys".
// A cost already in homeCurrency is never multiplied; a zero rate leaves the
// amount alone rather than zeroing the budget (see Convert).
func ComputeBudget(costs []CostInput, partySize int, fxRate float64, homeCurrency string) BudgetSummary {
	if partySize < 1 {
		partySize = 1
	}

	s := BudgetSummary{
		Currency:         homeCurrency,
		ByCategory:       map[string]float64{},
		ItemsMissingCost: []string{},
	}

	for _, c := range costs {
		if c.Amount == 0 {
			if c.ItemID != "" {
				s.ItemsMissingCost = append(s.ItemsMissingCost, c.ItemID)
			}
			continue
		}

		home := Convert(GroupTotal(c, partySize), c.Currency, homeCurrency, fxRate)

		category := c.Category
		if category == "" {
			category = "other"
		}
		s.ByCategory[category] = Round2(s.ByCategory[category] + home)
		s.Total = Round2(s.Total + home)
		if c.IsPrepaid {
			s.PrepaidTotal = Round2(s.PrepaidTotal + home)
		}
	}

	s.RemainingTotal = Round2(s.Total - s.PrepaidTotal)
	s.PerPerson = Round2(s.Total / float64(partySize))
	return s
}
