package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M21 — A11.3 / A11.4: finding a published plan that fits, and taking it.

type exploreResponse struct {
	Items []struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
		Match *struct {
			Score   int      `json:"score"`
			Reasons []string `json:"reasons"`
		} `json:"match"`
	} `json:"items"`
	Total  int `json:"total"`
	Scored int `json:"scored"`
}

type adaptDiffResponse struct {
	Changes []struct {
		Kind      string `json:"kind"`
		DayLabel  string `json:"day_label"`
		ItemTitle string `json:"item_title"`
		Reason    string `json:"reason"`
	} `json:"changes"`
	Before struct {
		Days  int `json:"days"`
		Items int `json:"items"`
	} `json:"before"`
	After struct {
		Days  int `json:"days"`
		Items int `json:"items"`
	} `json:"after"`
	Warnings []string `json:"warnings"`
	Currency string   `json:"currency"`
}

type adaptCloneResponse struct {
	Trip struct {
		ID        string  `json:"id"`
		Title     string  `json:"title"`
		PartySize int     `json:"party_size"`
		StartDate *string `json:"start_date"`
		EndDate   *string `json:"end_date"`
	} `json:"trip"`
	Diff adaptDiffResponse `json:"diff"`
}

// publish makes a trip public with a slug and a plan of `days` days, each
// holding one paid stop.
func publish(h *testsupport.Harness, trip *models.Trip, slug string, days int, budget float64) {
	h.T.Helper()

	trip.Visibility = models.VisibilityPublic
	trip.Slug = &slug
	trip.BudgetPerPersonTHB = budget
	if err := h.DB.Save(trip).Error; err != nil {
		h.T.Fatalf("publish: %v", err)
	}

	plan := &models.Plan{TripID: trip.ID, Label: "แพลนหลัก", IsFinal: true}
	if err := h.DB.Create(plan).Error; err != nil {
		h.T.Fatalf("create plan: %v", err)
	}

	start := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
	for i := 0; i < days; i++ {
		day := &models.PlanDay{
			PlanID:   plan.ID,
			TripID:   trip.ID,
			DayIndex: i,
			Date:     start.AddDate(0, 0, i),
			Label:    "วันที่ " + string(rune('1'+i)),
			City:     "โตเกียว",
		}
		if err := h.DB.Create(day).Error; err != nil {
			h.T.Fatalf("create day: %v", err)
		}
		cost := 2000.0
		if err := h.DB.Create(&models.PlanItem{
			DayID:   day.ID,
			TripID:  trip.ID,
			Type:    models.ItemPOI,
			Title:   "ที่เที่ยววันที่ " + string(rune('1'+i)),
			Area:    "ชิบูย่า",
			CostJPY: &cost,
		}).Error; err != nil {
			h.T.Fatalf("create item: %v", err)
		}
	}
}

