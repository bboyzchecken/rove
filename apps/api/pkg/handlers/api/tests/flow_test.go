package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// The X.1 journey, minus the two steps that need external services: a real
// OAuth sign-in and a real model call. Everything between them is exercised
// against the real router.
//
// This is the test that catches a handler pair that each work alone but
// disagree about a field name.
func TestGroupTripJourney(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")

	// --- create ------------------------------------------------------------
	create := h.Request(http.MethodPost, "/api/v1/trips", aliceToken, map[string]any{
		"entry_type": "date",
		"start_date": "2026-04-06",
		"end_date":   "2026-04-10",
		"cities":     []string{"tokyo"},
		"party_size": 2,
	})
	create.ExpectStatus(http.StatusCreated)

	var trip models.Trip
	create.Decode(&trip)
	if trip.ID == "" {
		t.Fatal("created trip has no id")
	}
	if trip.Title == "" {
		t.Error("a trip created without a title should still get a readable one")
	}

	// --- invite and join ---------------------------------------------------
	invite := h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/invites", aliceToken,
		map[string]any{"role": "editor"})
	invite.ExpectStatus(http.StatusCreated)

	var inviteBody struct {
		Invite struct {
			Token string `json:"token"`
		} `json:"invite"`
	}
	invite.Decode(&inviteBody)

	// Bob cannot see the trip until he accepts.
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, bobToken, nil).ExpectNotFound()

	h.Request(http.MethodPost, "/api/v1/invites/"+inviteBody.Invite.Token+"/accept", bobToken, nil).
		ExpectStatus(http.StatusOK)

	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, bobToken, nil).ExpectStatus(http.StatusOK)

	// Accepting twice is something people actually do; it must not error.
	h.Request(http.MethodPost, "/api/v1/invites/"+inviteBody.Invite.Token+"/accept", bobToken, nil).
		ExpectStatus(http.StatusOK)

	// --- wishlists ---------------------------------------------------------
	for _, wish := range []struct {
		token, text, kind string
	}{
		{aliceToken, "วัดเซนโซจิ", "must"},
		{aliceToken, "กินราเมง", "nice"},
		{bobToken, "อากิฮาบาระ", "must"},
	} {
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/wishlist", wish.token,
			map[string]any{"text": wish.text, "kind": wish.kind}).
			ExpectStatus(http.StatusCreated)
	}

	overview := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, aliceToken, nil)
	overview.ExpectStatus(http.StatusOK)

	var overviewBody struct {
		Counts struct {
			WishlistItems          int64    `json:"wishlist_items"`
			Members                int64    `json:"members"`
			MembersWithoutWishlist int      `json:"members_without_wishlist"`
			WaitingOn              []string `json:"waiting_on"`
		} `json:"counts"`
	}
	overview.Decode(&overviewBody)

	if overviewBody.Counts.WishlistItems != 3 {
		t.Errorf("wishlist count = %d, want 3", overviewBody.Counts.WishlistItems)
	}
	if overviewBody.Counts.Members != 2 {
		t.Errorf("member count = %d, want 2", overviewBody.Counts.Members)
	}
	if overviewBody.Counts.MembersWithoutWishlist != 0 {
		t.Errorf("everyone added a wish, but %d are listed as waiting",
			overviewBody.Counts.MembersWithoutWishlist)
	}

	// --- plan and items ----------------------------------------------------
	// A group that would rather not use the AI builds the plan by hand; the
	// endpoint pre-creates one day per trip day.
	planRes := h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/plans", aliceToken,
		map[string]any{"name": "แพลนของเรา"})
	planRes.ExpectStatus(http.StatusCreated)

	var plan models.Plan
	planRes.Decode(&plan)

	detail := h.Request(http.MethodGet, "/api/v1/plans/"+plan.ID, aliceToken, nil)
	detail.ExpectStatus(http.StatusOK)

	var detailBody struct {
		Days []struct {
			ID    string        `json:"id"`
			Items []models.Item `json:"items"`
		} `json:"days"`
	}
	detail.Decode(&detailBody)

	if len(detailBody.Days) != 5 {
		t.Fatalf("a 4-night trip should get 5 days, got %d", len(detailBody.Days))
	}
	firstDay := detailBody.Days[0].ID

	// Bob is an editor, so he can add to the itinerary.
	itemRes := h.Request(http.MethodPost, "/api/v1/plans/"+plan.ID+"/items", bobToken, map[string]any{
		"title":         "วัดเซนโซจิ",
		"day_id":        firstDay,
		"type":          "place",
		"start_time":    "09:30",
		"end_time":      "11:00",
		"cost_amount":   0,
		"cost_currency": "JPY",
	})
	itemRes.ExpectStatus(http.StatusCreated)

	var item models.Item
	itemRes.Decode(&item)

	// --- coverage picks the new item up -----------------------------------
	coverage := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/coverage", aliceToken, nil)
	coverage.ExpectStatus(http.StatusOK)

	var coverageBody struct {
		Stats struct {
			Total          int     `json:"total"`
			Covered        int     `json:"covered"`
			CoveredPercent float64 `json:"covered_percent"`
		} `json:"stats"`
	}
	coverage.Decode(&coverageBody)

	if coverageBody.Stats.Total != 3 {
		t.Errorf("coverage total = %d, want 3", coverageBody.Stats.Total)
	}
	// The item's title matches Alice's must-do exactly.
	if coverageBody.Stats.Covered < 1 {
		t.Errorf("adding a matching item covered nothing: %+v", coverageBody.Stats)
	}

	// --- move, then undo a delete ------------------------------------------
	secondDay := detailBody.Days[1].ID
	h.Request(http.MethodPost, "/api/v1/items/"+item.ID+"/move", aliceToken, map[string]any{
		"day_id": secondDay, "position": 0,
	}).ExpectStatus(http.StatusOK)

	h.Request(http.MethodDelete, "/api/v1/items/"+item.ID, aliceToken, nil).
		ExpectStatus(http.StatusNoContent)

	undo := h.Request(http.MethodPost, "/api/v1/items/"+item.ID+"/undo", aliceToken, nil)
	undo.ExpectStatus(http.StatusOK)

	var restored models.Item
	undo.Decode(&restored)
	if restored.Title != "วัดเซนโซจิ" {
		t.Errorf("undo restored %q, want the deleted item back", restored.Title)
	}

	// --- budget ------------------------------------------------------------
	budget := h.Request(http.MethodGet, "/api/v1/plans/"+plan.ID+"/budget", aliceToken, nil)
	budget.ExpectStatus(http.StatusOK)

	var budgetBody struct {
		Currency   string  `json:"currency"`
		PartySize  int     `json:"party_size"`
		FXRateNote string  `json:"fx_rate_note"`
		Total      float64 `json:"total"`
	}
	budget.Decode(&budgetBody)

	if budgetBody.Currency != "THB" {
		t.Errorf("budget currency = %q, want the trip's home currency", budgetBody.Currency)
	}
	// DEV_SPEC §7.2: converted money always carries its as-of label.
	if budgetBody.FXRateNote == "" {
		t.Error("budget response has no fx_rate_note")
	}

	// --- expense and settlement -------------------------------------------
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/expense", aliceToken, map[string]any{
		"title":             "ข้าวเย็นวันแรก",
		"amount":            4000,
		"currency":          "JPY",
		"category":          "food",
		"split_type":        "shared",
		"participants_json": []string{alice.ID, bob.ID},
	}).ExpectStatus(http.StatusCreated)

	summary := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/expense/summary", bobToken, nil)
	summary.ExpectStatus(http.StatusOK)

	var summaryBody struct {
		Total     float64 `json:"total"`
		PerMember []struct {
			UserID string  `json:"user_id"`
			Net    float64 `json:"net"`
		} `json:"per_member"`
		Settlements []struct {
			FromUserID string  `json:"from_user_id"`
			ToUserID   string  `json:"to_user_id"`
			Amount     float64 `json:"amount"`
		} `json:"settlements"`
	}
	summary.Decode(&summaryBody)

	// 4000 JPY at the stubbed 0.23 = 920 THB, split two ways.
	if summaryBody.Total != 920 {
		t.Errorf("expense total = %v, want 920 THB", summaryBody.Total)
	}
	if len(summaryBody.Settlements) != 1 {
		t.Fatalf("settlements = %+v, want one transfer", summaryBody.Settlements)
	}
	settlement := summaryBody.Settlements[0]
	if settlement.FromUserID != bob.ID || settlement.ToUserID != alice.ID {
		t.Errorf("settlement = %s -> %s, want bob -> alice", settlement.FromUserID, settlement.ToUserID)
	}
	if settlement.Amount != 460 {
		t.Errorf("settlement amount = %v, want 460", settlement.Amount)
	}

	// --- share -------------------------------------------------------------
	share := h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "link"})
	share.ExpectStatus(http.StatusOK)

	var shareBody struct {
		ShareToken string `json:"share_token"`
		ShareURL   string `json:"share_url"`
	}
	share.Decode(&shareBody)

	if shareBody.ShareToken == "" || shareBody.ShareURL == "" {
		t.Fatal("sharing produced no link")
	}

	// The link works without any credentials at all.
	public := h.Request(http.MethodGet, "/public/plans/"+shareBody.ShareToken, "", nil)
	public.ExpectStatus(http.StatusOK)
	if !public.BodyContains("วัดเซนโซจิ") {
		t.Error("the shared plan does not contain the itinerary")
	}
	if public.BodyContains("ข้าวเย็นวันแรก") {
		t.Error("expense leaked into the shared plan")
	}

	// --- activity recorded the whole thing ---------------------------------
	activity := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/activity", aliceToken, nil)
	activity.ExpectStatus(http.StatusOK)

	var activityBody struct {
		Items []models.ActivityLog `json:"items"`
	}
	activity.Decode(&activityBody)

	if len(activityBody.Items) < 5 {
		t.Errorf("activity feed has %d entries; every mutation should write one",
			len(activityBody.Items))
	}
}

