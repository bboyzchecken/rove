package domain

import (
	"math"
	"sort"
)

// Real spending and the settle-up (DEV_SPEC M16 — A16.2).
//
// Twin of `computeExpenses` / `settle` in apps/web/lib/data/domain.ts. Shared
// entries divide evenly across their participants; personal entries never
// touch anyone else's balance, which is the whole reason the two scopes exist.

type ExpenseInput struct {
	ID           string
	Scope        string // shared | personal
	Amount       float64
	Currency     string
	PaidBy       string
	Participants []string
}

type MemberBalance struct {
	UserID      string  `json:"user_id"`
	PaidTHB     float64 `json:"paid_thb"`
	ShareTHB    float64 `json:"share_thb"`
	PersonalTHB float64 `json:"personal_thb"`
	BalanceTHB  float64 `json:"balance_thb"`
}

type Transfer struct {
	FromUserID string  `json:"from_user_id"`
	ToUserID   string  `json:"to_user_id"`
	AmountTHB  float64 `json:"amount_thb"`
}

type ExpenseSummary struct {
	SharedTotalTHB   float64         `json:"shared_total_thb"`
	PersonalTotalTHB float64         `json:"personal_total_thb"`
	TotalTHB         float64         `json:"total_thb"`
	PerMember        []MemberBalance `json:"per_member"`
	Settlements      []Transfer      `json:"settlements"`
}

// SettledPair is a debt the group has already cleared outside the app.
type SettledPair struct {
	FromUserID string
	ToUserID   string
}

// ComputeExpenses splits the bills and nets everyone off.
//
// `fxRate` converts the destination currency to THB; entries already in THB
// are taken as-is. A shared entry with no participants falls back to the whole
// group, because "we all ate" is what an empty list means in practice.
func ComputeExpenses(
	entries []ExpenseInput,
	memberIDs []string,
	fxRate float64,
	settled []SettledPair,
) ExpenseSummary {
	paid := map[string]float64{}
	owed := map[string]float64{}
	personal := map[string]float64{}
	balance := map[string]float64{}

	for _, id := range memberIDs {
		paid[id], owed[id], personal[id], balance[id] = 0, 0, 0, 0
	}

	summary := ExpenseSummary{}

	for _, e := range entries {
		thb := e.Amount
		if e.Currency != "THB" {
			thb = ToHomeCurrency(e.Amount, fxRate)
		}

		if e.Scope == "personal" {
			summary.PersonalTotalTHB += thb
			personal[e.PaidBy] += thb
			continue
		}

		summary.SharedTotalTHB += thb
		paid[e.PaidBy] += thb
		balance[e.PaidBy] += thb

		participants := e.Participants
		if len(participants) == 0 {
			participants = memberIDs
		}
		if len(participants) == 0 {
			continue
		}

		share := thb / float64(len(participants))
		for _, id := range participants {
			owed[id] += share
			balance[id] -= share
		}
	}

	summary.TotalTHB = math.Round(summary.SharedTotalTHB + summary.PersonalTotalTHB)
	summary.SharedTotalTHB = math.Round(summary.SharedTotalTHB)
	summary.PersonalTotalTHB = math.Round(summary.PersonalTotalTHB)

	summary.PerMember = make([]MemberBalance, 0, len(memberIDs))
	for _, id := range memberIDs {
		summary.PerMember = append(summary.PerMember, MemberBalance{
			UserID:      id,
			PaidTHB:     math.Round(paid[id]),
			ShareTHB:    math.Round(owed[id]),
			PersonalTHB: math.Round(personal[id]),
			BalanceTHB:  math.Round(balance[id]),
		})
	}

	done := make(map[string]bool, len(settled))
	for _, s := range settled {
		done[s.FromUserID+">"+s.ToUserID] = true
	}

	for _, t := range Settle(summary.PerMember) {
		if done[t.FromUserID+">"+t.ToUserID] {
			continue
		}
		summary.Settlements = append(summary.Settlements, t)
	}

	return summary
}

// Settle nets balances greedily: the largest debt pays the largest credit,
// repeatedly. For a group of four this always produces at most three
// transfers, which is what makes "โอนกัน 3 ครั้งก็จบ" true.
func Settle(rows []MemberBalance) []Transfer {
	type side struct {
		id     string
		amount float64
	}

	var debtors, creditors []side
	for _, r := range rows {
		switch {
		case r.BalanceTHB < 0:
			debtors = append(debtors, side{r.UserID, -r.BalanceTHB})
		case r.BalanceTHB > 0:
			creditors = append(creditors, side{r.UserID, r.BalanceTHB})
		}
	}

	sort.SliceStable(debtors, func(a, b int) bool { return debtors[a].amount > debtors[b].amount })
	sort.SliceStable(creditors, func(a, b int) bool { return creditors[a].amount > creditors[b].amount })

	out := make([]Transfer, 0, len(debtors))
	i, j := 0, 0

	for i < len(debtors) && j < len(creditors) {
		amount := math.Min(debtors[i].amount, creditors[j].amount)

		// Below one baht is rounding noise, not a debt worth a bank transfer.
		if amount >= 1 {
			out = append(out, Transfer{
				FromUserID: debtors[i].id,
				ToUserID:   creditors[j].id,
				AmountTHB:  math.Round(amount),
			})
		}

		debtors[i].amount -= amount
		creditors[j].amount -= amount
		if debtors[i].amount < 1 {
			i++
		}
		if creditors[j].amount < 1 {
			j++
		}
	}

	return out
}
