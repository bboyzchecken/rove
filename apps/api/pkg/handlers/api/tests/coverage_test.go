package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Coverage (A3.5) is derived state that is READ on every trip-room request and
// WRITTEN only by the paths that change a wish or an item. Both halves are
// worth pinning:
//
//   - the write-back sets every row in one statement, and a hand-written CASE
//     is exactly the kind of SQL that silently assigns the right value to the
//     wrong row
//   - the read path no longer writes at all, so a GET must not be the thing
//     that repairs a stale row

func TestCoverageWriteBackSetsEachWishIndividually(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	// Three wishes, one of which the plan will cover and two of which it will
	// not. Anything that mixes the rows up shows here rather than in production.
	covered := createWish(t, h, trip.ID, token, "ศาลเจ้าเมจิ")
	missedA := createWish(t, h, trip.ID, token, "ตลาดปลาโทโยสุ")
	missedB := createWish(t, h, trip.ID, token, "ภูเขาไฟฟูจิ")

	seedDay(t, h, trip.ID, token)

	// Adding the item runs the write-back through the real handler path.
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/items", token, map[string]any{
		"title": "ศาลเจ้าเมจิ",
	}).ExpectStatus(http.StatusCreated)

	states := coverageByWish(t, h, trip.ID)
	if got := states[covered]; got != models.CoverageCovered {
		t.Errorf("covered wish = %q, want %q", got, models.CoverageCovered)
	}
	for _, id := range []string{missedA, missedB} {
		if got := states[id]; got == models.CoverageCovered {
			t.Errorf("wish %s = %q, want it left uncovered", id, got)
		}
	}
}

func TestCoverageGetDoesNotWrite(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โอซาก้า")

	wish := createWish(t, h, trip.ID, token, "ปราสาทโอซาก้า")

	// Poison the stored row behind the API's back. A read must report the truth
	// it derives, and must NOT repair the row on its way past — the write-back
	// belongs to the mutation paths.
	if err := h.DB.Model(&models.WishlistItem{}).
		Where("id = ?", wish).
		UpdateColumn("coverage", models.CoveragePartial).Error; err != nil {
		t.Fatalf("seed stale coverage: %v", err)
	}

	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/coverage", token, nil).
		ExpectStatus(http.StatusOK)

	if got := coverageByWish(t, h, trip.ID)[wish]; got != models.CoveragePartial {
		t.Errorf("stored coverage = %q after a GET, want it untouched (%q)", got, models.CoveragePartial)
	}
}

/* ------------------------------------------------------------- helpers -- */

func createWish(t *testing.T, h *testsupport.Harness, tripID, token, title string) string {
	t.Helper()

	res := h.Request(http.MethodPost, "/api/v1/trips/"+tripID+"/wishlist", token, map[string]any{
		"title": title,
		"kind":  models.WishMust,
	})
	res.ExpectStatus(http.StatusCreated)

	var created struct {
		ID string `json:"id"`
	}
	res.Decode(&created)
	if created.ID == "" {
		t.Fatalf("wishlist create returned no id for %q", title)
	}
	return created.ID
}

// seedDay gives the trip somewhere to put an item — POST /items refuses a plan
// with no days.
func seedDay(t *testing.T, h *testsupport.Harness, tripID, token string) {
	t.Helper()

	res := h.Request(http.MethodGet, "/api/v1/trips/"+tripID+"/plan/days", token, nil)
	res.ExpectStatus(http.StatusOK)

	var days []struct {
		ID string `json:"id"`
	}
	res.Decode(&days)
	if len(days) > 0 {
		return
	}

	plan := &models.Plan{TripID: tripID, IsFinal: true}
	if err := h.DB.Create(plan).Error; err != nil {
		t.Fatalf("create plan: %v", err)
	}
	trip := &models.Trip{}
	if err := h.DB.Where("id = ?", tripID).First(trip).Error; err != nil {
		t.Fatalf("read trip: %v", err)
	}
	day := &models.PlanDay{PlanID: plan.ID, TripID: tripID, DayIndex: 0, Date: *trip.StartDate}
	if err := h.DB.Create(day).Error; err != nil {
		t.Fatalf("create day: %v", err)
	}
}

func coverageByWish(t *testing.T, h *testsupport.Harness, tripID string) map[string]string {
	t.Helper()

	var rows []models.WishlistItem
	if err := h.DB.Where("trip_id = ?", tripID).Find(&rows).Error; err != nil {
		t.Fatalf("read wishlist: %v", err)
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Coverage
	}
	return out
}
