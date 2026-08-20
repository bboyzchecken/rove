// Package testsupport builds a real server against an in-memory database so
// the authorization rules can be tested end to end.
//
// SQLite, not MySQL: these tests are about the WHERE clauses and the middleware,
// not about MySQL's dialect, and a test that needs a container is a test that
// stops being run. The few places the schema is MySQL-specific (FULLTEXT, JSON
// columns) are skipped here and covered by the compose smoke test in CI.
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

// New builds a server with every store wired to an in-memory database and every
// external service stubbed.
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
		Anthropic:      core.AnthropicConfig{ModelPlanner: "test-model"},
		Points:         core.PointsConfig{EarnRatePct: 30, MinRedeemBalance: 100},
	}

	server := handlers.NewServer(newParams(cfg, db))
	return &Harness{T: t, Server: server, DB: db, Config: cfg}
}

// User creates an account and returns it with a signed token.
func (h *Harness) User(name string) (*models.User, string) {
	h.T.Helper()

	user := &models.User{
		DisplayName: name,
		Provider:    models.ProviderLine,
		ProviderUID: name,
		Role:        models.RoleUser,
		Status:      models.UserStatusActive,
		Locale:      "th",
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
		OwnerID:            owner.ID,
		Title:              title,
		DestinationCountry: "JP",
		StartDate:          &start,
		EndDate:            &end,
		PartySize:          4,
		HomeCurrency:       "THB",
		DestCurrency:       "JPY",
		Visibility:         models.VisibilityPrivate,
		Status:             models.TripStatusPlanning,
		PublicHideExpense:  true,
	}
	if err := h.DB.Create(trip).Error; err != nil {
		h.T.Fatalf("create trip: %v", err)
	}
	h.AddMember(trip, owner, models.TripRoleOwner)
	return trip
}

func (h *Harness) AddMember(trip *models.Trip, user *models.User, role string) {
	h.T.Helper()

	member := &models.TripMember{
		TripID: trip.ID, UserID: user.ID, Role: role, JoinedAt: time.Now().UTC(),
	}
	if err := h.DB.Create(member).Error; err != nil {
		h.T.Fatalf("add member: %v", err)
	}
}

// Plan creates a plan with one day and one item, which is enough state for the
// item and budget routes to be exercised.
func (h *Harness) Plan(trip *models.Trip) (*models.Plan, *models.Day, *models.Item) {
	h.T.Helper()

	plan := &models.Plan{
		TripID: trip.ID, Name: "test plan", Version: 1,
		CreatedBy: models.CreatedByUser, Status: models.PlanStatusReady,
	}
	if err := h.DB.Create(plan).Error; err != nil {
		h.T.Fatalf("create plan: %v", err)
	}

	day := &models.Day{PlanID: plan.ID, Date: *trip.StartDate, DayIndex: 0}
	if err := h.DB.Create(day).Error; err != nil {
		h.T.Fatalf("create day: %v", err)
	}

	item := &models.Item{
		PlanID: plan.ID, DayID: day.ID, Title: "test item",
		Type: models.ItemTypePlace, CostCurrency: "JPY",
		CostBasis: models.CostBasisPerPerson, CostStatus: models.CostStatusEstimate,
		BookingStatus: models.BookingStatusNone, Verified: models.VerifiedNo,
	}
	if err := h.DB.Create(item).Error; err != nil {
		h.T.Fatalf("create item: %v", err)
	}
	return plan, day, item
}

// Expense creates a spending row, used to prove it never leaves the trip.
func (h *Harness) Expense(trip *models.Trip, payer *models.User, title string) *models.ExpenseEntry {
	h.T.Helper()

	rate := 0.23
	entry := &models.ExpenseEntry{
		TripID: trip.ID, PaidByUserID: payer.ID, Title: title,
		Amount: 5000, Currency: "JPY", Category: models.ExpenseFood,
		SplitType: models.SplitShared, FxRateSnapshot: &rate,
	}
	if err := h.DB.Create(entry).Error; err != nil {
		h.T.Fatalf("create expense: %v", err)
	}
	return entry
}

// Response is a captured HTTP response with helpers for asserting on it.
type Response struct {
	*httptest.ResponseRecorder
	t *testing.T
}

// Request performs a request against the real router with the real middleware.
func (h *Harness) Request(method, path, token string, body any) *Response {
	h.T.Helper()

	var reader *strings.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.T.Fatalf("marshal body: %v", err)
		}
		reader = strings.NewReader(string(raw))
	} else {
		reader = strings.NewReader("")
	}

	req := httptest.NewRequest(method, path, reader)
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

// ExpectNotFound covers the deliberate choice in §4.3: a caller who is not a
// member is told "not found", never "forbidden", so the API does not confirm
// that an id exists.
func (r *Response) ExpectNotFound() *Response {
	return r.ExpectStatus(http.StatusNotFound)
}

// Decode unmarshals the response body.
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
