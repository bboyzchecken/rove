// Package api wires every HTTP route. Handlers here only bind, validate, call a
// store or service, and map the result to a response DTO — business logic lives
// in pkg/domain (DEV_SPEC §6.2).
package api

import (
	"context"
	"net/http"
	"time"

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
	"github.com/bboyzchecken/rove/apps/api/pkg/services/cache"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/email"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/export"
	fxsvc "github.com/bboyzchecken/rove/apps/api/pkg/services/fx"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/places"
	prepsvc "github.com/bboyzchecken/rove/apps/api/pkg/services/prep"
	customvalidator "github.com/bboyzchecken/rove/apps/api/pkg/utils/validator"
)

// ServerParams is the FX injection point. New stores and services are added
// here as their tasks land — nothing else in the graph needs to change.
type ServerParams struct {
	fx.In

	Config core.Config
	DB     *gorm.DB
	Redis  *redis.Client
	Cache  *cache.Cache

	Users      models.UserStore
	Trips      models.TripStore
	Members    models.TripMemberStore
	POIs       models.POIStore
	Characters models.CharacterStore
	Points     models.PointsStore
	Dreams     models.DreamStore
	Invites    models.InviteStore
	Flights    models.FlightStore
	Profiles   models.ProfileStore
	Wishlists  models.WishlistStore
	Plans      models.PlanStore
	Items      models.ItemStore
	Expenses   models.ExpenseStore
	Comments   models.CommentStore
	Votes      models.VoteStore
	Activities models.ActivityStore
	Preps      models.PrepStore
	AIJobs     models.AIJobStore
	Bookings   models.BookingStore

	Hub       events.Hub
	FX        fxsvc.Service
	Places    places.Service
	Affiliate affiliate.Service
	AI        ai.Pipeline
	AITools   *ai.Tools
	Prep      prepsvc.Service
	Export    export.Service
	Email     email.Service
}

type Server struct {
	e     *echo.Echo
	cfg   core.Config
	db    *gorm.DB
	redis *redis.Client
	cache *cache.Cache

	users      models.UserStore
	trips      models.TripStore
	members    models.TripMemberStore
	pois       models.POIStore
	characters models.CharacterStore
	points     models.PointsStore
	dreams     models.DreamStore
	invites    models.InviteStore
	flights    models.FlightStore
	profiles   models.ProfileStore
	wishlists  models.WishlistStore
	plans      models.PlanStore
	items      models.ItemStore
	expenses   models.ExpenseStore
	comments   models.CommentStore
	votes      models.VoteStore
	activities models.ActivityStore
	preps      models.PrepStore
	aiJobs     models.AIJobStore
	bookings   models.BookingStore

	hub       events.Hub
	fx        fxsvc.Service
	places    places.Service
	affiliate affiliate.Service
	ai        ai.Pipeline
	aiTools   *ai.Tools
	prep      prepsvc.Service
	export    export.Service
	email     email.Service

	cookieName string
}

func NewServer(p ServerParams) *Server {
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = httpErrorHandler
	e.Validator = customvalidator.New()

	s := &Server{
		e: e, cfg: p.Config, db: p.DB, redis: p.Redis, cache: p.Cache,
		users: p.Users, trips: p.Trips, members: p.Members, pois: p.POIs,
		characters: p.Characters, points: p.Points, dreams: p.Dreams,
		invites: p.Invites, flights: p.Flights, profiles: p.Profiles,
		wishlists: p.Wishlists, plans: p.Plans, items: p.Items,
		expenses: p.Expenses, comments: p.Comments, votes: p.Votes,
		activities: p.Activities, preps: p.Preps, aiJobs: p.AIJobs,
		bookings: p.Bookings,
		hub:      p.Hub, fx: p.FX, places: p.Places, affiliate: p.Affiliate,
		ai: p.AI, aiTools: p.AITools, prep: p.Prep, export: p.Export, email: p.Email,
		cookieName: p.Config.AuthCookieName,
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
	s.e.Use(middleware.BodyLimit("2M"))
	// A blanket per-IP limit under everything; specific endpoints add their own
	// tighter limits (AI, invite accept, POI search).
	s.e.Use(s.RateLimit(RateLimitConfig{Key: "global", Limit: 600, Window: time.Minute}))
}

// registerRoutes is the map of the whole API. Each register* method lives in
// its own <domain>.handler.go file.
func (s *Server) registerRoutes() {
	// --- ops (no auth) -------------------------------------------------------
	s.e.GET("/healthz", s.handleHealthz)
	s.e.GET("/readyz", s.handleReadyz)

	// --- unauthenticated, outside /api/v1 -----------------------------------
	// The affiliate redirect has to be a short, clean URL a user can see in the
	// status bar, and the webhook URL is registered with each partner.
	s.e.GET("/go/:trackingId", s.handleAffiliateRedirect)
	s.e.POST("/webhooks/affiliate/:partner", s.handleAffiliateWebhook)

	// Public plan pages are read by the Next.js server for ISR, so they sit
	// outside /api/v1 exactly as DEV_SPEC §5.11 specifies.
	public := s.e.Group("/public", s.OptionalJwt)
	s.registerPublicRoutes(public)

	v1 := s.e.Group("/api/v1")

	s.registerAuthRoutes(v1)      // A0.4 / A0.5
	s.registerUserRoutes(v1)      // A3.1 / A14.2 / A15.2 / A17.1
	s.registerCharacterRoutes(v1) // A14.2
	s.registerPOIRoutes(v1)       // A4.2 / A5.3

	// --- trip-scoped ---------------------------------------------------------
	// Every route below carries :tripId and is guarded by TripRoleMiddleware.
	trips := v1.Group("/trips", s.JwtMiddleware)
	s.registerTripRoutes(v1, trips)          // A1.1 / A2.1
	s.registerMemberRoutes(v1, trips)        // A2.2 / A2.3
	s.registerWishlistRoutes(trips)          // A3.2 / A3.4
	s.registerPlanRoutes(v1, trips)          // A4.x / A5.x
	s.registerItemRoutes(v1)                 // A5.x
	s.registerBudgetRoutes(v1)               // A7.x
	s.registerExpenseRoutes(v1, trips)       // A16.x
	s.registerPrepRoutes(v1, trips)          // A8.x
	s.registerCollaborationRoutes(v1, trips) // A9.x
	s.registerAIRoutes(v1, trips)            // A4.x
	s.registerBookingRoutes(v1, trips)       // A12.x
	s.registerExportRoutes(v1, trips)        // A10.x
	s.registerEventRoutes(trips)             // A2.5 — SSE

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
