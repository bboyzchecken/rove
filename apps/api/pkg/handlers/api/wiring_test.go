package api_test

import (
	"testing"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/affiliate"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/cache"
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
	"github.com/redis/go-redis/v9"
)

// A missing provider is not a compile error — it is a panic at boot, in
// production, after a deploy. fx.ValidateApp resolves the whole graph without
// running anything, so a forgotten module fails here instead.
func TestFXGraphResolves(t *testing.T) {
	err := fx.ValidateApp(
		fx.Supply(core.Config{Port: "0"}),
		// The two real connections are the only things stubbed; everything
		// else is the production wiring, exactly as main.go builds it.
		fx.Provide(
			func() *gorm.DB { return nil },
			func() *redis.Client { return nil },
		),
		fx.Options(
			userstore.Module, tripstore.Module, memberstore.Module, poistore.Module,
			characterstore.Module, pointsstore.Module, dreamstore.Module,
			invitestore.Module, flightstore.Module, profilestore.Module,
			wishliststore.Module, planstore.Module, itemstore.Module,
			expensestore.Module, commentstore.Module, activitystore.Module,
			prepstore.Module, aijobstore.Module, bookingstore.Module,
		),
		fx.Options(
			cache.Module, events.Module, jobs.Module, fxsvc.Module,
			weather.Module, places.Module, storage.Module, affiliate.Module,
			email.Module, prepsvc.Module, export.Module, ai.Module,
		),
		handlers.Module,
		fx.Invoke(ai.StartWorker),
		fx.Invoke(func(*handlers.Server) {}),
		fx.NopLogger,
	)
	if err != nil {
		t.Fatalf("FX graph does not resolve: %v", err)
	}
}
