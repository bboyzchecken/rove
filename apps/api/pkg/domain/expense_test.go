package domain

import "testing"

func balanceOf(s ExpenseSummary, userID string) MemberBalance {
	for _, b := range s.PerMember {
		if b.UserID == userID {
			return b
		}
	}
	return MemberBalance{}
}

func TestComputeExpenseSummarySharedSplitsEvenly(t *testing.T) {
	members := []string{"a", "b", "c", "d"}
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 400, Currency: "THB", Category: "food", SplitType: SplitShared, FxRate: 1},
	}

	got := ComputeExpenseSummary(entries, members, "THB")

	if got.Total != 400 || got.SharedTotal != 400 {
		t.Fatalf("totals = %v/%v, want 400/400", got.Total, got.SharedTotal)
	}
	if b := balanceOf(got, "a"); b.Paid != 400 || b.Owed != 100 || b.Net != 300 {
		t.Errorf("payer balance = %+v, want paid 400 owed 100 net 300", b)
	}
	if b := balanceOf(got, "b"); b.Paid != 0 || b.Owed != 100 || b.Net != -100 {
		t.Errorf("participant balance = %+v, want paid 0 owed 100 net -100", b)
	}
}

func TestComputeExpenseSummaryRespectsParticipantSubset(t *testing.T) {
	members := []string{"a", "b", "c"}
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 300, Currency: "THB", SplitType: SplitShared,
			Participants: []string{"a", "b"}, FxRate: 1},
	}

	got := ComputeExpenseSummary(entries, members, "THB")

	if b := balanceOf(got, "c"); b.Owed != 0 {
		t.Errorf("member outside the split owes %v, want 0", b.Owed)
	}
	if b := balanceOf(got, "b"); b.Owed != 150 {
		t.Errorf("participant owes %v, want 150", b.Owed)
	}
}

// A personal entry is one person's own money and must never enter a settlement.
func TestComputeExpenseSummaryPersonalIsNotSplit(t *testing.T) {
	members := []string{"a", "b"}
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 500, Currency: "THB", SplitType: SplitPersonal, FxRate: 1},
	}

	got := ComputeExpenseSummary(entries, members, "THB")

	if b := balanceOf(got, "a"); b.Personal != 500 || b.Owed != 0 || b.Net != 500 {
		t.Errorf("payer balance = %+v, want personal 500 owed 0", b)
	}
	if b := balanceOf(got, "b"); b.Owed != 0 {
		t.Errorf("other member owes %v for a personal entry, want 0", b.Owed)
	}
	if got.SharedTotal != 0 {
		t.Errorf("SharedTotal = %v, want 0", got.SharedTotal)
	}
	if len(got.Settlements) != 0 {
		t.Errorf("personal spending produced settlements: %v", got.Settlements)
	}
}

func TestComputeExpenseSummaryUsesSnapshotFxRate(t *testing.T) {
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 1000, Currency: "JPY", SplitType: SplitPersonal, FxRate: 0.23},
	}

	got := ComputeExpenseSummary(entries, []string{"a"}, "THB")

	if got.Total != 230 {
		t.Errorf("Total = %v, want 230", got.Total)
	}
}

func TestSettlementsBalanceOut(t *testing.T) {
	members := []string{"a", "b", "c"}
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 300, Currency: "THB", SplitType: SplitShared, FxRate: 1},
		{ID: "e2", PaidBy: "b", Amount: 150, Currency: "THB", SplitType: SplitShared, FxRate: 1},
	}

	got := ComputeExpenseSummary(entries, members, "THB")

	// a paid 300 owes 150 (+150); b paid 150 owes 150 (0); c paid 0 owes 150 (-150)
	if len(got.Settlements) != 1 {
		t.Fatalf("settlements = %+v, want exactly one", got.Settlements)
	}
	s := got.Settlements[0]
	if s.FromUserID != "c" || s.ToUserID != "a" || s.Amount != 150 {
		t.Errorf("settlement = %+v, want c -> a 150", s)
	}
}

func TestSettlementsIgnoreRoundingDust(t *testing.T) {
	members := []string{"a", "b", "c"}
	// 100 / 3 does not divide evenly; the leftover cent must not become a transfer.
	entries := []ExpenseInput{
		{ID: "e1", PaidBy: "a", Amount: 100, Currency: "THB", SplitType: SplitShared, FxRate: 1},
		{ID: "e2", PaidBy: "b", Amount: 100, Currency: "THB", SplitType: SplitShared, FxRate: 1},
		{ID: "e3", PaidBy: "c", Amount: 100, Currency: "THB", SplitType: SplitShared, FxRate: 1},
	}

	got := ComputeExpenseSummary(entries, members, "THB")

	for _, s := range got.Settlements {
		if s.Amount <= settlementEpsilon {
			t.Errorf("dust settlement survived: %+v", s)
		}
	}
}

func TestComputeExpenseSummaryEmpty(t *testing.T) {
	got := ComputeExpenseSummary(nil, []string{"a", "b"}, "THB")

	if got.Total != 0 {
		t.Errorf("Total = %v, want 0", got.Total)
	}
	if len(got.PerMember) != 2 {
		t.Errorf("every member needs a row even with no spending, got %d", len(got.PerMember))
	}
	if len(got.Settlements) != 0 {
		t.Errorf("Settlements = %v, want empty", got.Settlements)
	}
}
