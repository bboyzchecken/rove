package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// X.3, second half — expense must never reach a public payload.
//
// DEV_SPEC §4.3 states it as a rule, and public.handler.go implements it
// structurally (there is no code path from the public payload builder to the
// expense tables). These tests are what keeps that true after a refactor that
// "just reuses the internal DTO".

// publishedTripWithExpense builds the worst case: a fully public trip whose
// members have recorded distinctive spending.
func publishedTripWithExpense(t *testing.T) (*testsupport.Harness, *models.Trip, string) {
	t.Helper()

	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Plan(trip)

	// A string that appears nowhere else, so finding it in a response is
	// unambiguous rather than a coincidence.
	h.Expense(trip, alice, secretExpenseTitle)

	res := h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "public"})
	res.ExpectStatus(http.StatusOK)

	var body struct {
		ShareToken string `json:"share_token"`
		Slug       string `json:"slug"`
	}
	res.Decode(&body)

	if body.ShareToken == "" {
		t.Fatal("publishing a trip did not produce a share token")
	}
	return h, trip, body.ShareToken
}

const secretExpenseTitle = "ค่าอาหารลับเฉพาะกลุ่ม-XYZZY"

func TestPublicPlanNeverCarriesExpense(t *testing.T) {
	h, _, token := publishedTripWithExpense(t)

	res := h.Request(http.MethodGet, "/public/plans/"+token, "", nil)
	res.ExpectStatus(http.StatusOK)

	if res.BodyContains(secretExpenseTitle) {
		t.Error("expense title leaked into the public plan payload")
	}
	for _, field := range []string{"expense", "paid_by_user_id", "split_type", "settlements"} {
		if res.BodyContains(field) {
			t.Errorf("public payload mentions %q", field)
		}
	}
}

func TestPublicExploreNeverCarriesExpense(t *testing.T) {
	h, _, _ := publishedTripWithExpense(t)

	res := h.Request(http.MethodGet, "/public/explore", "", nil)
	res.ExpectStatus(http.StatusOK)

	if res.BodyContains(secretExpenseTitle) {
		t.Error("expense title leaked into the explore listing")
	}
}

// Publishing must force expense hidden regardless of what the client sent, and
// keep it that way (§4.3 makes it a rule, not a preference).
func TestPublishingForcesExpenseHidden(t *testing.T) {
	h, trip, _ := publishedTripWithExpense(t)

	var stored models.Trip
	if err := h.DB.Where("id = ?", trip.ID).First(&stored).Error; err != nil {
		t.Fatalf("reload trip: %v", err)
	}

	if !stored.PublicHideExpense {
		t.Error("public_hide_expense is false on a published trip")
	}
	if stored.Visibility != models.VisibilityPublic {
		t.Errorf("visibility = %q, want public", stored.Visibility)
	}
}

// A member still sees their own expense — the rule is about outsiders, and a
// test that only proved "nobody can read it" would pass on a broken feature.
func TestMemberStillSeesExpense(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Expense(trip, alice, secretExpenseTitle)

	res := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/expense", aliceToken, nil)
	res.ExpectStatus(http.StatusOK)

	if !res.BodyContains(secretExpenseTitle) {
		t.Error("a trip member cannot see their own trip's expense")
	}
}

func TestPrivateTripIsNotReachableByToken(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Plan(trip)

	// Share by link, then take it back.
	res := h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "link"})
	var body struct {
		ShareToken string `json:"share_token"`
	}
	res.Decode(&body)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "private"}).ExpectStatus(http.StatusOK)

	// The token still exists (so re-sharing does not break old links), but it
	// must stop working while the trip is private.
	h.Request(http.MethodGet, "/public/plans/"+body.ShareToken, "", nil).ExpectNotFound()
}

// A link-shared trip is "anyone with the link", not "anyone who guesses a
// slug" — so its slug must not resolve.
func TestLinkSharedTripIsNotReachableBySlug(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.Plan(trip)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/visibility", aliceToken,
		map[string]any{"visibility": "link"}).ExpectStatus(http.StatusOK)

	var stored models.Trip
	if err := h.DB.Where("id = ?", trip.ID).First(&stored).Error; err != nil {
		t.Fatalf("reload trip: %v", err)
	}
	// A link-only trip gets no slug at all; if one is ever assigned, it must
	// still not resolve publicly.
	if stored.Slug != nil {
		h.Request(http.MethodGet, "/public/plans/"+*stored.Slug, "", nil).ExpectNotFound()
	}
}

func TestUnknownShareTokenIsNotFound(t *testing.T) {
	h := testsupport.New(t)

	h.Request(http.MethodGet, "/public/plans/definitely-not-a-real-token", "", nil).ExpectNotFound()
}

// The API never returns a user's email or provider id, on any route.
func TestUserPayloadsNeverCarrySecrets(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")

	email := "alice-private@example.com"
	if err := h.DB.Model(&models.User{}).Where("id = ?", alice.ID).
		Update("email", email).Error; err != nil {
		t.Fatalf("set email: %v", err)
	}

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, bob, models.TripRoleEditor)

	// Bob is a member, so he legitimately sees Alice in the member list — but
	// never her email.
	res := h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/members", bobToken, nil)
	res.ExpectStatus(http.StatusOK)

	if res.BodyContains(email) {
		t.Error("a member's email leaked into the member list")
	}
	if res.BodyContains("password") || res.BodyContains("provider_uid") {
		t.Error("member list carries credential fields")
	}

	// Alice reading her own /auth/me does get her email; that is hers.
	own := h.Request(http.MethodGet, "/api/v1/auth/me", aliceToken, nil)
	own.ExpectStatus(http.StatusOK)
	if !own.BodyContains(email) {
		t.Error("/auth/me does not return the caller's own email")
	}
	if own.BodyContains("\"password\"") {
		t.Error("/auth/me leaks the password field")
	}
}
