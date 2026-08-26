package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M23 — A23.1 / A23.2 / X23.1: the points ledger and the audience card.
//
// Points redeem for money off (A12.10), so the ledger is the record behind
// something with a price. Two properties matter and are tested here: it must
// be complete for its owner (every row reachable through the cursor), and it
// must be invisible to everybody else.

type pointsLedgerResponse struct {
	Balance int `json:"balance"`
	Earned  int `json:"earned"`
	Entries []struct {
		ID         string  `json:"id"`
		Delta      int     `json:"delta"`
		Reason     string  `json:"reason"`
		Note       string  `json:"note"`
		TripID     *string `json:"trip_id"`
		TripTitle  string  `json:"trip_title"`
		OccurredAt string  `json:"occurred_at"`
	} `json:"entries"`
	NextCursor string `json:"next_cursor"`
}

type audienceResponse struct {
	TotalViews   int    `json:"total_views"`
	TotalClones  int    `json:"total_clones"`
	PointsEarned int    `json:"points_earned"`
	PublicTrips  int    `json:"public_trips"`
	TopTripID    string `json:"top_trip_id"`
	Trips        []struct {
		TripID        string `json:"trip_id"`
		Title         string `json:"title"`
		Views         int    `json:"views"`
		Clones        int    `json:"clones"`
		AwardedClones int    `json:"awarded_clones"`
		PointsEarned  int    `json:"points_earned"`
	} `json:"trips"`
}

// award writes a ledger row directly. The handlers that mint points are tested
// where they live; these tests are about reading them back.
func award(t *testing.T, h *testsupport.Harness, userID string, delta int, reason, note string, tripID *string, at time.Time) {
	t.Helper()
	row := &models.UserPoints{
		UserID:     userID,
		Delta:      delta,
		Reason:     reason,
		Note:       note,
		TripID:     tripID,
		OccurredAt: at,
	}
	if err := h.DB.Create(row).Error; err != nil {
		t.Fatalf("award points: %v", err)
	}
}

// X23.1 — the cross-user case from §4.3, applied to the ledger.
//
// There is no id in the path here, which is exactly why this is worth a test:
// the only thing keeping Bob's rows out of Alice's response is that the
// handler reads the subject from the token instead of from the request. A
// refactor that "helpfully" adds ?user_id= would pass every other test.
func TestPointsLedgerNeverLeaksAnotherUser(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")

	now := time.Now().UTC()
	award(t, h, alice.ID, 500, models.PointsReasonPublish, "อลิซเปิดทริปสาธารณะ", nil, now)
	award(t, h, bob.ID, 260, models.PointsReasonClone, "ความลับของบ๊อบ", nil, now)

	var forAlice pointsLedgerResponse
	res := h.Request(http.MethodGet, "/api/v1/users/me/points", aliceToken, nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&forAlice)

	if forAlice.Balance != 500 {
		t.Errorf("alice balance = %d, want 500", forAlice.Balance)
	}
	if len(forAlice.Entries) != 1 {
		t.Fatalf("alice sees %d entries, want 1", len(forAlice.Entries))
	}
	if res.BodyContains("ความลับของบ๊อบ") {
		t.Error("bob's ledger row appeared in alice's response")
	}

	// And the mirror image, so the test fails if the scoping is reversed
	// rather than removed.
	var forBob pointsLedgerResponse
	bobRes := h.Request(http.MethodGet, "/api/v1/users/me/points", bobToken, nil)
	bobRes.ExpectStatus(http.StatusOK)
	bobRes.Decode(&forBob)

	if forBob.Balance != 260 {
		t.Errorf("bob balance = %d, want 260", forBob.Balance)
	}
	if bobRes.BodyContains("อลิซเปิดทริปสาธารณะ") {
		t.Error("alice's ledger row appeared in bob's response")
	}

	h.Request(http.MethodGet, "/api/v1/users/me/points", "", nil).
		ExpectStatus(http.StatusUnauthorized)
}

// A23.1 — the whole history is reachable, not just the newest page.
//
// The old endpoint returned a hard-capped 30 rows with no way past them, which
// is what this walk is here to stop coming back.
func TestPointsLedgerPagesThroughEverything(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")

	const total = 71
	base := time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)
	for i := 0; i < total; i++ {
		award(t, h, alice.ID, 10, models.PointsReasonClone, "มีคนคัดลอกทริป", nil,
			base.Add(time.Duration(i)*time.Minute))
	}

	seen := map[string]bool{}
	cursor, pages := "", 0

	for {
		path := "/api/v1/users/me/points"
		if cursor != "" {
			path += "?cursor=" + cursor
		}

		var page pointsLedgerResponse
		res := h.Request(http.MethodGet, path, token, nil)
		res.ExpectStatus(http.StatusOK)
		res.Decode(&page)

		for _, entry := range page.Entries {
			if seen[entry.ID] {
				t.Fatalf("entry %s came back on two pages", entry.ID)
			}
			seen[entry.ID] = true
		}

		pages++
		if pages > 10 {
			t.Fatal("pagination did not terminate")
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}

	if len(seen) != total {
		t.Errorf("walked %d entries, want %d", len(seen), total)
	}
	if pages != 3 {
		t.Errorf("took %d pages for %d rows at 30 a page, want 3", pages, total)
	}
}

