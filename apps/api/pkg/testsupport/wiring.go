// Package testsupport builds a real server against an in-memory database so
// the authorization rules can be tested end to end.
//
// It complements pkg/handlers/api/routes_test.go rather than replacing it.
// That one walks the route table and proves no endpoint is registered on the
// wrong group — structural, no database. This one runs real requests as real
// users and proves the middleware actually keeps them apart — behavioural.
// A route can be on the right group and still leak; both checks are needed.
//
// SQLite, not MySQL: these tests are about the WHERE clauses and the
// middleware, not about MySQL's dialect, and a test that needs a container is
// a test that quietly stops being run.
package testsupport

import (
	"context"
	"time"

	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/affiliate"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/airports"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/notify"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/places"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/storage"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
	aijobstore "github.com/bboyzchecken/rove/apps/api/pkg/store/aijob"
	billingstore "github.com/bboyzchecken/rove/apps/api/pkg/store/billing"
	bookingstore "github.com/bboyzchecken/rove/apps/api/pkg/store/booking"
	characterstore "github.com/bboyzchecken/rove/apps/api/pkg/store/character"
	collabstore "github.com/bboyzchecken/rove/apps/api/pkg/store/collab"
	communitystore "github.com/bboyzchecken/rove/apps/api/pkg/store/community"
	datestore "github.com/bboyzchecken/rove/apps/api/pkg/store/dates"
	expensestore "github.com/bboyzchecken/rove/apps/api/pkg/store/expense"
	flightstore "github.com/bboyzchecken/rove/apps/api/pkg/store/flight"
	invitestore "github.com/bboyzchecken/rove/apps/api/pkg/store/invite"
	mediastore "github.com/bboyzchecken/rove/apps/api/pkg/store/media"
	memberstore "github.com/bboyzchecken/rove/apps/api/pkg/store/member"
	planstore "github.com/bboyzchecken/rove/apps/api/pkg/store/plan"
	poistore "github.com/bboyzchecken/rove/apps/api/pkg/store/poi"
	pointsstore "github.com/bboyzchecken/rove/apps/api/pkg/store/points"
	prepstore "github.com/bboyzchecken/rove/apps/api/pkg/store/prep"
	tripstore "github.com/bboyzchecken/rove/apps/api/pkg/store/trip"
	userstore "github.com/bboyzchecken/rove/apps/api/pkg/store/user"
	wishliststore "github.com/bboyzchecken/rove/apps/api/pkg/store/wishlist"
)

// allModels drives AutoMigrate. Adding a table means adding it here, or its
// routes fail in tests with "no such table" rather than with the error they
// would actually produce.
var allModels = []any{
	&models.User{}, &models.Trip{}, &models.TripMember{}, &models.POI{},
	&models.Character{}, &models.UserPoints{}, &models.DreamItem{},
	&models.Invite{}, &models.Availability{}, &models.AvailabilitySubmission{},
	&models.WishlistItem{}, &models.Plan{}, &models.PlanDay{}, &models.PlanItem{},
	&models.ItemVersion{}, &models.ExpenseEntry{}, &models.Settlement{},
	&models.PrepTask{}, &models.PrepNote{}, &models.Booking{}, &models.BookingClick{},
	&models.Comment{}, &models.Vote{}, &models.Activity{},
	&models.AIJob{}, &models.AICredit{}, &models.TripFlight{},
	&models.Order{}, &models.Subscription{}, &models.MemberProfile{},
	&models.PlanVariant{}, &models.TripPhoto{}, &models.TripDocument{},
	&models.Notification{}, &models.Poll{},
}

// allTables is the drop order — children before parents.
var allTables = []string{
	"polls", "notifications", "trip_documents", "trip_photos",
	"plan_variants", "member_profiles",
	"orders", "subscriptions",
	"ai_credits", "ai_jobs", "activity_logs", "votes", "comments",
	"booking_clicks", "bookings", "trip_flights", "prep_notes", "prep_tasks",
	"expense_settlements", "expense_entries", "item_versions", "plan_items",
	"plan_days", "plans", "wishlist_items", "trip_availability_submissions",
	"trip_availability", "invites", "dream_items", "user_points", "characters",
	"pois", "trip_members", "trips", "users",
}

