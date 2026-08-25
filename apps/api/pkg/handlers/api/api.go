// Package api wires every HTTP route. Handlers here only bind, validate, call a
// store or service, and map the result to a response DTO — business logic lives
// in pkg/domain (DEV_SPEC §6.2).
package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
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
	customvalidator "github.com/bboyzchecken/rove/apps/api/pkg/utils/validator"
)

// ServerParams is the FX injection point. New stores and services are added
// here as their tasks land — nothing else in the graph needs to change.
type ServerParams struct {
	fx.In

	Config core.Config
	DB     *gorm.DB
	Redis  *redis.Client

	Users         models.UserStore
	Trips         models.TripStore
	Members       models.TripMemberStore
	POIs          models.POIStore
	Characters    models.CharacterStore
	Points        models.PointsStore
	Invites       models.InviteStore
	Dreams        models.DreamStore
	Dates         models.DateStore
	Wishlist      models.WishlistStore
	Plans         models.PlanStore
	Expenses      models.ExpenseStore
	Prep          models.PrepStore
	Bookings      models.BookingStore
	Flights       models.FlightStore
	Collab        models.CollabStore
	AIJobs        models.AIJobStore
	Billing       models.BillingStore
	Photos        models.PhotoStore
	Documents     models.DocumentStore
	Notifications models.NotificationStore
	Polls         models.PollStore
	Reviews       models.ReviewStore
	Discounts     models.DiscountStore
	Earnings      models.EarningStore
	Payouts       models.PayoutStore
	Leads         models.LeadStore

	Hub       events.Hub
	FX        fxsvc.Service
	Airports  airports.Service
	Weather   weather.Service
	Affiliate affiliate.Service
	Places    places.Service
	Pipeline  ai.Pipeline
	AIRunner  ai.Runner
	Storage   storage.Service
	Notify    notify.Service
	Email     email.Service
}

type Server struct {
	e     *echo.Echo
	cfg   core.Config
	db    *gorm.DB
	redis *redis.Client

	users         models.UserStore
	trips         models.TripStore
	members       models.TripMemberStore
	pois          models.POIStore
	characters    models.CharacterStore
	points        models.PointsStore
	invites       models.InviteStore
	dreams        models.DreamStore
	dates         models.DateStore
	wishlist      models.WishlistStore
	plans         models.PlanStore
	expenses      models.ExpenseStore
	prep          models.PrepStore
	bookings      models.BookingStore
	flights       models.FlightStore
	collab        models.CollabStore
	aiJobs        models.AIJobStore
	billing       models.BillingStore
	photos        models.PhotoStore
	documents     models.DocumentStore
	notifications models.NotificationStore
	polls         models.PollStore
	reviews       models.ReviewStore
	discounts     models.DiscountStore
	earnings      models.EarningStore
	payouts       models.PayoutStore
	leads         models.LeadStore

	hub       events.Hub
	fx        fxsvc.Service
	airports  airports.Service
	weather   weather.Service
	affiliate affiliate.Service
	places    places.Service
	pipeline  ai.Pipeline
	aiRunner  ai.Runner
	storage   storage.Service
	notify    notify.Service
	email     email.Service

	cookieName string
}

func NewServer(p ServerParams) *Server {
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = httpErrorHandler
	e.Validator = customvalidator.New()

	s := &Server{
		e:             e,
		cfg:           p.Config,
		db:            p.DB,
		redis:         p.Redis,
		users:         p.Users,
		trips:         p.Trips,
		members:       p.Members,
		pois:          p.POIs,
		characters:    p.Characters,
		points:        p.Points,
		invites:       p.Invites,
		dreams:        p.Dreams,
		dates:         p.Dates,
		wishlist:      p.Wishlist,
		plans:         p.Plans,
		expenses:      p.Expenses,
		prep:          p.Prep,
		bookings:      p.Bookings,
		flights:       p.Flights,
		collab:        p.Collab,
		aiJobs:        p.AIJobs,
		billing:       p.Billing,
		photos:        p.Photos,
		documents:     p.Documents,
		notifications: p.Notifications,
		polls:         p.Polls,
		reviews:       p.Reviews,
		discounts:     p.Discounts,
		earnings:      p.Earnings,
		payouts:       p.Payouts,
		leads:         p.Leads,
		hub:           p.Hub,
		fx:            p.FX,
		airports:      p.Airports,
		weather:       p.Weather,
		affiliate:     p.Affiliate,
		places:        p.Places,
		pipeline:      p.Pipeline,
		aiRunner:      p.AIRunner,
		storage:       p.Storage,
		notify:        p.Notify,
		email:         p.Email,
		cookieName:    p.Config.AuthCookieName,
	}

	s.setupMiddleware()
	s.registerRoutes()
	return s
}

