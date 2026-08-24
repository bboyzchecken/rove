package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// X.3 — cross-trip access, on every endpoint group.
//
// MySQL has no row-level security, so every one of these rules is Go code that
// a refactor can quietly delete (DEV_SPEC §4.3). These tests make that deletion
// loud.
//
// They complement pkg/handlers/api/routes_test.go rather than repeating it:
// that one proves no route is registered on the wrong group, walking the table
// with no database. This one runs real requests as real users against a real
// schema, and proves the middleware actually keeps two trips apart. A route can
// sit on the correct group and still hand back another trip's rows.

func TestOutsiderCannotReachAnyTripRoute(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	bob, outsider := h.User("bob")

	// Bob has his own trip, so he is a legitimate signed-in user — just not a
	// member of Alice's. That is the case a naive `WHERE id = ?` gets wrong.
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Trip(bob, "บ๊อบไปโอซาก้า")

	base := "/api/v1/trips/" + trip.ID

	// One row per endpoint group in DEV_SPEC §5. A group added without a row
	// here is a group with no cross-trip test.
	cases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"trip detail", http.MethodGet, base, nil},
		{"trip overview", http.MethodGet, base + "/overview", nil},
		{"trip recap", http.MethodGet, base + "/recap", nil},
		{"trip update", http.MethodPatch, base, map[string]any{"title": "hijacked"}},
		{"trip delete", http.MethodDelete, base, nil},
		{"visibility", http.MethodPatch, base + "/visibility", map[string]any{"visibility": "public"}},
		{"share", http.MethodGet, base + "/share", nil},
		{"clone", http.MethodPost, base + "/clone", nil},
		{"activity", http.MethodGet, base + "/activity", nil},

		{"route", http.MethodGet, base + "/flights", nil},
		{"route write", http.MethodPut, base + "/flights", map[string]any{"flights": []any{}}},

		{"members", http.MethodGet, base + "/members", nil},
		{"invite", http.MethodPost, base + "/invites", map[string]any{}},

		{"wishlist read", http.MethodGet, base + "/wishlist", nil},
		{"wishlist write", http.MethodPost, base + "/wishlist", map[string]any{"title": "แทรกเข้ามา"}},
		{"coverage", http.MethodGet, base + "/coverage", nil},

		{"plan days", http.MethodGet, base + "/plan/days", nil},
		{"plan versions", http.MethodGet, base + "/plan/versions", nil},
		{"plan undo", http.MethodPost, base + "/plan/undo", nil},
		{"item create", http.MethodPost, base + "/items", map[string]any{"title": "แทรก"}},

		{"budget read", http.MethodGet, base + "/budget", nil},
		{"budget write", http.MethodPut, base + "/budget", map[string]any{}},

		{"expenses read", http.MethodGet, base + "/expenses/summary", nil},
		{"expenses write", http.MethodPost, base + "/expenses", map[string]any{"title": "x", "amount": 100}},

		{"dates board", http.MethodGet, base + "/dates/board", nil},
		{"dates submit", http.MethodPost, base + "/dates/submit", map[string]any{}},

		{"prep read", http.MethodGet, base + "/prep", nil},
		{"prep write", http.MethodPost, base + "/prep", map[string]any{"title": "x"}},

		{"comments read", http.MethodGet, base + "/comments", nil},
		{"comments write", http.MethodPost, base + "/comments", map[string]any{"body": "hello"}},
		{"votes", http.MethodGet, base + "/votes", nil},

		{"bookings", http.MethodGet, base + "/bookings", nil},
		{"export", http.MethodGet, base + "/export", nil},
		{"events stream", http.MethodGet, base + "/events", nil},

		{"ai credits", http.MethodGet, base + "/ai/credits", nil},
		{"ai generate", http.MethodPost, base + "/ai/generate", map[string]any{}},

		// Phase 2 groups.
		{"member profile read", http.MethodGet, base + "/profile/me", nil},
		{"member profile write", http.MethodPut, base + "/profile/me", map[string]any{"pace": "packed"}},
		{"trip profiles", http.MethodGet, base + "/profiles", nil},

		{"variants read", http.MethodGet, base + "/variants", nil},
		{"variants fork", http.MethodPost, base + "/variants", map[string]any{"label": "แทรก"}},
		{"variants generate", http.MethodPost, base + "/variants/generate", map[string]any{"count": 2}},
		{"plan freeze", http.MethodPost, base + "/plan/freeze", nil},
		{"conflicts", http.MethodGet, base + "/conflicts", nil},

		{"photos read", http.MethodGet, base + "/photos", nil},
		{"photobook", http.MethodGet, base + "/photobook", nil},
		{"documents read", http.MethodGet, base + "/documents", nil},

		{"polls read", http.MethodGet, base + "/polls", nil},
		{"polls write", http.MethodPost, base + "/polls", map[string]any{
			"question": "แทรกเข้ามา", "options": []string{"a", "b"},
		}},
		{"presence", http.MethodPost, base + "/presence", map[string]any{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h.Request(tc.method, tc.path, outsider, tc.body).ExpectDenied()
		})
	}
}

