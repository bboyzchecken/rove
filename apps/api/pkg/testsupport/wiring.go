package testsupport

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/affiliate"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/email"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/export"
	fxsvc "github.com/bboyzchecken/rove/apps/api/pkg/services/fx"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/jobs"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/places"
	prepsvc "github.com/bboyzchecken/rove/apps/api/pkg/services/prep"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/storage"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
	activitystore "github.com/bboyzchecken/rove/apps/api/pkg/store/activity"
	aijobstore "github.com/bboyzchecken/rove/apps/api/pkg/store/aijob"
	bookingstore "github.com/bboyzchecken/rove/apps/api/pkg/store/booking"
	characterstore "github.com/bboyzchecken/rove/apps/api/pkg/store/character"
	commentstore "github.com/bboyzchecken/rove/apps/api/pkg/store/comment"
	dreamstore "github.com/bboyzchecken/rove/apps/api/pkg/store/dream"
	expensestore "github.com/bboyzchecken/rove/apps/api/pkg/store/expense"
	flightstore "github.com/bboyzchecken/rove/apps/api/pkg/store/flight"
	invitestore "github.com/bboyzchecken/rove/apps/api/pkg/store/invite"
	itemstore "github.com/bboyzchecken/rove/apps/api/pkg/store/item"
	memberstore "github.com/bboyzchecken/rove/apps/api/pkg/store/member"
	planstore "github.com/bboyzchecken/rove/apps/api/pkg/store/plan"
	poistore "github.com/bboyzchecken/rove/apps/api/pkg/store/poi"
	pointsstore "github.com/bboyzchecken/rove/apps/api/pkg/store/points"
	prepstore "github.com/bboyzchecken/rove/apps/api/pkg/store/prep"
	profilestore "github.com/bboyzchecken/rove/apps/api/pkg/store/profile"
	tripstore "github.com/bboyzchecken/rove/apps/api/pkg/store/trip"
	userstore "github.com/bboyzchecken/rove/apps/api/pkg/store/user"
	wishliststore "github.com/bboyzchecken/rove/apps/api/pkg/store/wishlist"
)

// allModels drives AutoMigrate. Adding a table means adding it here, or its
// routes silently fail in tests with "no such table".
var allModels = []any{
	&models.User{}, &models.Trip{}, &models.TripMember{}, &models.POI{},
	&models.Character{}, &models.UserPoints{}, &models.PointsTransaction{},
	&models.DreamItem{}, &models.TripInvite{}, &models.TripFlight{},
	&models.MemberProfile{}, &models.WishlistItem{}, &models.ActivityLog{},
	&models.Plan{}, &models.Day{}, &models.Item{}, &models.ItemVersion{},
	&models.Rationale{}, &models.AIJob{}, &models.ExpenseEntry{},
	&models.PrepBlock{}, &models.Comment{}, &models.Vote{},
	&models.AffiliatePartner{}, &models.BookingClick{},
	&models.BookingConfirmation{}, &models.PlanClone{},
	&models.DistanceCache{}, &models.WeatherCache{}, &models.FXCache{},
}

var allTables = []string{
	"fx_cache", "weather_cache", "distance_cache", "plan_clones",
	"booking_confirmations", "booking_clicks", "affiliate_partners",
	"votes", "comments", "prep_blocks", "expense_entries", "ai_jobs",
	"rationales", "item_versions", "items", "days", "plans",
	"activity_logs", "wishlist_items", "member_profiles", "trip_flights",
	"trip_invites", "dream_items", "points_transactions", "user_points",
	"characters", "pois", "trip_members", "trips", "users",
}

// newParams wires the real stores against the test DB, and stubs everything
// that would otherwise reach the network. The handlers and the middleware are
// the production ones — that is the whole point.
func newParams(cfg core.Config, db *gorm.DB) handlers.ServerParams {
	bookings := bookingstore.New(db)

	return handlers.ServerParams{
		Config: cfg,
		DB:     db,
		// Redis is only reached through Cache and Hub, both stubbed below.
		Redis: &redis.Client{},
		Cache: nil,

		Users:      userstore.New(db),
		Trips:      tripstore.New(db),
		Members:    memberstore.New(db),
		POIs:       poistore.New(db),
		Characters: characterstore.New(db),
		Points:     pointsstore.New(db),
		Dreams:     dreamstore.New(db),
		Invites:    invitestore.New(db),
		Flights:    flightstore.New(db),
		Profiles:   profilestore.New(db),
		Wishlists:  wishliststore.New(db),
		Plans:      planstore.New(db),
		Items:      itemstore.New(db),
		Expenses:   expensestore.New(db),
		Comments:   commentstore.New(db),
		Votes:      commentstore.NewVotes(db),
		Activities: activitystore.New(db),
		Preps:      prepstore.New(db),
		AIJobs:     aijobstore.New(db),
		Bookings:   bookings,

		Hub:       stubHub{},
		FX:        stubFX{},
		Places:    places.New(cfg, nil),
		Affiliate: affiliate.New(cfg, bookings),
		AI:        stubPipeline{},
		Prep:      prepsvc.New(stubWeather{}),
		Export:    export.New(cfg, storage.New(cfg)),
		Email:     email.New(cfg),
		AITools:   ai.NewTools(poistore.New(db), places.New(cfg, nil), stubWeather{}, stubFX{}),
	}
}

// --- stubs ------------------------------------------------------------------
//
// Each one returns the "not available" answer its real counterpart returns when
// unconfigured, so tests exercise the same degraded paths production would.

type stubHub struct{}

func (stubHub) Publish(context.Context, string, events.Event) error { return nil }
func (stubHub) Subscribe(context.Context, string) (<-chan events.Event, func(), error) {
	ch := make(chan events.Event)
	return ch, func() { close(ch) }, nil
}

type stubFX struct{}

// A fixed rate keeps money assertions exact.
func (stubFX) Rate(context.Context, string, string) (float64, error) { return 0.23, nil }
func (stubFX) Quote(_ context.Context, from, to string) (fxsvc.Quote, error) {
	return fxsvc.Quote{
		Pair:      from + "_" + to,
		Rate:      0.23,
		FetchedAt: time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
	}, nil
}

type stubWeather struct{}

func (stubWeather) Daily(context.Context, float64, float64, time.Time, time.Time) ([]weather.Forecast, error) {
	return nil, weather.ErrTooFarAhead
}

type stubPipeline struct{}

func (stubPipeline) Enqueue(context.Context, string, string, string, string, any) (string, error) {
	return "", ai.ErrNotConfigured
}
func (stubPipeline) Run(context.Context, jobs.Job) error { return nil }
func (stubPipeline) ParseTicket(context.Context, string) (*ai.ParsedTicket, error) {
	return nil, ai.ErrNotConfigured
}
