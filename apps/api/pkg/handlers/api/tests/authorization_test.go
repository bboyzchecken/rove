package tests

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// X.3 — cross-trip access, on every endpoint group.
//
// MySQL has no row-level security, so every one of these rules is Go code that
// a refactor can quietly delete (DEV_SPEC §4.3). These tests are what makes
// that deletion loud.
//
// The expected answer is 404, not 403: telling an outsider "forbidden" confirms
// the id exists, which is a slower version of the same leak.

// setupTwoTrips builds two unrelated trips owned by two people. `outsider` is a
// real, signed-in user with no relationship to Alice's trip at all.
func setupTwoTrips(t *testing.T) (h *testsupport.Harness, aliceTrip *models.Trip, outsiderToken string) {
	t.Helper()

	h = testsupport.New(t)
	alice, _ := h.User("alice")
	bob, bobToken := h.User("bob")

	aliceTrip = h.Trip(alice, "อลิซไปโตเกียว")
	h.Trip(bob, "บ๊อบไปโอซาก้า")

	return h, aliceTrip, bobToken
}

func TestOutsiderCannotReachAnyTripRoute(t *testing.T) {
	h, trip, outsider := setupTwoTrips(t)
	plan, _, item := h.Plan(trip)
	h.Expense(trip, mustUser(t, h, trip.OwnerID), "ข้าวเย็น")

	// One row per endpoint group in DEV_SPEC §5. A new group added without a
	// row here is a group with no cross-trip test.
	cases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"trip overview", http.MethodGet, "/api/v1/trips/" + trip.ID, nil},
		{"trip update", http.MethodPatch, "/api/v1/trips/" + trip.ID, map[string]any{"title": "hijacked"}},
		{"trip delete", http.MethodDelete, "/api/v1/trips/" + trip.ID, nil},
		{"trip visibility", http.MethodPatch, "/api/v1/trips/" + trip.ID + "/visibility", map[string]any{"visibility": "public"}},
		{"flights", http.MethodPost, "/api/v1/trips/" + trip.ID + "/flights", map[string]any{"flights": []any{}}},
		{"activity", http.MethodGet, "/api/v1/trips/" + trip.ID + "/activity", nil},

		{"members list", http.MethodGet, "/api/v1/trips/" + trip.ID + "/members", nil},
		{"create invite", http.MethodPost, "/api/v1/trips/" + trip.ID + "/invites", map[string]any{}},

		{"wishlist read", http.MethodGet, "/api/v1/trips/" + trip.ID + "/wishlist", nil},
		{"wishlist write", http.MethodPost, "/api/v1/trips/" + trip.ID + "/wishlist", map[string]any{"text": "แทรกเข้ามา"}},
		{"coverage", http.MethodGet, "/api/v1/trips/" + trip.ID + "/coverage", nil},
		{"profile read", http.MethodGet, "/api/v1/trips/" + trip.ID + "/profile/me", nil},

		{"plans list", http.MethodGet, "/api/v1/trips/" + trip.ID + "/plans", nil},
		{"plan detail", http.MethodGet, "/api/v1/plans/" + plan.ID, nil},
		{"plan delete", http.MethodDelete, "/api/v1/plans/" + plan.ID, nil},
		{"plan validate", http.MethodGet, "/api/v1/plans/" + plan.ID + "/validate", nil},
		{"plan budget", http.MethodGet, "/api/v1/plans/" + plan.ID + "/budget", nil},

		{"item update", http.MethodPatch, "/api/v1/items/" + item.ID, map[string]any{"title": "hijacked"}},
		{"item delete", http.MethodDelete, "/api/v1/items/" + item.ID, nil},
		{"item move", http.MethodPost, "/api/v1/items/" + item.ID + "/move", map[string]any{"day_id": item.DayID, "position": 0}},

		{"expense list", http.MethodGet, "/api/v1/trips/" + trip.ID + "/expense", nil},
		{"expense summary", http.MethodGet, "/api/v1/trips/" + trip.ID + "/expense/summary", nil},
		{"expense create", http.MethodPost, "/api/v1/trips/" + trip.ID + "/expense", map[string]any{"title": "x", "amount": 100}},

		{"prep read", http.MethodGet, "/api/v1/trips/" + trip.ID + "/prep", nil},
		{"comments read", http.MethodGet, "/api/v1/trips/" + trip.ID + "/comments", nil},
		{"bookings", http.MethodGet, "/api/v1/trips/" + trip.ID + "/bookings", nil},
		{"export", http.MethodPost, "/api/v1/trips/" + trip.ID + "/export", map[string]any{"format": "html"}},
		{"events stream", http.MethodGet, "/api/v1/trips/" + trip.ID + "/events", nil},
		{"ai generate", http.MethodPost, "/api/v1/trips/" + trip.ID + "/ai/generate", map[string]any{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h.Request(tc.method, tc.path, outsider, tc.body).ExpectNotFound()
		})
	}
}

