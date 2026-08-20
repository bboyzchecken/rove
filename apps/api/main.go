package main

import (
	"context"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
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
)

func main() {
	// Local runs read the monorepo root .env; under docker compose the same
	// values arrive as real environment variables and this is a no-op.
	_ = godotenv.Load("../../.env", ".env")
	viper.AutomaticEnv()

	cfg := loadConfig()
	log := logger.Init(cfg.Environment)

	switch command() {
	case "up":
		runMigrate(cfg)
	case "seed":
		runSeed(cfg)
	default:
		log.WithField("env", cfg.Environment).Infof("starting rove api on :%s", cfg.Port)
		runServer(cfg)
	}
}

func command() string {
	if len(os.Args) > 1 {
		return os.Args[1]
	}
	return ""
}

func loadConfig() core.Config {
	viper.SetDefault("PORT", "5000")
	viper.SetDefault("ENV", "development")
	viper.SetDefault("MYSQL_PORT", "3306")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("AI_MAX_TOKENS", 8000)
	viper.SetDefault("AUTH_COOKIE_NAME", "rove_token")
	viper.SetDefault("OPEN_METEO_BASE", "https://api.open-meteo.com")
	viper.SetDefault("FX_CACHE_TTL_HOURS", 24)
	viper.SetDefault("POINTS_EARN_RATE_PCT", 30)
	viper.SetDefault("POINTS_MIN_REDEEM", 100)
	viper.SetDefault("EMAIL_FROM", "ROVE <no-reply@rove.app>")

	return core.Config{
		Environment:    viper.GetString("ENV"),
		Commit:         viper.GetString("COMMIT"),
		Port:           viper.GetString("PORT"),
		JwtSecret:      viper.GetString("JWT_SECRET_KEY"),
		AdminEmails:    splitCSV(viper.GetString("ADMIN_EMAILS")),
		WebhookSecret:  viper.GetString("WEBHOOK_SECRET"),
		AuthCookieName: viper.GetString("AUTH_COOKIE_NAME"),
		AppBaseURL:     viper.GetString("APP_BASE_URL"),
		WebBaseURL:     viper.GetString("WEB_BASE_URL"),
		OpenMeteoBase:  viper.GetString("OPEN_METEO_BASE"),
		GotenbergURL:   viper.GetString("GOTENBERG_URL"),

		MySQL: core.MySQLConfig{
			Host:     viper.GetString("MYSQL_HOST"),
			Port:     viper.GetString("MYSQL_PORT"),
			Username: viper.GetString("MYSQL_USERNAME"),
			Password: viper.GetString("MYSQL_PASSWORD"),
			Database: viper.GetString("MYSQL_DATABASE"),
		},
		Redis: core.RedisConfig{
			Host:     viper.GetString("REDIS_HOST"),
			Port:     viper.GetString("REDIS_PORT"),
			Password: viper.GetString("REDIS_PASSWORD"),
		},
		R2: core.R2Config{
			Endpoint:       viper.GetString("R2_ENDPOINT"),
			Region:         viper.GetString("R2_REGION"),
			AccessKey:      viper.GetString("R2_ACCESS_KEY"),
			SecretKey:      viper.GetString("R2_SECRET_KEY"),
			ExportBucket:   viper.GetString("R2_EXPORT_BUCKET"),
			ImageBucket:    viper.GetString("R2_IMAGE_BUCKET"),
			DocumentBucket: viper.GetString("R2_DOCUMENT_BUCKET"),
			PhotoBucket:    viper.GetString("R2_PHOTO_BUCKET"),
		},
		Anthropic: core.AnthropicConfig{
			ApiKey:          viper.GetString("ANTHROPIC_API_KEY"),
			ModelPlanner:    viper.GetString("AI_MODEL_PLANNER"),
			ModelFast:       viper.GetString("AI_MODEL_FAST"),
			MaxTokens:       viper.GetInt("AI_MAX_TOKENS"),
			DailyCostCapUSD: viper.GetFloat64("AI_DAILY_COST_CAP_USD"),
		},
		Google: core.GoogleConfig{
			MapsServerKey:     viper.GetString("GOOGLE_MAPS_SERVER_KEY"),
			OAuthClientID:     viper.GetString("GOOGLE_OAUTH_CLIENT_ID"),
			OAuthClientSecret: viper.GetString("GOOGLE_OAUTH_CLIENT_SECRET"),
		},
		Line: core.LineConfig{
			LoginChannelID:     viper.GetString("LINE_LOGIN_CHANNEL_ID"),
			LoginChannelSecret: viper.GetString("LINE_LOGIN_CHANNEL_SECRET"),
			MessagingToken:     viper.GetString("LINE_MESSAGING_TOKEN"),
		},
		FX: core.FXConfig{
			ApiURL:        viper.GetString("FX_API_URL"),
			ApiKey:        viper.GetString("FX_API_KEY"),
			CacheTTLHours: viper.GetInt("FX_CACHE_TTL_HOURS"),
		},
		Email: core.EmailConfig{
			ResendAPIKey: viper.GetString("RESEND_API_KEY"),
			From:         viper.GetString("EMAIL_FROM"),
		},
		Points: core.PointsConfig{
			EarnRatePct:      viper.GetFloat64("POINTS_EARN_RATE_PCT"),
			MinRedeemBalance: viper.GetFloat64("POINTS_MIN_REDEEM"),
		},
		Affiliate: map[string]string{
			"agoda":      viper.GetString("AFFILIATE_AGODA_ID"),
			"booking":    viper.GetString("AFFILIATE_BOOKING_AID"),
			"klook":      viper.GetString("AFFILIATE_KLOOK_AID"),
			"kkday":      viper.GetString("AFFILIATE_KKDAY_ID"),
			"rentalcars": viper.GetString("AFFILIATE_RENTALCARS_ID"),
			"airalo":     viper.GetString("AFFILIATE_AIRALO_ID"),
		},
	}
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// storeModules is the one place a new store gets registered.
func storeModules() fx.Option {
	return fx.Options(
		userstore.Module,
		tripstore.Module,
		memberstore.Module,
		poistore.Module,
		characterstore.Module,
		pointsstore.Module,
		dreamstore.Module,
		invitestore.Module,
		flightstore.Module,
		profilestore.Module,
		wishliststore.Module,
		planstore.Module,
		itemstore.Module,
		expensestore.Module,
		commentstore.Module,
		activitystore.Module,
		prepstore.Module,
		aijobstore.Module,
		bookingstore.Module,
	)
}

// serviceModules holds everything that talks to the outside world. Each one is
// behind an interface so the pipeline and the handlers stay testable (§6.2).
func serviceModules() fx.Option {
	return fx.Options(
		cache.Module,
		events.Module,
		jobs.Module,
		fxsvc.Module,
		weather.Module,
		places.Module,
		storage.Module,
		affiliate.Module,
		email.Module,
		prepsvc.Module,
		export.Module,
		ai.Module,
	)
}

func runServer(cfg core.Config) {
	app := fx.New(
		fx.Supply(cfg),
		fx.Provide(core.NewDatabase, core.NewRedis),
		storeModules(),
		serviceModules(),
		handlers.Module,
		fx.Invoke(migrateOnBoot),
		// The AI worker runs in this process in Phase 1; splitting it into its
		// own binary means calling StartWorker from there instead (§2.2).
		fx.Invoke(ai.StartWorker),
		fx.Invoke(startHTTP),
		fx.WithLogger(fxLogger),
	)
	app.Run()
}

// migrateOnBoot keeps a fresh environment one command away from working; the
// same migrations are runnable standalone via `go run . up`.
func migrateOnBoot(db *gorm.DB) error {
	if err := core.Migrate(db); err != nil {
		return err
	}
	logger.L().Info("migrations up to date")
	return nil
}

func startHTTP(lc fx.Lifecycle, s *handlers.Server) {
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				if err := s.Start(); err != nil {
					logger.L().WithError(err).Info("http server stopped")
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			return s.Shutdown(ctx)
		},
	})
}

func runMigrate(cfg core.Config) {
	db, err := core.NewDatabase(cfg)
	if err != nil {
		logger.L().WithError(err).Fatal("connect mysql")
	}
	if err := core.Migrate(db); err != nil {
		logger.L().WithError(err).Fatal("migrate")
	}
	logger.L().Info("migrations complete")
}
