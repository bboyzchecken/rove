package domain

import (
	"math"
	"math/bits"
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

// Settle works out who pays whom, in as few transfers as possible (A16.5).
//
// The greedy pairing everyone writes first — largest debt pays largest credit —
// is not minimal. Four people where A owes B 500 and C owes D 500 is two
// transfers; greedy can turn it into three by paying A's debt across both
// creditors. The fix is to find the largest number of subgroups that already
// settle among themselves: a group of k people always needs k-1 transfers, so
// the fewest transfers overall is (people who owe or are owed) minus (number of
// self-settling groups).
//
// That search is exponential, which is fine for the size of a group holiday and
// not fine in general — above settleExactLimit people this falls back to the
// greedy pairing and says so by simply doing it.
func Settle(rows []MemberBalance) []Transfer {
	balances := settleBalances(rows)
	if len(balances) == 0 {
		return nil
	}
	if len(balances) > settleExactLimit {
		return settleGreedy(balances)
	}

	out := make([]Transfer, 0, len(balances)-1)
	for _, group := range selfSettlingGroups(balances) {
		out = append(out, settleGreedy(group)...)
	}
	return out
}

// settleExactLimit is where the exact search stops being worth it. Twelve
// people is already a large group holiday, and 3^12 subsets is microseconds;
// each extra person triples that.
const settleExactLimit = 12

type settleSide struct {
	id     string
	amount int64 // whole baht, positive = owed to them
}

// settleBalances rounds to whole baht and drops the noise.
//
// Rounding each member's balance can leave the total a baht or two off zero,
// which would make the exact partition impossible. The remainder is absorbed
// into the largest balance, where it is invisible, rather than left to break
// the algorithm or handed to the user as a phantom debt.
func settleBalances(rows []MemberBalance) []settleSide {
	out := make([]settleSide, 0, len(rows))
	for _, r := range rows {
		if amount := int64(math.Round(r.BalanceTHB)); amount != 0 {
			out = append(out, settleSide{id: r.UserID, amount: amount})
		}
	}
	if len(out) == 0 {
		return nil
	}

	total := int64(0)
	largest := 0
	for i, side := range out {
		total += side.amount
		if abs64(side.amount) > abs64(out[largest].amount) {
			largest = i
		}
	}
	out[largest].amount -= total

	// That adjustment can zero somebody out entirely.
	kept := out[:0]
	for _, side := range out {
		if side.amount != 0 {
			kept = append(kept, side)
		}
	}
	return kept
}

// selfSettlingGroups splits the balances into the largest possible number of
// subsets that each sum to zero. Every extra subset found is one transfer
// saved.
func selfSettlingGroups(balances []settleSide) [][]settleSide {
	n := len(balances)
	full := 1 << n

	sums := make([]int64, full)
	for mask := 1; mask < full; mask++ {
		low := mask & -mask
		sums[mask] = sums[mask^low] + balances[bits.TrailingZeros(uint(low))].amount
	}

	// best[mask] is how many zero-sum groups `mask` splits into, -1 when it
	// cannot be split at all. pick[mask] remembers the group that got there.
	best := make([]int, full)
	pick := make([]int, full)
	for mask := 1; mask < full; mask++ {
		best[mask] = -1

		if sums[mask] != 0 {
			continue
		}
		// Fixing the lowest set bit stops the same partition being found once
		// per ordering of its groups.
		low := mask & -mask
		for sub := mask; sub > 0; sub = (sub - 1) & mask {
			if sub&low == 0 || sums[sub] != 0 {
				continue
			}
			rest := mask ^ sub
			if rest != 0 && best[rest] < 0 {
				continue
			}
			if candidate := best[rest] + 1; candidate > best[mask] {
				best[mask], pick[mask] = candidate, sub
			}
		}
	}

	groups := make([][]settleSide, 0, 4)
	for mask := full - 1; mask > 0; {
		group := pick[mask]
		if group == 0 {
			// Unreachable while the balances net to zero, but a partition that
			// cannot be split is still one valid group.
			group = mask
		}

		members := make([]settleSide, 0, bits.OnesCount(uint(group)))
		for i := 0; i < len(balances); i++ {
			if group&(1<<i) != 0 {
				members = append(members, balances[i])
			}
		}
		groups = append(groups, members)
		mask ^= group
	}
	return groups
}

// settleGreedy pairs the largest debt with the largest credit until everything
// clears. Within a group that settles among itself this is optimal — it always
// closes at least one person per transfer.
func settleGreedy(balances []settleSide) []Transfer {
	var debtors, creditors []settleSide
	for _, side := range balances {
		switch {
		case side.amount < 0:
			debtors = append(debtors, settleSide{side.id, -side.amount})
		case side.amount > 0:
			creditors = append(creditors, side)
		}
	}

	sort.SliceStable(debtors, func(a, b int) bool { return debtors[a].amount > debtors[b].amount })
	sort.SliceStable(creditors, func(a, b int) bool { return creditors[a].amount > creditors[b].amount })

	out := make([]Transfer, 0, len(debtors))
	i, j := 0, 0

	for i < len(debtors) && j < len(creditors) {
		amount := debtors[i].amount
		if creditors[j].amount < amount {
			amount = creditors[j].amount
		}

		// Below one baht is rounding noise, not a debt worth a bank transfer.
		if amount >= 1 {
			out = append(out, Transfer{
				FromUserID: debtors[i].id,
				ToUserID:   creditors[j].id,
				AmountTHB:  float64(amount),
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

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