func TestAnonymousCannotReachTripRoutes(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	base := "/api/v1/trips/" + trip.ID
	for _, path := range []string{
		base, base + "/overview", base + "/wishlist", base + "/budget",
		base + "/expenses/summary", base + "/events", "/api/v1/trips",
		"/api/v1/users/me/stats", "/api/v1/auth/me",
	} {
		t.Run(path, func(t *testing.T) {
			// No token at all IS a 401: there is nothing to disclose by saying
			// "sign in first".
			h.Request(http.MethodGet, path, "", nil).ExpectStatus(http.StatusUnauthorized)
		})
	}
}

// The mirror of the tests above. Without it, a router that returned 404 for
// everything would also pass.
func TestMemberCanReachTheirOwnTrip(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	base := "/api/v1/trips/" + trip.ID
	for _, path := range []string{
		base, base + "/overview", base + "/recap", base + "/wishlist", base + "/members",
		base + "/expenses/summary", base + "/prep", base + "/comments",
	} {
		t.Run(path, func(t *testing.T) {
			h.Request(http.MethodGet, path, token, nil).ExpectStatus(http.StatusOK)
		})
	}
}

// A viewer may read and comment, but must not touch the itinerary.
func TestViewerCannotWrite(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	viewer, viewerToken := h.User("viewer")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, viewer, models.TripRoleViewer)
	base := "/api/v1/trips/" + trip.ID

	t.Run("can read the trip", func(t *testing.T) {
		h.Request(http.MethodGet, base, viewerToken, nil).ExpectStatus(http.StatusOK)
	})

	writes := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"edit the trip", http.MethodPatch, base, map[string]any{"title": "เปลี่ยนชื่อ"}},
		{"add a wish", http.MethodPost, base + "/wishlist", map[string]any{"title": "อยากไป"}},
		{"add an item", http.MethodPost, base + "/items", map[string]any{"title": "แทรก"}},
		{"record an expense", http.MethodPost, base + "/expenses", map[string]any{"title": "x", "amount": 100}},
		{"add a prep task", http.MethodPost, base + "/prep", map[string]any{"title": "x"}},
	}

	for _, tc := range writes {
		t.Run("cannot "+tc.name, func(t *testing.T) {
			h.Request(tc.method, tc.path, viewerToken, tc.body).ExpectDenied()
		})
	}
}

// An editor runs the trip day to day but must not change who is in it or how
// widely it is shared.
func TestEditorCannotDoOwnerActions(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	editor, editorToken := h.User("editor")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, editor, models.TripRoleEditor)
	base := "/api/v1/trips/" + trip.ID

	t.Run("can edit the trip", func(t *testing.T) {
		h.Request(http.MethodPatch, base, editorToken, map[string]any{"title": "ชื่อใหม่"}).
			ExpectStatus(http.StatusOK)
	})

	ownerOnly := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"publish the trip", http.MethodPatch, base + "/visibility", map[string]any{"visibility": "public"}},
		{"invite someone", http.MethodPost, base + "/invites", map[string]any{}},
		{"delete the trip", http.MethodDelete, base, nil},
	}

	for _, tc := range ownerOnly {
		t.Run("cannot "+tc.name, func(t *testing.T) {
			h.Request(tc.method, tc.path, editorToken, tc.body).ExpectDenied()
		})
	}
}

func TestNonAdminCannotReachAdminRoutes(t *testing.T) {
	h := testsupport.New(t)
	_, userToken := h.User("normal")

	for _, path := range []string{
		"/api/v1/admin/stats",
		"/api/v1/admin/poi",
		"/api/v1/admin/characters",
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

	cases := []struct{ name, token string }{
		{"garbage", "not-a-token"},
		{"empty payload", "eyJhbGciOiJIUzI1NiJ9..sig"},
		// Signed with a different secret. This is what catches a JWT library
		// configured to trust the header's alg.
		{"wrong signature", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZmFrZSJ9.aGFja2Vk"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID, tc.token, nil).
				ExpectStatus(http.StatusUnauthorized)
		})
	}
}
