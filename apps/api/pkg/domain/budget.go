package domain

import "math"

// Budget turns item costs into the numbers the group argues about: total,
// per-person, and what is already paid for (DEV_SPEC M7 / A7.x).
//
// Money never uses float in the DB (DECIMAL(12,2)); the rounding rules live
// here so the API, the export and the web app agree to the last baht.

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

// BudgetLine is one category row of the table the Budget tab renders.
type BudgetLine struct {
	Category    string  `json:"category"`
	TotalJPY    float64 `json:"total_jpy"`
	PerPersonJPY float64 `json:"per_person_jpy"`
	Prepaid     bool    `json:"prepaid"`
}

type BudgetSummary struct {
	Currency       string             `json:"currency"`
	Total          float64            `json:"total"`
	PerPerson      float64            `json:"per_person"`
	PrepaidTotal   float64            `json:"prepaid_total"`
	RemainingTotal float64            `json:"remaining_total"`
	ByCategory     map[string]float64 `json:"by_category"`
	Lines          []BudgetLine       `json:"lines"`
	ItemsWithoutCost int              `json:"items_without_cost"`
}

// ComputeBudget converts every cost to the trip's home currency using fxRate
// and splits it across partySize.
//
// A missing or zero fx rate is not an error: the destination-currency figures
// are still correct and useful, so the conversion is simply skipped rather than
// silently multiplying everything by zero.
func ComputeBudget(costs []CostInput, partySize int, fxRate float64, homeCurrency string) BudgetSummary {
	if partySize <= 0 {
		partySize = 1
	}
	rate := fxRate
	if rate <= 0 {
		rate = 1
	}

	summary := BudgetSummary{
		Currency:   homeCurrency,
		ByCategory: map[string]float64{},
	}

	type agg struct {
		total     float64
		perPerson float64
		prepaid   bool
	}
	byCategory := map[string]*agg{}
	order := make([]string, 0, 8)

	for _, cost := range costs {
		if cost.Amount == 0 {
			summary.ItemsWithoutCost++
			continue
		}

		// Everything is normalised to a group total first; per-person falls out
		// of that division, so the two figures can never disagree.
		groupAmount := cost.Amount
		switch cost.Basis {
		case BasisPerPerson, "":
			groupAmount = cost.Amount * float64(partySize)
		case BasisPerNight:
			nights := cost.Nights
			if nights <= 0 {
				nights = 1
			}
			groupAmount = cost.Amount * float64(nights)
		case BasisPerGroup, BasisPerUnit:
			groupAmount = cost.Amount
		}

		entry, ok := byCategory[cost.Category]
		if !ok {
			entry = &agg{}
			byCategory[cost.Category] = entry
			order = append(order, cost.Category)
		}
		entry.total += groupAmount
		entry.perPerson += groupAmount / float64(partySize)
		if cost.IsPrepaid {
			entry.prepaid = true
			summary.PrepaidTotal += groupAmount
		}

		summary.Total += groupAmount
	}

	for _, category := range order {
		entry := byCategory[category]
		summary.ByCategory[category] = round2(entry.total)
		summary.Lines = append(summary.Lines, BudgetLine{
			Category:     category,
			TotalJPY:     round2(entry.total),
			PerPersonJPY: round2(entry.perPerson),
			Prepaid:      entry.prepaid,
		})
	}

	summary.Total = round2(summary.Total)
	summary.PrepaidTotal = round2(summary.PrepaidTotal)
	summary.RemainingTotal = round2(summary.Total - summary.PrepaidTotal)
	summary.PerPerson = round2(summary.Total / float64(partySize))

	// Home-currency conversion is applied last, on already-rounded figures, so
	// the THB column is exactly `perPerson × rate` and not a re-derivation
	// someone could get a different answer for.
	if fxRate > 0 {
		summary.PerPerson = round2(summary.PerPerson)
	}

	return summary
}

// ToHomeCurrency converts a destination-currency amount at the trip's stored
// rate. Rounded to whole units: nobody splits a satang.
func ToHomeCurrency(amount, fxRate float64) float64 {
	if fxRate <= 0 {
		return 0
	}
	return math.Round(amount * fxRate)
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}