func TestExploreMatchRanksAgainstMyOwnTrip(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	me, myToken := h.User("me")

	// Both published trips are in Japan; only one is anywhere near my budget.
	close := h.Trip(creator, "โตเกียวสบายกระเป๋า")
	publish(h, close, "tokyo-cheap", 5, 40000)

	dear := h.Trip(creator, "โตเกียวจัดเต็ม")
	publish(h, dear, "tokyo-lux", 5, 200000)

	mine := h.Trip(me, "ทริปของฉัน")
	mine.BudgetPerPersonTHB = 42000
	if err := h.DB.Save(mine).Error; err != nil {
		t.Fatalf("save trip: %v", err)
	}

	var out exploreResponse
	h.Request(http.MethodGet, "/api/v1/public/explore?match="+mine.ID, myToken, nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if len(out.Items) != 2 {
		t.Fatalf("items = %d, want both published trips", len(out.Items))
	}
	if out.Items[0].Slug != "tokyo-cheap" {
		t.Fatalf("first = %q, want the one inside my budget", out.Items[0].Slug)
	}
	if out.Items[0].Match == nil || out.Items[0].Match.Score <= out.Items[1].Match.Score {
		t.Fatalf("scores = %+v, want the better fit ranked first", out.Items)
	}
	if len(out.Items[0].Match.Reasons) == 0 {
		t.Fatal("a score with no reason next to it is a number nobody trusts")
	}
	if out.Scored != 2 {
		t.Errorf("scored = %d, want the size of the window that was ranked", out.Scored)
	}
}

func TestExploreMatchNeverRanksMyOwnTripAgainstItself(t *testing.T) {
	h := testsupport.New(t)
	me, myToken := h.User("me")

	mine := h.Trip(me, "ทริปของฉัน")
	publish(h, mine, "my-own", 5, 40000)

	var out exploreResponse
	h.Request(http.MethodGet, "/api/v1/public/explore?match="+mine.ID, myToken, nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if len(out.Items) != 0 {
		t.Fatalf("items = %+v, want my own trip excluded", out.Items)
	}
}

func TestExploreMatchRefusesATripIAmNotIn(t *testing.T) {
	h := testsupport.New(t)
	stranger, _ := h.User("stranger")
	_, myToken := h.User("me")

	theirs := h.Trip(stranger, "ทริปคนอื่น")

	h.Request(http.MethodGet, "/api/v1/public/explore?match="+theirs.ID, myToken, nil).
		ExpectStatus(http.StatusNotFound)
}

func TestExploreWithoutMatchStaysAnonymous(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	trip := h.Trip(creator, "โตเกียว")
	publish(h, trip, "tokyo", 5, 40000)

	var out exploreResponse
	h.Request(http.MethodGet, "/api/v1/public/explore", "", nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if len(out.Items) != 1 || out.Items[0].Match != nil {
		t.Fatalf("items = %+v, want the plain feed with no scores", out.Items)
	}
}

func TestAdaptPreviewWritesNothing(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	_, myToken := h.User("me")

	trip := h.Trip(creator, "โตเกียว 6 วัน")
	publish(h, trip, "tokyo-6", 6, 45000)

	var diff adaptDiffResponse
	h.Request(http.MethodPost, "/api/v1/public/trips/tokyo-6/adapt/preview", myToken,
		map[string]any{"days": 4}).
		ExpectStatus(http.StatusOK).Decode(&diff)

	if diff.Before.Days != 6 || diff.After.Days != 4 {
		t.Fatalf("diff = %d → %d days, want 6 → 4", diff.Before.Days, diff.After.Days)
	}
	if len(diff.Changes) == 0 {
		t.Fatal("a preview with no lines is not a preview")
	}

	var days int64
	h.DB.Model(&models.PlanDay{}).Where("trip_id = ?", trip.ID).Count(&days)
	if days != 6 {
		t.Fatalf("the source plan now has %d days — a preview must not write", days)
	}

	var trips int64
	h.DB.Model(&models.Trip{}).Count(&trips)
	if trips != 1 {
		t.Fatalf("trips = %d, want no copy created by a preview", trips)
	}
}

func TestAdaptCloneAppliesTheFrameItWasGiven(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	_, myToken := h.User("me")

	trip := h.Trip(creator, "โตเกียว 6 วัน")
	publish(h, trip, "tokyo-6", 6, 45000)

	var out adaptCloneResponse
	h.Request(http.MethodPost, "/api/v1/public/trips/tokyo-6/adapt", myToken, map[string]any{
		"days":                   4,
		"party_size":             2,
		"budget_per_person_thb":  30000,
		"start_date":             "2027-01-10",
	}).ExpectStatus(http.StatusCreated).Decode(&out)

	if out.Trip.PartySize != 2 {
		t.Errorf("party size = %d, want the one I asked for", out.Trip.PartySize)
	}
	if out.Trip.StartDate == nil || *out.Trip.StartDate != "2027-01-10" {
		t.Errorf("start = %v, want my dates", out.Trip.StartDate)
	}
	if out.Trip.EndDate == nil || *out.Trip.EndDate != "2027-01-13" {
		t.Errorf("end = %v, want four days from my start", out.Trip.EndDate)
	}
	if out.Diff.After.Days != 4 {
		t.Errorf("after = %d days, want 4", out.Diff.After.Days)
	}

	// The copy is the one that changed; the published original is untouched.
	var sourceDays int64
	h.DB.Model(&models.PlanDay{}).Where("trip_id = ?", trip.ID).Count(&sourceDays)
	if sourceDays != 6 {
		t.Fatalf("the published plan now has %d days", sourceDays)
	}

	var copyDays []models.PlanDay
	h.DB.Where("trip_id = ?", out.Trip.ID).Order("day_index").Find(&copyDays)
	if len(copyDays) != 4 {
		t.Fatalf("copy has %d days, want 4", len(copyDays))
	}
	if copyDays[0].Date.Format("2006-01-02") != "2027-01-10" {
		t.Errorf("first day = %s, want my start date", copyDays[0].Date)
	}
}

func TestAdaptNeedsAnAccount(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	trip := h.Trip(creator, "โตเกียว")
	publish(h, trip, "tokyo", 5, 40000)

	h.Request(http.MethodPost, "/api/v1/public/trips/tokyo/adapt", "", map[string]any{"days": 3}).
		ExpectStatus(http.StatusUnauthorized)
}

func TestAdaptRefusesAPrivateTrip(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	_, myToken := h.User("me")

	trip := h.Trip(creator, "ทริปส่วนตัว")
	slug := "private-one"
	trip.Slug = &slug
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("save: %v", err)
	}

	h.Request(http.MethodPost, "/api/v1/public/trips/private-one/adapt/preview", myToken,
		map[string]any{"days": 3}).ExpectStatus(http.StatusNotFound)
}
