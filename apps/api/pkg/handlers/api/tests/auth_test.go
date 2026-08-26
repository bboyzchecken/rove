package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// The dev-login door (§16, trip-planning-platform-plan.md §11) is a
// break-glass entry for staff, not a way to test as an ordinary user — the
// web app only ever links to it from /admin/login, never the public /login
// screen a mule-account script could reach. Whatever account it signs into
// must always come back admin, even on the very first call and even on every
// call after that.

func TestDemoLoginAlwaysGrantsAdmin(t *testing.T) {
	h := testsupport.NewMock(t)

	// Seed a regular user first so the demo account is not the bootstrap
	// "first user ever" admin by coincidence — that path already exists and
	// would mask a regression in the demo-login-specific promotion.
	h.User("someone-else")

	res := h.Request(http.MethodPost, "/api/v1/auth/demo", "", nil).ExpectStatus(http.StatusOK)

	var body struct {
		Token string `json:"token"`
		User  struct {
			Role string `json:"role"`
		} `json:"user"`
	}
	res.Decode(&body)

	if body.User.Role != models.RoleAdmin {
		t.Fatalf("role = %q, want %q", body.User.Role, models.RoleAdmin)
	}

	// A second call finds the same account rather than creating another one,
	// and it must still come back admin.
	res2 := h.Request(http.MethodPost, "/api/v1/auth/demo", "", nil).ExpectStatus(http.StatusOK)
	var body2 struct {
		User struct {
			Role string `json:"role"`
		} `json:"user"`
	}
	res2.Decode(&body2)
	if body2.User.Role != models.RoleAdmin {
		t.Fatalf("second call role = %q, want %q", body2.User.Role, models.RoleAdmin)
	}
}
