package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M21 — A11.5: what the trip actually cost, from the people who went.

type reviewListResponse struct {
	Summary struct {
		Count                 int     `json:"count"`
		AverageRating         float64 `json:"average_rating"`
		ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
		BudgetSaid            int     `json:"budget_said"`
	} `json:"summary"`
	Entries []struct {
		UserID                string  `json:"user_id"`
		Name                  string  `json:"name"`
		Rating                int     `json:"rating"`
		ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
		Body                  string  `json:"body"`
	} `json:"entries"`
	Mine *struct {
		Rating int `json:"rating"`
	} `json:"mine"`
	CanReview bool `json:"can_review"`
}

// finish moves a trip into the past so it can be reviewed.
func finish(h *testsupport.Harness, trip *models.Trip) {
	h.T.Helper()

	end := time.Now().UTC().AddDate(0, 0, -3)
	start := end.AddDate(0, 0, -4)
	trip.StartDate = &start
	trip.EndDate = &end
	if err := h.DB.Save(trip).Error; err != nil {
		h.T.Fatalf("finish trip: %v", err)
	}
}

func TestReviewRefusedWhileTheTripIsStillAhead(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	// h.Trip dates are in 2026 — ahead of the clock these tests run under.
	future := time.Now().UTC().AddDate(0, 0, 30)
	end := future.AddDate(0, 0, 4)
	trip.StartDate, trip.EndDate = &future, &end
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("save: %v", err)
	}

	h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", token, map[string]any{
		"rating": 5,
	}).ExpectStatus(http.StatusConflict)

	var out reviewListResponse
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/reviews", token, nil).
		ExpectStatus(http.StatusOK).Decode(&out)
	if out.CanReview {
		t.Error("can_review = true before the trip happened")
	}
}

func TestReviewAveragesRatingsAndOnlyTheBudgetsPeopleGave(t *testing.T) {
	h := testsupport.New(t)
	owner, ownerToken := h.User("owner")
	friend, friendToken := h.User("friend")

	trip := h.Trip(owner, "โตเกียว")
	h.AddMember(trip, friend, models.TripRoleEditor)
	finish(h, trip)

	h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", ownerToken, map[string]any{
		"rating":                   5,
		"actual_budget_per_person": 52000,
		"body":                     "คุ้มมาก",
	}).ExpectStatus(http.StatusOK)

	var out reviewListResponse
	// The friend went but would rather not say what they spent.
	h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", friendToken, map[string]any{
		"rating": 4,
	}).ExpectStatus(http.StatusOK).Decode(&out)

	if out.Summary.Count != 2 {
		t.Fatalf("count = %d, want 2", out.Summary.Count)
	}
	if out.Summary.AverageRating != 4.5 {
		t.Errorf("rating = %v, want 4.5", out.Summary.AverageRating)
	}
	if out.Summary.BudgetSaid != 1 {
		t.Errorf("budget_said = %d, want 1", out.Summary.BudgetSaid)
	}
	if out.Summary.ActualBudgetPerPerson != 52000 {
		t.Errorf(
			"budget = %v, want 52000 — averaging over people who said nothing reports a cheaper trip than anyone had",
			out.Summary.ActualBudgetPerPerson,
		)
	}
	if out.Mine == nil || out.Mine.Rating != 4 {
		t.Errorf("mine = %+v, want the friend's own review", out.Mine)
	}
}

func TestReviewIsReplacedNotDuplicated(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")
	finish(h, trip)

	for _, rating := range []int{2, 5} {
		h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", token, map[string]any{
			"rating": rating,
		}).ExpectStatus(http.StatusOK)
	}

	var out reviewListResponse
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/reviews", token, nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if out.Summary.Count != 1 || out.Entries[0].Rating != 5 {
		t.Fatalf("summary = %+v, entries = %+v, want one review at 5", out.Summary, out.Entries)
	}
}

func TestReviewRatingIsOneToFive(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")
	finish(h, trip)

	for _, rating := range []int{0, 6, -1} {
		h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", token, map[string]any{
			"rating": rating,
		}).ExpectStatus(http.StatusBadRequest)
	}
}

func TestReviewsAreClosedToOutsiders(t *testing.T) {
	h := testsupport.New(t)
	owner, _ := h.User("owner")
	_, outsiderToken := h.User("outsider")

	trip := h.Trip(owner, "โตเกียว")
	finish(h, trip)

	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/reviews", outsiderToken, nil).ExpectDenied()
	h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", outsiderToken,
		map[string]any{"rating": 1}).ExpectDenied()
}

func TestPublicTripCarriesTheReviewsButNeverTheExpenses(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")

	trip := h.Trip(owner, "โตเกียว")
	publish(h, trip, "tokyo-reviewed", 3, 40000)
	finish(h, trip)

	// Something in the private ledger that must not surface.
	if err := h.DB.Create(&models.ExpenseEntry{
		TripID: trip.ID, Date: time.Now().UTC(), Title: "ค่าราเมงลับ",
		Amount: 1200, Currency: "JPY", Scope: "shared", PaidBy: owner.ID,
	}).Error; err != nil {
		t.Fatalf("expense: %v", err)
	}

	h.Request(http.MethodPut, "/api/v1/trips/"+trip.ID+"/reviews/me", token, map[string]any{
		"rating":                   5,
		"actual_budget_per_person": 48000,
		"body":                     "ใช้จริงมากกว่าที่ตั้งไว้นิดหน่อย",
	}).ExpectStatus(http.StatusOK)

	res := h.Request(http.MethodGet, "/api/v1/public/trips/tokyo-reviewed", "", nil).
		ExpectStatus(http.StatusOK)

	if !res.BodyContains("48000") {
		t.Error("the published trip does not carry the real cost travellers reported")
	}
	if res.BodyContains("ค่าราเมงลับ") {
		t.Fatal("an expense entry reached a public payload")
	}
}