func TestAnonymousCannotReachTripRoutes(t *testing.T) {
	h, trip, _ := setupTwoTrips(t)
	plan, _, _ := h.Plan(trip)

	cases := []struct {
		name string
		path string
	}{
		{"trip", "/api/v1/trips/" + trip.ID},
		{"plan", "/api/v1/plans/" + plan.ID},
		{"budget", "/api/v1/plans/" + plan.ID + "/budget"},
		{"expense", "/api/v1/trips/" + trip.ID + "/expense"},
		{"events", "/api/v1/trips/" + trip.ID + "/events"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// No token at all: this one IS a 401, because there is nothing to
			// disclose by saying "sign in first".
			h.Request(http.MethodGet, tc.path, "", nil).ExpectStatus(http.StatusUnauthorized)
		})
	}
}

func TestMemberCanReachTheirOwnTrip(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	plan, _, _ := h.Plan(trip)

	// The mirror of the tests above: the same routes must actually work for
	// someone who belongs, or a 404 everywhere would also pass.
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, aliceToken, nil).ExpectStatus(http.StatusOK)
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/wishlist", aliceToken, nil).ExpectStatus(http.StatusOK)
	h.Request(http.MethodGet, "/api/v1/plans/"+plan.ID, aliceToken, nil).ExpectStatus(http.StatusOK)
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/expense", aliceToken, nil).ExpectStatus(http.StatusOK)
}

// A viewer may read and comment, but must not be able to edit the itinerary.
func TestViewerCannotWrite(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	viewer, viewerToken := h.User("viewer")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, viewer, models.TripRoleViewer)
	plan, _, item := h.Plan(trip)

	t.Run("can read", func(t *testing.T) {
		h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, viewerToken, nil).ExpectStatus(http.StatusOK)
		h.Request(http.MethodGet, "/api/v1/plans/"+plan.ID, viewerToken, nil).ExpectStatus(http.StatusOK)
	})

	t.Run("can comment", func(t *testing.T) {
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/comments", viewerToken, map[string]any{
			"target_type": "trip",
			"target_id":   trip.ID,
			"body":        "วันที่สามแน่นไปไหม",
		}).ExpectStatus(http.StatusCreated)
	})

	t.Run("cannot edit the trip", func(t *testing.T) {
		h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID, viewerToken, map[string]any{
			"title": "เปลี่ยนชื่อ",
		}).ExpectStatus(http.StatusForbidden)
	})

	t.Run("cannot edit an item", func(t *testing.T) {
		h.Request(http.MethodPatch, "/api/v1/items/"+item.ID, viewerToken, map[string]any{
			"title": "เปลี่ยนรายการ",
		}).ExpectStatus(http.StatusForbidden)
	})

	t.Run("cannot add a wish", func(t *testing.T) {
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/wishlist", viewerToken, map[string]any{
			"text": "อยากไปที่นี่",
		}).ExpectStatus(http.StatusForbidden)
	})
}

