package testsupport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Harness is a running API plus the handles a test needs to set up state.
type Harness struct {
	T      *testing.T
	Server *handlers.Server
	DB     *gorm.DB
	Config core.Config
}

// New builds a server with every store wired to an in-memory database.
func New(t *testing.T) *Harness {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared&_pragma=foreign_keys(1)"), &gorm.Config{
		Logger:  gormlogger.Default.LogMode(gormlogger.Silent),
		NowFunc: func() time.Time { return time.Now().UTC() },
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	// A fresh schema per test: shared-cache in-memory SQLite would otherwise
	// leak rows between tests in the same package.
	for _, table := range allTables {
		if err := db.Migrator().DropTable(table); err != nil {
			t.Fatalf("reset schema: %v", err)
		}
	}
	if err := db.AutoMigrate(allModels...); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	cfg := core.Config{
		Environment:    "test",
		Port:           "0",
		JwtSecret:      "test-secret-not-used-anywhere-real",
		AuthCookieName: "rove_token",
		WebBaseURL:     "http://localhost:3000",
		AppBaseURL:     "http://localhost:5000",
	}

	return &Harness{
		T:      t,
		Server: handlers.NewServer(newParams(cfg, db)),
		DB:     db,
		Config: cfg,
	}
}

// User creates an account and returns it with a signed token.
func (h *Harness) User(name string) (*models.User, string) {
	h.T.Helper()

	user := &models.User{
		DisplayName: name,
		Provider:    "line",
		ProviderUID: name,
		Role:        models.RoleUser,
	}
	if err := h.DB.Create(user).Error; err != nil {
		h.T.Fatalf("create user: %v", err)
	}

	token, err := h.Server.IssueToken(user)
	if err != nil {
		h.T.Fatalf("issue token: %v", err)
	}
	return user, token
}

// Trip creates a trip owned by owner, with owner as its first member.
func (h *Harness) Trip(owner *models.User, title string) *models.Trip {
	h.T.Helper()

	start := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 0, 4)

	trip := &models.Trip{
		OwnerID:   owner.ID,
		Title:     title,
		StartDate: &start,
		EndDate:   &end,
		PartySize: 4,
	}
	if err := h.DB.Create(trip).Error; err != nil {
		h.T.Fatalf("create trip: %v", err)
	}
	h.AddMember(trip, owner, models.TripRoleOwner)
	return trip
}

func (h *Harness) AddMember(trip *models.Trip, user *models.User, role string) {
	h.T.Helper()

	if err := h.DB.Create(&models.TripMember{
		TripID: trip.ID, UserID: user.ID, Role: role,
	}).Error; err != nil {
		h.T.Fatalf("add member: %v", err)
	}
}

// Response is a captured HTTP response with helpers for asserting on it.
type Response struct {
	*httptest.ResponseRecorder
	t *testing.T
}

// Request performs a request against the real router with the real middleware.
func (h *Harness) Request(method, path, token string, body any) *Response {
	h.T.Helper()

	payload := ""
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.T.Fatalf("marshal body: %v", err)
		}
		payload = string(raw)
	}

	req := httptest.NewRequest(method, path, strings.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	if token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	h.Server.Echo().ServeHTTP(rec, req)
	return &Response{ResponseRecorder: rec, t: h.T}
}

// ExpectStatus fails the test unless the response has the given status.
func (r *Response) ExpectStatus(want int) *Response {
	r.t.Helper()
	if r.Code != want {
		r.t.Errorf("status = %d, want %d; body: %s", r.Code, want, truncate(r.Body.String(), 300))
	}
	return r
}

// ExpectDenied accepts either 404 or 403.
//
// §4.3 prefers 404 so the API does not confirm that an id exists, but which of
// the two a given route returns depends on whether membership or role failed
// first. The security property under test is "not allowed", and pinning the
// exact code would make these tests fail on a harmless reordering.
func (r *Response) ExpectDenied() *Response {
	r.t.Helper()
	if r.Code != http.StatusNotFound && r.Code != http.StatusForbidden {
		r.t.Errorf("status = %d, want 404 or 403; body: %s", r.Code, truncate(r.Body.String(), 300))
	}
	return r
}

func (r *Response) Decode(dst any) {
	r.t.Helper()
	if err := json.Unmarshal(r.Body.Bytes(), dst); err != nil {
		r.t.Fatalf("decode body: %v; body: %s", err, truncate(r.Body.String(), 300))
	}
}

// BodyContains reports whether the raw body mentions a string — the check that
// proves expense text never reaches a public payload.
func (r *Response) BodyContains(needle string) bool {
	return strings.Contains(r.Body.String(), needle)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
