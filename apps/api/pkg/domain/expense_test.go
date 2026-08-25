package domain

import "testing"

// Twin of the expense cases in apps/web/lib/__tests__/domain.test.ts.

var members = []string{"m1", "m2", "m3", "m4"}

func demoExpenses() []ExpenseInput {
	return []ExpenseInput{
		{
			ID: "e1", Scope: "shared", Amount: 4000, Currency: "JPY",
			PaidBy: "m1", Participants: members,
		},
		{
			ID: "e2", Scope: "personal", Amount: 1000, Currency: "THB",
			PaidBy: "m2",
		},
	}
}

func TestComputeExpensesSplitsSharedAndLeavesPersonalAlone(t *testing.T) {
	got := ComputeExpenses(demoExpenses(), members, 0.25, nil)

	if got.SharedTotalTHB != 1000 {
		t.Errorf("shared = %v, want 1000", got.SharedTotalTHB)
	}
	if got.PersonalTotalTHB != 1000 {
		t.Errorf("personal = %v, want 1000", got.PersonalTotalTHB)
	}

	byID := map[string]MemberBalance{}
	for _, row := range got.PerMember {
		byID[row.UserID] = row
	}

	if tong := byID["m1"]; tong.PaidTHB != 1000 || tong.ShareTHB != 250 || tong.BalanceTHB != 750 {
		t.Errorf("m1 = %+v, want paid 1000 / share 250 / balance 750", tong)
	}
	if mind := byID["m2"]; mind.PersonalTHB != 1000 || mind.BalanceTHB != -250 {
		t.Errorf("m2 = %+v, want personal 1000 / balance -250", mind)
	}
}

func TestSettleUsesAtMostThreeTransfersForFour(t *testing.T) {
	got := ComputeExpenses(demoExpenses(), members, 0.25, nil)
	if len(got.Settlements) > 3 {
		t.Fatalf("%d transfers, want at most 3", len(got.Settlements))
	}
	for _, tr := range got.Settlements {
		if tr.ToUserID != "m1" {
			t.Errorf("everyone owes m1 here, got transfer to %s", tr.ToUserID)
		}
	}
}

func TestSettleDropsAlreadyPaidDebts(t *testing.T) {
	got := ComputeExpenses(demoExpenses(), members, 0.25, []SettledPair{
		{FromUserID: "m2", ToUserID: "m1"},
	})
	for _, tr := range got.Settlements {
		if tr.FromUserID == "m2" {
			t.Fatal("m2 already paid back; the transfer must not be suggested again")
		}
	}
}

func TestSettleNetsToZero(t *testing.T) {
	rows := []MemberBalance{
		{UserID: "a", BalanceTHB: 300},
		{UserID: "b", BalanceTHB: -100},
		{UserID: "c", BalanceTHB: -200},
	}
	total := 0.0
	for _, tr := range Settle(rows) {
		total += tr.AmountTHB
	}
	if total != 300 {
		t.Fatalf("transfers total %v, want 300", total)
	}
}

func TestSharedEntryWithoutParticipantsSplitsAcrossEveryone(t *testing.T) {
	got := ComputeExpenses([]ExpenseInput{
		{ID: "e", Scope: "shared", Amount: 400, Currency: "THB", PaidBy: "m1"},
	}, members, 0.25, nil)

	for _, row := range got.PerMember {
		if row.ShareTHB != 100 {
			t.Fatalf("%s share = %v, want 100", row.UserID, row.ShareTHB)
		}
	}
}

/* ------------------------------------------------- minimal settle (A16.5) -- */

func balances(pairs ...any) []MemberBalance {
	out := make([]MemberBalance, 0, len(pairs)/2)
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, MemberBalance{
			UserID:     pairs[i].(string),
			BalanceTHB: float64(pairs[i+1].(int)),
		})
	}
	return out
}

func TestSettleFindsGroupsThatAlreadyClearAmongThemselves(t *testing.T) {
	// Which debtor pays which creditor does not matter; that it takes two
	// transfers and not the three greedy pairing needs, does.
	got := Settle(balances("a", -500, "b", 500, "c", -500, "d", 500))

	if len(got) != 2 {
		t.Fatalf("transfers = %+v, want 2 — greedy pairing would need 3", got)
	}
	for _, transfer := range got {
		if transfer.AmountTHB != 500 {
			t.Errorf("transfer %+v, want one whole debt per transfer", transfer)
		}
	}
}

func TestSettleNeedsOneTransferPerPersonMinusOne(t *testing.T) {
	// Nothing here splits: one person paid for everyone.
	got := Settle(balances("a", 900, "b", -300, "c", -300, "d", -300))

	if len(got) != 3 {
		t.Fatalf("transfers = %+v, want 3 — a group of four that cannot split needs three", got)
	}
	for _, transfer := range got {
		if transfer.ToUserID != "a" {
			t.Errorf("transfer %+v, want everyone paying a", transfer)
		}
	}
}

func TestSettleClearsEveryBalanceExactly(t *testing.T) {
	rows := balances("a", -1200, "b", 700, "c", -800, "d", 1300, "e", 0)

	net := map[string]float64{}
	for _, transfer := range Settle(rows) {
		net[transfer.FromUserID] -= transfer.AmountTHB
		net[transfer.ToUserID] += transfer.AmountTHB
	}
	for _, row := range rows {
		if net[row.UserID] != row.BalanceTHB {
			t.Errorf("%s ends at %v, want %v", row.UserID, net[row.UserID], row.BalanceTHB)
		}
	}
}

func TestSettleAbsorbsRoundingIntoTheLargestBalance(t *testing.T) {
	// Per-member rounding can leave the total a baht off zero. The transfers
	// still have to balance against each other.
	rows := []MemberBalance{
		{UserID: "a", BalanceTHB: -333},
		{UserID: "b", BalanceTHB: -333},
		{UserID: "c", BalanceTHB: 667},
	}

	total := 0.0
	for _, transfer := range Settle(rows) {
		total += transfer.AmountTHB
		if transfer.AmountTHB <= 0 {
			t.Errorf("transfer %+v has no amount", transfer)
		}
	}
	if total != 666 {
		t.Errorf("moved %v baht, want the 666 that actually changes hands", total)
	}
}

func TestSettleIgnoresPeopleWhoAreSquare(t *testing.T) {
	if got := Settle(balances("a", 0, "b", 0)); len(got) != 0 {
		t.Fatalf("transfers = %+v, want none", got)
	}
}

func TestSettleFallsBackAboveTheExactLimit(t *testing.T) {
	// Thirteen people: past the exact search, and still every balance clears.
	rows := make([]MemberBalance, 0, 13)
	for i := 0; i < 12; i++ {
		rows = append(rows, MemberBalance{UserID: string(rune('a' + i)), BalanceTHB: -100})
	}
	rows = append(rows, MemberBalance{UserID: "z", BalanceTHB: 1200})

	got := Settle(rows)
	if len(got) != 12 {
		t.Fatalf("transfers = %d, want 12", len(got))
	}
	total := 0.0
	for _, transfer := range got {
		total += transfer.AmountTHB
	}
	if total != 1200 {
		t.Errorf("moved %v baht, want 1200", total)
	}
}
