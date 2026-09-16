package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Step overrides (Feedback #2 — D-11/D-12; Feedback #4 — D-26).
//
// "confirmed" is the escape hatch for a check step that has no way to reach
// 100% on its own — the write path is the same as "skipped" (one row, whoever
// set it), it just reads back as done instead of skipped.

func TestSetStepStatusConfirmedReadsBackAsOverride(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "เกียวโต")

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/steps/dates", token,
		map[string]any{"status": "confirmed"},
	).ExpectStatus(http.StatusOK)

	if got := stepOverrideOf(t, h, trip.ID, token, "dates"); got != "confirmed" {
		t.Errorf("dates override = %q, want %q", got, "confirmed")
	}

	// "todo" clears it, same as it does for a skip.
	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/steps/dates", token,
		map[string]any{"status": "todo"},
	).ExpectStatus(http.StatusOK)

	if got := stepOverrideOf(t, h, trip.ID, token, "dates"); got != "" {
		t.Errorf("dates override = %q after clearing, want none", got)
	}
}

func TestSetStepStatusRejectsUnknownStatus(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โอซาก้า")

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/steps/plan", token,
		map[string]any{"status": "done"},
	).ExpectStatus(http.StatusBadRequest)
}

func stepOverrideOf(t *testing.T, h *testsupport.Harness, tripID, token, step string) string {
	t.Helper()

	res := h.Request(http.MethodGet, "/api/v1/trips/"+tripID+"/overview", token, nil)
	res.ExpectStatus(http.StatusOK)

	var overview struct {
		StepOverrides map[string]string `json:"step_overrides"`
	}
	res.Decode(&overview)
	return overview.StepOverrides[step]
}