// Cloning is what the public-trip incentive rests on, so the attribution edge
// gets its own test (DEV_SPEC §1, §6.5).
func TestCloningCarriesTheCreatorForward(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	_, bobToken := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Plan(trip)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "public"}).ExpectStatus(http.StatusOK)

	clone := h.Request(http.MethodPost, "/api/v1/trips", bobToken, map[string]any{
		"entry_type":     "clone",
		"source_trip_id": trip.ID,
	})
	clone.ExpectStatus(http.StatusCreated)

	var cloneBody struct {
		Trip models.Trip `json:"trip"`
	}
	clone.Decode(&cloneBody)

	if cloneBody.Trip.SourceCreatorID == nil || *cloneBody.Trip.SourceCreatorID != alice.ID {
		t.Fatalf("clone lost the source creator: %+v", cloneBody.Trip.SourceCreatorID)
	}
	// A copy must start private no matter how public its source was.
	if cloneBody.Trip.Visibility != models.VisibilityPrivate {
		t.Errorf("clone visibility = %q, want private", cloneBody.Trip.Visibility)
	}

	// The copy carries the itinerary but not the original's booking state.
	var items []models.Item
	if err := h.DB.Joins("JOIN plans ON plans.id = items.plan_id").
		Where("plans.trip_id = ?", cloneBody.Trip.ID).Find(&items).Error; err != nil {
		t.Fatalf("load cloned items: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("the clone has no items")
	}
	for _, item := range items {
		if item.BookingStatus != models.BookingStatusNone {
			t.Errorf("cloned item kept booking status %q", item.BookingStatus)
		}
		if item.IsPrepaid {
			t.Error("cloned item is marked as already paid for")
		}
	}
}

// A private trip may only be cloned from the inside.
func TestPrivateTripCannotBeCloned(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	_, bobToken := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Plan(trip)

	h.Request(http.MethodPost, "/api/v1/trips", bobToken, map[string]any{
		"entry_type":     "clone",
		"source_trip_id": trip.ID,
	}).ExpectNotFound()
}
