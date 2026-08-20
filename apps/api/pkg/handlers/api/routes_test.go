package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

// X.3 — no endpoint is accidentally public.
//
// Authorization is enforced by middleware, which means the failure mode is a
// route registered on the wrong group: it compiles, it works, and it is open to
// the internet. This walks the real router and checks every path against what
// it is *supposed* to be, so adding a route to the wrong group fails here
// rather than in production.
//
// It needs no database: an unauthenticated request is rejected before any store
// is touched.

// publicPaths is the allowlist. Anything not on it must demand a token.
var publicPaths = map[string]bool{
	"/healthz":                          true,
	"/readyz":                           true,
	"/go/:clickId":                      true, // affiliate redirect — a link people click
	"/api/v1/characters":                true, // static catalogue, also shipped in the web bundle
	"/api/v1/airports":                  true, // worldwide airport index — public reference data (A1.3)
	"/api/v1/airports/:iata":            true,
	"/api/v1/auth/:provider/url":        true,
	"/api/v1/auth/oauth/:provider":      true,
	"/api/v1/auth/logout":               true,
	"/api/v1/auth/demo":                 true, // registered only when MOCK_MODE is on
	"/api/v1/invites/:token":            true, // preview before signing in
	"/api/v1/public/trips/:tokenOrSlug": true,
	"/api/v1/public/explore":            true,
}

// isSynthetic filters the entries Echo adds for a group itself — the 404 and
// 405 fallbacks — which are not routes anyone can call.
func isSynthetic(route *echo.Route) bool {
	return route.Method == http.MethodOptions ||
		strings.HasPrefix(route.Method, "echo_") ||
		strings.HasSuffix(route.Path, "*")
}

func newTestServer(t *testing.T, mock bool) *Server {
	t.Helper()
	// Only the config and the router are exercised; every store stays nil
	// because no handler body runs in these tests.
	return NewServer(ServerParams{
		Config: core.Config{
			Environment:    "test",
			MockMode:       mock,
			Port:           "0",
			JwtSecret:      "test-secret",
			AuthCookieName: "rove_token",
			WebBaseURL:     "http://localhost:3000",
		},
	})
}

func TestEveryPrivateRouteRequiresAToken(t *testing.T) {
	s := newTestServer(t, true)

	for _, route := range s.Echo().Routes() {
		if publicPaths[route.Path] {
			continue
		}
		if isSynthetic(route) {
			continue
		}

		// Substitute something for the parameters so the router matches.
		path := route.Path
		for _, param := range []string{
			":tripId", ":userId", ":itemId", ":wishId", ":expenseId", ":taskId",
			":bookingId", ":commentId", ":jobId", ":dreamId", ":poiId", ":token",
			":clickId", ":provider", ":tokenOrSlug", ":flightId",
		} {
			path = strings.ReplaceAll(path, param, "x")
		}

		req := httptest.NewRequest(route.Method, path, strings.NewReader("{}"))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		s.Echo().ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401 (is it registered on the right group?)",
				route.Method, route.Path, rec.Code)
		}
	}
}

func TestTripRoutesAreScopedByTripID(t *testing.T) {
	s := newTestServer(t, true)

	for _, route := range s.Echo().Routes() {
		if isSynthetic(route) || !strings.HasPrefix(route.Path, "/api/v1/trips/") {
			continue
		}
		// Everything under /trips/ must carry the trip id, because that is what
		// TripRoleMiddleware and every store's WHERE clause key on (§4.3).
		if !strings.Contains(route.Path, ":tripId") {
			t.Errorf("%s %s is trip-scoped but has no :tripId", route.Method, route.Path)
		}
	}
}

func TestDemoLoginOnlyExistsInMockMode(t *testing.T) {
	live := newTestServer(t, false)
	for _, route := range live.Echo().Routes() {
		if route.Path == "/api/v1/auth/demo" {
			t.Fatal("the demo sign-in must never be registered outside mock mode")
		}
	}

	mock := newTestServer(t, true)
	found := false
	for _, route := range mock.Echo().Routes() {
		if route.Path == "/api/v1/auth/demo" {
			found = true
		}
	}
	if !found {
		t.Fatal("mock mode needs a way in that does not involve a provider console")
	}
}

// The expense endpoints are the ones that must never be reachable without
// membership: they answer "who owes whom", which is the most personal data in
// the product (W16.5).
func TestExpenseRoutesAreNeverPublic(t *testing.T) {
	s := newTestServer(t, true)

	for _, route := range s.Echo().Routes() {
		if !strings.Contains(route.Path, "expense") {
			continue
		}
		if publicPaths[route.Path] {
			t.Fatalf("%s is on the public allowlist and must not be", route.Path)
		}
	}
}