func (s *Server) setupMiddleware() {
	s.e.Use(middleware.Recover())
	s.e.Use(middleware.RequestID())
	s.e.Use(middleware.Secure())
	s.e.Use(logger.RequestLogger())
	s.e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		// Only the web app may call this API from a browser.
		AllowOrigins:     []string{s.cfg.WebBaseURL},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
		AllowCredentials: true,
		MaxAge:           600,
	}))
	// Nothing in front of this compresses: an ALB forwards the body untouched,
	// unlike a CDN. A trip room's plan payload is a few hundred kilobytes of
	// JSON that gzips to a fraction of that, and the audience is on a phone.
	s.e.Use(middleware.GzipWithConfig(middleware.GzipConfig{
		Level: 5,
		// Below this the header overhead costs more than the saving.
		MinLength: 1024,
		Skipper:   skipCompression,
	}))
	// 8M: a ticket PDF is a few megabytes; photos arrive browser-resized and
	// far smaller. Anything bigger than this is a mistake, not a document.
	s.e.Use(middleware.BodyLimit("8M"))
	s.e.Use(s.RateLimit())
}

// skipCompression leaves alone the responses where gzip either cannot help or
// would actively hurt: the SSE stream (frames must leave the moment they are
// written, and buffering them is the one thing that breaks realtime), the
// health probes an ALB hits every 15s, and bytes that arrive compressed
// already.
func skipCompression(c echo.Context) bool {
	path := c.Path()
	switch path {
	case "/healthz", "/readyz":
		return true
	}
	if strings.HasSuffix(path, "/events") {
		return true
	}
	return strings.HasPrefix(path, "/uploads")
}

// registerRoutes is the map of the whole API. Each register* method lives in
// its own <domain>.handler.go file.
func (s *Server) registerRoutes() {
	// --- ops (no auth) -------------------------------------------------------
	s.e.GET("/healthz", s.handleHealthz)
	s.e.GET("/readyz", s.handleReadyz)
	// Affiliate redirect. Deliberately outside /api/v1: it is a link people
	// click, not an endpoint the app calls (A12.2).
	s.e.GET("/go/:clickId", s.handleAffiliateRedirect)
	// Partner postback (A12.6) — shared-secret guarded; 404 until configured.
	s.e.POST("/webhooks/affiliate/:partner", s.handleAffiliateWebhook)
	// Local-disk storage serves its own files in dev; R2 serves them itself.
	if s.storage != nil && !s.storage.Configured() {
		s.e.Static("/uploads", "uploads")
	}

	v1 := s.e.Group("/api/v1")

	s.registerModeRoutes(v1)     // which providers are real — see mode.handler.go
	s.registerAuthRoutes(v1)     // A0.4 / A0.5
	s.registerUserRoutes(v1)     // A3.1 / A14 / A15 / A17
	s.registerPublicRoutes(v1)   // A10.1 — shared + public trips
	s.registerPOIRoutes(v1)      // A4.2
	s.registerAirportRoutes(v1)  // A1.3 — worldwide airport search
	s.registerAIPublicRoutes(v1) // A1.2 — reading a ticket happens before a trip

	// --- trip-scoped ---------------------------------------------------------
	// Every route below carries :tripId and is guarded by TripRoleMiddleware.
	trips := v1.Group("/trips", s.JwtMiddleware)
	s.registerTripRoutes(trips)          // A1.1 / A2.1
	s.registerFlightRoutes(trips)        // A1.3 — the route the trip is built on
	s.registerMemberRoutes(trips)        // A2.2 / A2.3
	s.registerDateRoutes(trips)          // A2.6 — date coordination
	s.registerWishlistRoutes(trips)      // A3.2
	s.registerPlanRoutes(trips)          // A4.x / A5.x
	s.registerVariantRoutes(trips)       // A6.x — variants, compare, freeze
	s.registerItemRoutes(trips)          // A5.x
	s.registerBudgetRoutes(trips)        // A7.x
	s.registerExpenseRoutes(trips)       // A16.x
	s.registerPrepRoutes(trips)          // A8.x
	s.registerCollaborationRoutes(trips) // A9.x
	s.registerAIRoutes(trips)            // A4.x
	s.registerBookingRoutes(trips)       // A12.x
	s.registerExportRoutes(trips)        // A10.x
	s.registerPhotoRoutes(trips)         // A18.x — trip photos
	s.registerDocumentRoutes(trips)      // A19.x — document folder
	s.registerCommunityRoutes(trips)     // A9.2/A9.3 — polls + presence
	s.registerReviewRoutes(trips)        // A11.5 — how it actually went
	s.registerLeadRoutes(trips)          // A12.12 — hand the trip to an agent
	s.registerEventRoutes(trips)         // A2.5 — SSE

	// --- admin ---------------------------------------------------------------
	admin := v1.Group("/admin", s.JwtMiddleware, s.IsAdmin)
	s.registerAdminRoutes(admin) // A13.x
}

// Start blocks until the HTTP server stops.
func (s *Server) Start() error {
	return s.e.Start(":" + s.cfg.Port)
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.e.Shutdown(ctx)
}

// Echo exposes the router for tests.
func (s *Server) Echo() *echo.Echo { return s.e }

var Module = fx.Module("handlers.api", fx.Provide(NewServer))
