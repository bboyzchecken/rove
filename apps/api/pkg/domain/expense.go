package domain

import "sort"

// Expense is money actually spent, split "ขุนทอง" style: a shared entry is
// divided among its participants, a personal entry belongs to whoever paid
// (DEV_SPEC M16 / A16.2).
//
// Deliberately separate from budget.go. The Budget tab is an estimate from the
// plan; the Expense tab is reality. Mixing them is the bug this split prevents.

const (
	SplitShared   = "shared"
	SplitPersonal = "personal"
)

// ExpenseInput is one expense_entries row, flattened.
type ExpenseInput struct {
	ID           string
	PaidBy       string
	Amount       float64
	Currency     string
	Category     string
	SplitType    string
	Participants []string // read only when SplitType is shared
	// FxRate is the rate snapshotted when the entry was saved, so a summary
	// does not drift as today's rate moves.
	FxRate float64
}

// MemberBalance is one row of the "who owes whom" table.
type MemberBalance struct {
	UserID string `json:"user_id"`
	// Paid is what this member actually put on the table.
	Paid float64 `json:"paid"`
	// Owed is this member's share of the shared entries.
	Owed float64 `json:"owed"`
	// Personal is their own spending, excluded from any settlement.
	Personal float64 `json:"personal"`
	// Net = Paid - Owed. Positive means the group owes them.
	Net float64 `json:"net"`
}

// Settlement is one suggested transfer that reduces the debt graph.
type Settlement struct {
	FromUserID string  `json:"from_user_id"`
	ToUserID   string  `json:"to_user_id"`
	Amount     float64 `json:"amount"`
}

type ExpenseSummary struct {
	Currency    string             `json:"currency"`
	Total       float64            `json:"total"`
	SharedTotal float64            `json:"shared_total"`
	ByCategory  map[string]float64 `json:"by_category"`
	PerMember   []MemberBalance    `json:"per_member"`
	Settlements []Settlement       `json:"settlements"`
}

// ComputeExpenseSummary converts every entry into homeCurrency using the rate
// stored on that entry, then works out each member's balance.
//
// members is the full trip roster, so a member who paid nothing still appears
// with their share of the shared costs.
func ComputeExpenseSummary(entries []ExpenseInput, members []string, homeCurrency string) ExpenseSummary {
	s := ExpenseSummary{
		Currency:   homeCurrency,
		ByCategory: map[string]float64{},
	}

	paid := map[string]float64{}
	owed := map[string]float64{}
	personal := map[string]float64{}
	for _, m := range members {
		paid[m], owed[m], personal[m] = 0, 0, 0
	}

	for _, e := range entries {
		home := Convert(e.Amount, e.Currency, homeCurrency, e.FxRate)
		if home == 0 {
			continue
		}

		category := e.Category
		if category == "" {
			category = "other"
		}
		s.ByCategory[category] = Round2(s.ByCategory[category] + home)
		s.Total = Round2(s.Total + home)
		paid[e.PaidBy] = Round2(paid[e.PaidBy] + home)

		if e.SplitType == SplitPersonal {
			personal[e.PaidBy] = Round2(personal[e.PaidBy] + home)
			continue
		}

		// A shared entry with no explicit participants is split across everyone
		// — that is what "shared" means when nobody narrowed it down.
		participants := e.Participants
		if len(participants) == 0 {
			participants = members
		}
		if len(participants) == 0 {
			// No roster at all: the payer carries it rather than the amount
			// vanishing from the balances.
			owed[e.PaidBy] = Round2(owed[e.PaidBy] + home)
			s.SharedTotal = Round2(s.SharedTotal + home)
			continue
		}

		s.SharedTotal = Round2(s.SharedTotal + home)
		share := home / float64(len(participants))
		for _, p := range participants {
			owed[p] = Round2(owed[p] + share)
		}
	}

	// Anyone who appears only as a participant still needs a row.
	seen := map[string]bool{}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		if !seen[m] {
			seen[m] = true
			ids = append(ids, m)
		}
	}
	for id := range owed {
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	for id := range paid {
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)

	for _, id := range ids {
		s.PerMember = append(s.PerMember, MemberBalance{
			UserID:   id,
			Paid:     Round2(paid[id]),
			Owed:     Round2(owed[id]),
			Personal: Round2(personal[id]),
			Net:      Round2(paid[id] - owed[id]),
		})
	}

	s.Settlements = settle(s.PerMember)
	return s
}

// settlementEpsilon is the point below which a balance is called even; without
// it, rounding leaves 0.01-baht transfers in the list forever.
const settlementEpsilon = 0.01

// settle greedily matches the biggest debtor to the biggest creditor. It is not
// the provably minimal set of transfers, but for a group of four to eight it
// produces the same answer and is easy to explain when someone disputes it.
func settle(balances []MemberBalance) []Settlement {
	type entry struct {
		id     string
		amount float64
	}
	var debtors, creditors []entry

	for _, b := range balances {
		switch {
		case b.Net < -settlementEpsilon:
			debtors = append(debtors, entry{b.UserID, -b.Net})
		case b.Net > settlementEpsilon:
			creditors = append(creditors, entry{b.UserID, b.Net})
		}
	}

	// Largest first, then by id so the output is deterministic.
	byAmountDesc := func(s []entry) {
		sort.Slice(s, func(i, j int) bool {
			if s[i].amount != s[j].amount {
				return s[i].amount > s[j].amount
			}
			return s[i].id < s[j].id
		})
	}
	byAmountDesc(debtors)
	byAmountDesc(creditors)

	out := []Settlement{}
	i, j := 0, 0
	for i < len(debtors) && j < len(creditors) {
		amount := debtors[i].amount
		if creditors[j].amount < amount {
			amount = creditors[j].amount
		}
		amount = Round2(amount)

		if amount > settlementEpsilon {
			out = append(out, Settlement{
				FromUserID: debtors[i].id,
				ToUserID:   creditors[j].id,
				Amount:     amount,
			})
		}

		debtors[i].amount = Round2(debtors[i].amount - amount)
		creditors[j].amount = Round2(creditors[j].amount - amount)
		if debtors[i].amount <= settlementEpsilon {
			i++
		}
		if creditors[j].amount <= settlementEpsilon {
			j++
		}
	}
	return out
}
