package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Home dashboard's upcoming/past split (Feedback #4 — F10/D-15/D-16, D-28).
//
// This used to split purely on the calendar: past the return date meant
// "past trips", full stop. That quietly told a group their room was history
// before anyone had said so, and it never gave a stale trip a way back into
// "upcoming" once someone finally confirmed it. Both are status-driven now.

type tripIDRow struct {
	ID string `json:"id"`
}

func idsOf(rows []tripIDRow) []string {
	out := make([]string, len(rows))
	for i, row := range rows {
		out[i] = row.ID
	}
	return out
}

func TestPastDatesStayUpcomingUntilConfirmedDone(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โอซาก้า")

	end := time.Now().UTC().AddDate(0, 0, -3)
	start := end.AddDate(0, 0, -4)
	trip.StartDate, trip.EndDate = &start, &end
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("save: %v", err)
	}

	var upcoming []tripIDRow
	h.Request(http.MethodGet, "/api/v1/users/me/trips/upcoming", token, nil).
		ExpectStatus(http.StatusOK).Decode(&upcoming)
	if got := idsOf(upcoming); !contains(got, trip.ID) {
		t.Errorf("upcoming = %v, want it to still contain %s (not confirmed done)", got, trip.ID)
	}

	var past []tripIDRow
	h.Request(http.MethodGet, "/api/v1/users/me/trips/past", token, nil).
		ExpectStatus(http.StatusOK).Decode(&past)
	if got := idsOf(past); contains(got, trip.ID) {
		t.Errorf("past = %v, want it NOT to contain %s yet", got, trip.ID)
	}

	// The owner confirms it — now it moves.
	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID, token,
		map[string]any{"status": "done"},
	).ExpectStatus(http.StatusOK)

	h.Request(http.MethodGet, "/api/v1/users/me/trips/upcoming", token, nil).
		ExpectStatus(http.StatusOK).Decode(&upcoming)
	if got := idsOf(upcoming); contains(got, trip.ID) {
		t.Errorf("upcoming = %v, want %s gone after confirming done", got, trip.ID)
	}

	h.Request(http.MethodGet, "/api/v1/users/me/trips/past", token, nil).
		ExpectStatus(http.StatusOK).Decode(&past)
	if got := idsOf(past); !contains(got, trip.ID) {
		t.Errorf("past = %v, want it to contain %s now", got, trip.ID)
	}
}

func TestStaleUnconfirmedTripAutoClosesAfterThreshold(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "เชียงใหม่")

	end := time.Now().UTC().AddDate(0, 0, -40)
	start := end.AddDate(0, 0, -4)
	trip.StartDate, trip.EndDate = &start, &end
	if err := h.DB.Save(trip).Error; err != nil {
		t.Fatalf("save: %v", err)
	}

	var past []tripIDRow
	h.Request(http.MethodGet, "/api/v1/users/me/trips/past", token, nil).
		ExpectStatus(http.StatusOK).Decode(&past)
	if got := idsOf(past); !contains(got, trip.ID) {
		t.Errorf("past = %v, want %s auto-closed after 30+ days unconfirmed (D-28)", got, trip.ID)
	}

	var reloaded models.Trip
	if err := h.DB.Where("id = ?", trip.ID).First(&reloaded).Error; err != nil {
		t.Fatalf("reload: %v", err)
	}
	if reloaded.Status != models.TripStatusDone {
		t.Errorf("stored status = %q, want %q — the sweep must persist, not just answer this one response", reloaded.Status, models.TripStatusDone)
	}
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