// newParams wires the real stores against the test DB and stubs everything that
// would otherwise reach the network. The handlers and the middleware are the
// production ones — that is the whole point.
func newParams(cfg core.Config, db *gorm.DB) handlers.ServerParams {
	return handlers.ServerParams{
		Config: cfg,
		DB:     db,
		// nil on purpose: the rate limiter is documented to step aside without
		// Redis, so these tests take exactly the path a dev machine takes.
		Redis: nil,

		Users:         userstore.New(db),
		Trips:         tripstore.New(db),
		Members:       memberstore.New(db),
		POIs:          poistore.New(db),
		Characters:    characterstore.New(db),
		Points:        pointsstore.New(db),
		Invites:       invitestore.New(db),
		Dreams:        invitestore.NewDreamStore(db),
		Dates:         datestore.New(db),
		Wishlist:      wishliststore.New(db),
		Plans:         planstore.New(db),
		Expenses:      expensestore.New(db),
		Prep:          prepstore.New(db),
		Bookings:      bookingstore.New(db),
		Flights:       flightstore.New(db),
		Collab:        collabstore.New(db),
		AIJobs:        aijobstore.New(db),
		Billing:       billingstore.New(db),
		Photos:        mediastore.NewPhotoStore(db),
		Documents:     mediastore.NewDocumentStore(db),
		Notifications: communitystore.NewNotificationStore(db),
		Polls:         communitystore.NewPollStore(db),

		Hub: stubHub{},
		// The airport index is embedded data with no I/O — the real one is the
		// simplest one to run.
		Airports:  airports.New(),
		FX:        stubFX{},
		Weather:   stubWeather{},
		Affiliate: stubAffiliate{},
		Places:    stubPlaces{},
		Pipeline:  stubPipeline{},
		AIRunner:  stubRunner{},
		Storage:   storage.New(cfg),
		// No token in tests: pushes are skipped, the inbox row is still written.
		Notify: notify.New(cfg),
	}
}

// --- stubs ------------------------------------------------------------------
//
// Each returns the "not available" answer its real counterpart returns when
// unconfigured, so these tests exercise the same degraded paths production
// takes when a key is missing.

type stubHub struct{}

func (stubHub) Publish(context.Context, string, events.Event) error { return nil }
func (stubHub) Subscribe(context.Context, string) (<-chan events.Event, func(), error) {
	ch := make(chan events.Event)
	return ch, func() { close(ch) }, nil
}

// A fixed rate keeps money assertions exact.
type stubFX struct{}

func (stubFX) Rate(context.Context, string, string) (float64, error) { return 0.23, nil }

type stubWeather struct{}

func (stubWeather) Daily(context.Context, float64, float64, time.Time, time.Time) ([]weather.Forecast, error) {
	return nil, nil
}

type stubAffiliate struct{}

func (stubAffiliate) BuildLink(context.Context, affiliate.LinkRequest) (string, error) {
	return "https://example.test/booking", nil
}
func (stubAffiliate) PartnersFor(context.Context, string) ([]affiliate.Partner, error) {
	return nil, nil
}
func (stubAffiliate) Offers(context.Context, string) ([]affiliate.Offer, error) { return nil, nil }

type stubPlaces struct{}

func (stubPlaces) Lookup(context.Context, string) ([]places.Place, error) { return nil, nil }
func (stubPlaces) Get(context.Context, string) (*places.Place, error)     { return nil, nil }
func (stubPlaces) Distance(context.Context, float64, float64, float64, float64, string) (*places.Route, error) {
	return nil, nil
}

type stubPipeline struct{}

func (stubPipeline) Generate(context.Context, ai.GenerateInput, ai.StepFunc) (*ai.DraftResult, error) {
	return nil, nil
}
func (stubPipeline) ParseTicket(context.Context, string) (*ai.ParsedTicket, error) {
	return nil, nil
}

type stubRunner struct{}

func (stubRunner) Enqueue(models.AIJob, ai.GenerateInput)              {}
func (stubRunner) EnqueueVariants(models.AIJob, ai.GenerateInput, int) {}
