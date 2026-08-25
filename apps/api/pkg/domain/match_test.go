package domain

import (
	"testing"
	"time"
)

func date(s string) *time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return &t
}

func profile() MatchProfile {
	return MatchProfile{
		Country:            "JP",
		StartDate:          date("2026-12-04"),
		Days:               6,
		BudgetPerPersonTHB: 45000,
		PartySize:          4,
		Tags:               []string{"ของกิน", "วัด", "ช้อปปิ้ง"},
	}
}

func TestScoreMatchIdenticalTripsScoreFull(t *testing.T) {
	got := ScoreMatch(profile(), profile())
	if got.Score != 100 {
		t.Fatalf("score = %d, want 100", got.Score)
	}
	if len(got.Reasons) != 4 {
		t.Fatalf("reasons = %v, want one per component", got.Reasons)
	}
}

func TestScoreMatchDifferentCountryIsNotAMatch(t *testing.T) {
	have := profile()
	have.Country = "KR"

	if got := ScoreMatch(profile(), have); got.Score != 0 {
		t.Fatalf("score = %d, want 0 — a different country is not a weaker match", got.Score)
	}
}

func TestScoreMatchUnderBudgetStillFitsOverBudgetDoesNot(t *testing.T) {
	cheap, dear := profile(), profile()
	cheap.BudgetPerPersonTHB = 30000 // 0.67× the budget
	dear.BudgetPerPersonTHB = 90000  // 2× the budget

	under := ScoreMatch(profile(), cheap).Score
	over := ScoreMatch(profile(), dear).Score

	if under <= over {
		t.Fatalf("under budget %d should beat over budget %d", under, over)
	}
	if under < 90 {
		t.Fatalf("a trip that costs less than the budget scored %d — it still fits", under)
	}
	if over > 80 {
		t.Fatalf("a trip at double the budget scored %d — too generous", over)
	}
}

func TestMatchBudgetHitsZeroAtDouble(t *testing.T) {
	if got := matchBudget(1000, 2000); got != 0 {
		t.Fatalf("double the budget = %v, want 0", got)
	}
	if got := matchBudget(1000, 1000); got != 1 {
		t.Fatalf("same budget = %v, want 1", got)
	}
	if got := matchBudget(0, 1000); got != matchNeutral {
		t.Fatalf("unknown budget = %v, want neutral", got)
	}
}

func TestMonthDistanceIsCircular(t *testing.T) {
	if got := monthDistance(time.December, time.January); got != 1 {
		t.Fatalf("Dec→Jan = %d, want 1", got)
	}
	if got := monthDistance(time.January, time.July); got != 6 {
		t.Fatalf("Jan→Jul = %d, want 6", got)
	}
}

func TestScoreMatchSeasonBeatsOffSeason(t *testing.T) {
	same, far := profile(), profile()
	far.StartDate = date("2026-06-04") // six months away

	if ScoreMatch(profile(), same).Score <= ScoreMatch(profile(), far).Score {
		t.Fatal("the same month must rank above the opposite season")
	}
}

func TestTagCoverageAsksHowMuchOfWhatIWantIsThere(t *testing.T) {
	want := []string{"ของกิน", "วัด"}
	have := []string{"ของกิน", "วัด", "ออนเซ็น", "ช้อปปิ้ง", "สกี"}

	if got := TagCoverage(want, have); got != 1 {
		t.Fatalf("coverage = %v, want 1 — every wish is present", got)
	}
	// The same pair scores badly on Jaccard, which is the reason both exist.
	if got := TagOverlap(want, have); got >= 0.5 {
		t.Fatalf("overlap = %v, expected the Jaccard view to be harsher", got)
	}
	if got := TagCoverage(want, []string{"ของกิน"}); got != 0.5 {
		t.Fatalf("half the wishes = %v, want 0.5", got)
	}
}

func TestSharedTagsKeepsOriginalSpellingAndCapsAtThree(t *testing.T) {
	want := []string{"ของกิน", "วัด", "ช้อปปิ้ง", "ออนเซ็น"}
	have := []string{"  ของกิน", "วัด", "ช้อปปิ้ง!", "ออนเซ็น"}

	got := SharedTags(want, have)
	if len(got) != 3 {
		t.Fatalf("shared = %v, want three at most", got)
	}
	if got[0] != "ของกิน" {
		t.Fatalf("shared[0] = %q, want the caller's spelling", got[0])
	}
}

func TestScoreMatchWithNothingKnownLandsInTheMiddle(t *testing.T) {
	blank := MatchProfile{Country: "JP"}

	got := ScoreMatch(blank, blank)
	if got.Score != 50 {
		t.Fatalf("score = %d, want 50 — unknown is neither good nor bad", got.Score)
	}
	if len(got.Reasons) != 0 {
		t.Fatalf("reasons = %v, want none", got.Reasons)
	}
}