// A23.1 — a ledger line names its trip. Resolving the id is the difference
// between "260 แต้ม · 4f3c…" and "260 แต้ม · โตเกียว 5 วัน".
func TestPointsLedgerNamesTheTripBehindARow(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "โตเกียว 5 วัน")

	award(t, h, alice.ID, 260, models.PointsReasonClone, "มีคนคัดลอกทริป", &trip.ID, time.Now().UTC())

	var ledger pointsLedgerResponse
	res := h.Request(http.MethodGet, "/api/v1/users/me/points", token, nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&ledger)

	if len(ledger.Entries) != 1 {
		t.Fatalf("got %d entries, want 1", len(ledger.Entries))
	}
	if ledger.Entries[0].TripTitle != "โตเกียว 5 วัน" {
		t.Errorf("trip_title = %q, want the trip's title", ledger.Entries[0].TripTitle)
	}
}

// A23.1 — earned counts awards, balance counts what is left. A redemption must
// move one and not the other, or the profile card quietly reports that
// spending points un-earned them.
func TestPointsLedgerSeparatesEarnedFromBalance(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")

	now := time.Now().UTC()
	award(t, h, alice.ID, 500, models.PointsReasonPublish, "เปิดสาธารณะ", nil, now.Add(-time.Hour))
	award(t, h, alice.ID, -400, models.PointsReasonRedeem, "แลกเป็นโค้ดส่วนลด", nil, now)

	var ledger pointsLedgerResponse
	res := h.Request(http.MethodGet, "/api/v1/users/me/points", token, nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&ledger)

	if ledger.Balance != 100 {
		t.Errorf("balance = %d, want 100", ledger.Balance)
	}
	if ledger.Earned != 500 {
		t.Errorf("earned = %d, want 500 (spending is not un-earning)", ledger.Earned)
	}
}

// A23.2 — the audience card: my public trips, what they were worth, and what
// they paid. Private trips are not an audience.
func TestAudienceCountsOnlyPublishedTrips(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")

	published := h.Trip(alice, "โซลคาเฟ่ฮอป")
	slug := "seoul-cafe-hop"
	published.Visibility = models.VisibilityPublic
	published.Slug = &slug
	published.ViewCount = 120
	published.CloneCount = 3
	if err := h.DB.Save(published).Error; err != nil {
		t.Fatalf("publish trip: %v", err)
	}

	// Still private, with counters on it — it must not reach the card.
	quiet := h.Trip(alice, "ทริปที่ยังไม่เปิด")
	quiet.ViewCount = 999
	if err := h.DB.Save(quiet).Error; err != nil {
		t.Fatalf("save private trip: %v", err)
	}

	// Two of the three copies paid out; the third was somebody re-copying
	// their own, which earns nothing.
	award(t, h, alice.ID, 260, models.PointsReasonClone, "มีคนคัดลอกทริป", &published.ID, time.Now().UTC())
	award(t, h, alice.ID, 260, models.PointsReasonClone, "มีคนคัดลอกทริป", &published.ID, time.Now().UTC())

	var audience audienceResponse
	res := h.Request(http.MethodGet, "/api/v1/users/me/audience", token, nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&audience)

	if audience.PublicTrips != 1 {
		t.Fatalf("public_trips = %d, want 1", audience.PublicTrips)
	}
	if audience.TotalViews != 120 {
		t.Errorf("total_views = %d, want 120 (the private trip must not count)", audience.TotalViews)
	}
	if audience.TotalClones != 3 {
		t.Errorf("total_clones = %d, want 3", audience.TotalClones)
	}
	if audience.PointsEarned != 520 {
		t.Errorf("points_earned = %d, want 520", audience.PointsEarned)
	}
	if audience.TopTripID != published.ID {
		t.Errorf("top_trip_id = %q, want the published trip", audience.TopTripID)
	}
	if len(audience.Trips) != 1 || audience.Trips[0].AwardedClones != 2 {
		t.Errorf("awarded clones = %+v, want one trip with 2", audience.Trips)
	}
}

// A23.2 — same shape as the ledger: no id in the path, so the only thing
// keeping two creators apart is where the handler reads the subject from.
func TestAudienceNeverLeaksAnotherCreator(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	_, bobToken := h.User("bob")

	trip := h.Trip(alice, "ทริปของอลิซที่เปิดสาธารณะ")
	trip.Visibility = models.VisibilityPublic
	trip.ViewCount = 400
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("publish trip: %v", err)
	}

	var audience audienceResponse
	res := h.Request(http.MethodGet, "/api/v1/users/me/audience", bobToken, nil)
	res.ExpectStatus(http.StatusOK)
	res.Decode(&audience)

	if audience.PublicTrips != 0 || audience.TotalViews != 0 {
		t.Errorf("bob sees %+v, want an empty audience", audience)
	}
	if res.BodyContains("ทริปของอลิซ") {
		t.Error("alice's trip appeared in bob's audience")
	}
}
