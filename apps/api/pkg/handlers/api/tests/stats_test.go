package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M24 — A24.1 / A24.2: the platform's own numbers, and the reviews behind them.

type publicStatsResponse struct {
	Planners      int64   `json:"planners"`
	PublicTrips   int64   `json:"public_trips"`
	Clones        int64   `json:"clones"`
	Reviews       int64   `json:"reviews"`
	AverageRating float64 `json:"average_rating"`
	ComputedAt    string  `json:"computed_at"`
}

type recentReviewsResponse struct {
	Items []struct {
		TripID                string  `json:"trip_id"`
		TripTitle             string  `json:"trip_title"`
		TripSlug              string  `json:"trip_slug"`
		Rating                int     `json:"rating"`
		Body                  string  `json:"body"`
		ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
		Name                  string  `json:"name"`
		CharacterID           string  `json:"character_id"`
	} `json:"items"`
}

// openToPublic is `publish` from explore_test.go without the itinerary: these
// tests count rows, and a plan would only slow them down.
func openToPublic(t *testing.T, h *testsupport.Harness, trip *models.Trip, slug string) *models.Trip {
	t.Helper()
	trip.Visibility = models.VisibilityPublic
	trip.Slug = &slug
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("publish trip: %v", err)
	}
	return trip
}

func review(t *testing.T, h *testsupport.Harness, tripID, userID string, rating int, body string, budget float64) {
	t.Helper()
	row := &models.TripReview{
		TripID:                tripID,
		UserID:                userID,
		Rating:                rating,
		Body:                  body,
		ActualBudgetPerPerson: budget,
	}
	if err := h.DB.Create(row).Error; err != nil {
		t.Fatalf("write review: %v", err)
	}
}

// A24.1 — the four numbers, and who has to be signed in to see them (nobody).
func TestPublicStatsCountsWhatItSaysItCounts(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	bob, _ := h.User("bob")
	h.User("carol") // signed up, never planned anything

	published := openToPublic(t, h, h.Trip(alice, "โตเกียว 5 วัน"), "tokyo-5-days")
	h.Trip(bob, "โอซาก้าเงียบๆ")

	// A copy of Alice's plan, the shape `cloneTripForUser` writes.
	copied := h.Trip(bob, "โตเกียว 5 วัน (คัดลอก)")
	copied.SourceTripID = &published.ID
	copied.SourceCreatorID = &alice.ID
	if err := h.DB.Save(copied).Error; err != nil {
		t.Fatalf("save clone: %v", err)
	}

	review(t, h, published.ID, alice.ID, 5, "คุ้มมาก", 31_000)
	review(t, h, published.ID, bob.ID, 4, "ดี แต่วันสุดท้ายแน่นไป", 0)

	var stats publicStatsResponse
	res := h.Request(http.MethodGet, "/api/v1/public/stats", "", nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&stats)

	// Carol signed up and planned nothing: "คนที่วางแพลนกับ ROVE" is three
	// only if signing up counts as planning, and it does not.
	if stats.Planners != 2 {
		t.Errorf("planners = %d, want 2", stats.Planners)
	}
	if stats.PublicTrips != 1 {
		t.Errorf("public_trips = %d, want 1", stats.PublicTrips)
	}
	if stats.Clones != 1 {
		t.Errorf("clones = %d, want 1", stats.Clones)
	}
	if stats.Reviews != 2 {
		t.Errorf("reviews = %d, want 2", stats.Reviews)
	}
	if stats.AverageRating != 4.5 {
		t.Errorf("average_rating = %v, want 4.5", stats.AverageRating)
	}
	if stats.ComputedAt == "" {
		t.Error("computed_at is empty — a cached total should say how fresh it is")
	}
}

// A24.1 — an empty install answers honestly rather than 500ing or inventing a
// floor. W24.1 hides the section on these numbers; it cannot do that if the
// endpoint fails instead of returning them.
func TestPublicStatsOnAnEmptyInstall(t *testing.T) {
	h := testsupport.New(t)

	var stats publicStatsResponse
	res := h.Request(http.MethodGet, "/api/v1/public/stats", "", nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&stats)

	if stats.Planners != 0 || stats.PublicTrips != 0 || stats.Reviews != 0 {
		t.Errorf("empty install reports %+v, want zeros", stats)
	}
	if stats.AverageRating != 0 {
		t.Errorf("average_rating = %v with no reviews, want 0", stats.AverageRating)
	}
}

// A24.2 — only reviews of published trips, and only ones that say something.
func TestRecentReviewsOnlyQuotesPublicTripsWithABody(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	bob, _ := h.User("bob")

	published := openToPublic(t, h, h.Trip(alice, "โซลคาเฟ่ฮอป"), "seoul-cafe-hop")
	private := h.Trip(bob, "ทริปส่วนตัวของบ๊อบ")

	review(t, h, published.ID, alice.ID, 5, "ตามรอยแล้วดีจริง", 24_000)
	// A rating with no words: counted by the summary, never quoted.
	review(t, h, published.ID, bob.ID, 4, "", 0)
	review(t, h, private.ID, bob.ID, 5, "ความลับของบ๊อบ", 0)

	var recent recentReviewsResponse
	res := h.Request(http.MethodGet, "/api/v1/public/reviews/recent", "", nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&recent)

	if len(recent.Items) != 1 {
		t.Fatalf("got %d quotable reviews, want 1: %+v", len(recent.Items), recent.Items)
	}
	item := recent.Items[0]
	if item.Body != "ตามรอยแล้วดีจริง" || item.TripTitle != "โซลคาเฟ่ฮอป" || item.TripSlug != "seoul-cafe-hop" {
		t.Errorf("quoted %+v, want alice's review carrying its trip", item)
	}
	if item.Name != "alice" || item.CharacterID == "" {
		t.Errorf("reviewer = %q/%q, want a name and a character", item.Name, item.CharacterID)
	}
	if res.BodyContains("ความลับของบ๊อบ") {
		t.Error("a private trip's review was quoted publicly")
	}
}

// A24.2 — the expense ledger stays out of this payload like it stays out of
// every other public one (W16.5). The only money here is the one figure the
// reviewer chose to publish about their own trip.
func TestRecentReviewsNeverCarryTheExpenseLedger(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	trip := openToPublic(t, h, h.Trip(alice, "โตเกียว 5 วัน"), "tokyo-5-days")

	entry := &models.ExpenseEntry{
		TripID:   trip.ID,
		PaidBy:   alice.ID,
		Title:    "ค่าโรงแรมที่ไม่ควรหลุด",
		Amount:   48_000,
		Currency: "THB",
		Scope:    models.ScopeShared,
		Date:     time.Now().UTC(),
	}
	if err := h.DB.Create(entry).Error; err != nil {
		t.Fatalf("create expense: %v", err)
	}
	review(t, h, trip.ID, alice.ID, 5, "คุ้มมาก", 31_000)

	res := h.Request(http.MethodGet, "/api/v1/public/reviews/recent", "", nil)
	res.ExpectStatus(http.StatusOK)

	if res.BodyContains("ค่าโรงแรมที่ไม่ควรหลุด") {
		t.Error("an expense entry reached the public reviews payload")
	}
}
