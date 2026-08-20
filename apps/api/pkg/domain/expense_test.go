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