// An editor runs the trip day to day but must not be able to change who is in
// it or how widely it is shared.
func TestEditorCannotDoOwnerActions(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	editor, editorToken := h.User("editor")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, editor, models.TripRoleEditor)
	plan, _, _ := h.Plan(trip)

	t.Run("can edit the trip", func(t *testing.T) {
		h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID, editorToken, map[string]any{
			"title": "ชื่อใหม่",
		}).ExpectStatus(http.StatusOK)
	})

	t.Run("cannot publish the trip", func(t *testing.T) {
		h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", editorToken, map[string]any{
			"visibility": "public",
		}).ExpectStatus(http.StatusForbidden)
	})

	t.Run("cannot invite", func(t *testing.T) {
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/invites", editorToken, map[string]any{}).
			ExpectStatus(http.StatusForbidden)
	})

	t.Run("cannot delete the trip", func(t *testing.T) {
		h.Request(http.MethodDelete, "/api/v1/trips/"+trip.ID, editorToken, nil).
			ExpectStatus(http.StatusForbidden)
	})

	t.Run("cannot freeze the plan", func(t *testing.T) {
		h.Request(http.MethodPost, "/api/v1/plans/"+plan.ID+"/freeze", editorToken, nil).
			ExpectStatus(http.StatusForbidden)
	})
}

// A member of ONE trip must not be able to reach another trip's rows by id.
// This is the IDOR the tripID-scoped WHERE clauses exist to prevent.
func TestMemberOfOneTripCannotReachAnother(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	bob, bobToken := h.User("bob")

	aliceTrip := h.Trip(alice, "อลิซไปโตเกียว")
	bobTrip := h.Trip(bob, "บ๊อบไปโอซาก้า")

	alicePlan, aliceDay, aliceItem := h.Plan(aliceTrip)
	_, bobDay, _ := h.Plan(bobTrip)

	t.Run("cannot read another trip's plan", func(t *testing.T) {
		h.Request(http.MethodGet, "/api/v1/plans/"+alicePlan.ID, bobToken, nil).ExpectNotFound()
	})

	t.Run("cannot edit another trip's item", func(t *testing.T) {
		h.Request(http.MethodPatch, "/api/v1/items/"+aliceItem.ID, bobToken, map[string]any{
			"title": "hijacked",
		}).ExpectNotFound()
	})

	t.Run("cannot move another trip's item into their own day", func(t *testing.T) {
		h.Request(http.MethodPost, "/api/v1/items/"+aliceItem.ID+"/move", bobToken, map[string]any{
			"day_id": bobDay.ID, "position": 0,
		}).ExpectNotFound()
	})

	// Even inside a trip they own, a day id from elsewhere must be rejected —
	// otherwise a plan could be stitched across two trips.
	t.Run("cannot attach an item to a day from another plan", func(t *testing.T) {
		_, bobsOwnPlan := mustOwnPlan(t, h, bobTrip)
		h.Request(http.MethodPost, "/api/v1/plans/"+bobsOwnPlan+"/items", bobToken, map[string]any{
			"title": "แทรกข้ามทริป", "day_id": aliceDay.ID,
		}).ExpectStatus(http.StatusBadRequest)
	})
}

func TestNonAdminCannotReachAdminRoutes(t *testing.T) {
	h := testsupport.New(t)
	_, userToken := h.User("normal")

	for _, path := range []string{
		"/api/v1/admin/dashboard",
		"/api/v1/admin/pois",
		"/api/v1/admin/characters",
		"/api/v1/admin/partners",
		"/api/v1/admin/flags",
	} {
		t.Run(path, func(t *testing.T) {
			h.Request(http.MethodGet, path, userToken, nil).ExpectStatus(http.StatusForbidden)
		})
	}
}

func TestForgedTokenIsRejected(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	cases := []struct {
		name  string
		token string
	}{
		{"garbage", "not-a-token"},
		{"empty payload", "eyJhbGciOiJIUzI1NiJ9..sig"},
		// A token signed with a different secret must not be accepted, which is
		// what catches a JWT library configured to trust the header's alg.
		{"wrong signature", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZmFrZSJ9.aGFja2Vk"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, tc.token, nil).
				ExpectStatus(http.StatusUnauthorized)
		})
	}
}

// --- helpers ----------------------------------------------------------------

func mustUser(t *testing.T, h *testsupport.Harness, userID string) *models.User {
	t.Helper()
	var user models.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		t.Fatalf("load user %s: %v", userID, err)
	}
	return &user
}

func mustOwnPlan(t *testing.T, h *testsupport.Harness, trip *models.Trip) (string, string) {
	t.Helper()
	var plan models.Plan
	if err := h.DB.Where("trip_id = ?", trip.ID).First(&plan).Error; err != nil {
		t.Fatalf("load plan for trip %s: %v", trip.ID, err)
	}
	return fmt.Sprint(plan.TripID), plan.ID
}
