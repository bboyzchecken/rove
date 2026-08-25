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
	"github.com/bboyzchecken/rove/apps/api/pkg/services/airports"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/email"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	fxsvc "github.com/bboyzchecken/rove/apps/api/pkg/services/fx"
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
	leadstore "github.com/bboyzchecken/rove/apps/api/pkg/store/lead"
	reviewstore "github.com/bboyzchecken/rove/apps/api/pkg/store/review"
	rewardstore "github.com/bboyzchecken/rove/apps/api/pkg/store/reward"
	prepstore "github.com/bboyzchecken/rove/apps/api/pkg/store/prep"
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
		if cfg.IsWorker() {
			log.WithField("env", cfg.Environment).Info("starting rove ai worker")
			runWorker(cfg)
			return
		}
		log.WithField("env", cfg.Environment).
			WithField("role", cfg.Role).
			Infof("starting rove api on :%s", cfg.Port)
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

	return core.Config{
		Environment:    viper.GetString("ENV"),
		Commit:         viper.GetString("COMMIT"),
		Port:           viper.GetString("PORT"),
		JwtSecret:      viper.GetString("JWT_SECRET_KEY"),
		MockMode:       viper.GetBool("MOCK_MODE"),
		AdminEmails:    splitCSV(viper.GetString("ADMIN_EMAILS")),
		AuthCookieName: viper.GetString("AUTH_COOKIE_NAME"),
		AppBaseURL:     viper.GetString("APP_BASE_URL"),
		WebBaseURL:     viper.GetString("WEB_BASE_URL"),
		OpenMeteoBase:  viper.GetString("OPEN_METEO_BASE"),

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
			ApiURL: viper.GetString("FX_API_URL"),
			ApiKey: viper.GetString("FX_API_KEY"),
		},
		Affiliate: map[string]string{
			"agoda":      viper.GetString("AFFILIATE_AGODA_ID"),
			"booking":    viper.GetString("AFFILIATE_BOOKING_AID"),
			"klook":      viper.GetString("AFFILIATE_KLOOK_AID"),
			"kkday":      viper.GetString("AFFILIATE_KKDAY_ID"),
			"rentalcars": viper.GetString("AFFILIATE_RENTALCARS_ID"),
			"airalo":     viper.GetString("AFFILIATE_AIRALO_ID"),
		},
		AffiliateWebhookSecret: viper.GetString("AFFILIATE_WEBHOOK_SECRET"),

		Role: orString(viper.GetString("ROVE_ROLE"), ai.RoleAll),

		AgentEmail:      viper.GetString("AGENT_LEAD_EMAIL"),
		AgentLineUserID: viper.GetString("AGENT_LEAD_LINE_USER_ID"),
		AgentPartner:    orString(viper.GetString("AGENT_LEAD_PARTNER"), "rove-agent"),
	}
}

// orString is the two-line default this config file needs exactly once.
func orString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
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
		invitestore.Module,
		invitestore.DreamModule,
		datestore.Module,
		wishliststore.Module,
		planstore.Module,
		expensestore.Module,
		prepstore.Module,
		bookingstore.Module,
		flightstore.Module,
		collabstore.Module,
		aijobstore.Module,
		billingstore.Module,
		mediastore.Module,
		communitystore.Module,
		reviewstore.Module,
		rewardstore.Module,
		leadstore.Module,
	)
}

// serviceModules registers everything that talks to the outside world. Each of
// them degrades to a deterministic stand-in when MOCK_MODE is on or its key is
// missing, which is what lets UAT run the real API against a real database
// without a single third-party account.
func serviceModules() fx.Option {
	return fx.Options(
		events.Module,
		fxsvc.Module,
		airports.Module,
		weather.Module,
		places.Module,
		affiliate.Module,
		storage.Module,
		notify.Module,
		email.Module,
		ai.Module,
		ai.RunnerModule,
		ai.ConsumerModule,
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
		fx.Invoke(startHTTP),
		fx.WithLogger(fxLogger),
	)
	app.Run()
}

// runWorker is the AI service without the web server (Phase 3 — INFRA).
//
// It shares the whole graph with the API — same stores, same pipeline, same
// events hub — and differs in exactly two ways: it does not listen on a port,
// and it does not migrate. Migrations belong to the process people deploy
// first, and two services racing to run them is a lock nobody needs.
func runWorker(cfg core.Config) {
	app := fx.New(
		fx.Supply(cfg),
		fx.Provide(core.NewDatabase, core.NewRedis),
		storeModules(),
		serviceModules(),
		fx.Invoke(startWorker),
		fx.WithLogger(fxLogger),
	)
	app.Run()
}

func startWorker(lc fx.Lifecycle, consumer ai.Consumer) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go consumer.Run(ctx)
			return nil
		},
		OnStop: func(context.Context) error {
			// Stops the queue loop. Drafts already running keep their own
			// three-minute timeout, which is shorter than the ECS stop grace
			// period, so a deploy does not cut one in half.
			cancel()
			return nil
		},
	})
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
