// Package api wires every HTTP route. Handlers here only bind, validate, call a
// store or service, and map the result to a response DTO — business logic lives
// in pkg/domain (DEV_SPEC §6.2).
package api

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	customvalidator "github.com/bboyzchecken/rove/apps/api/pkg/utils/validator"
)

// ServerParams is the FX injection point. New stores and services are added
// here as their tasks land — nothing else in the graph needs to change.
type ServerParams struct {
	fx.In

	Config core.Config
	DB     *gorm.DB
	Redis  *redis.Client

	Users   models.UserStore
	Trips   models.TripStore
	Members models.TripMemberStore
	POIs    models.POIStore
}

type Server struct {
	e     *echo.Echo
	cfg   core.Config
	db    *gorm.DB
	redis *redis.Client

	users   models.UserStore
	trips   models.TripStore
	members models.TripMemberStore
	pois    models.POIStore

	cookieName string
}

func NewServer(p ServerParams) *Server {
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = httpErrorHandler
	e.Validator = customvalidator.New()

	s := &Server{
		e:          e,
		cfg:        p.Config,
		db:         p.DB,
		redis:      p.Redis,
		users:      p.Users,
		trips:      p.Trips,
		members:    p.Members,
		pois:       p.POIs,
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
}

// registerRoutes is the map of the whole API. Each register* method lives in its
// own <domain>.handler.go file; unimplemented ones are stubs carrying the task id.
func (s *Server) registerRoutes() {
	// --- ops (no auth) -------------------------------------------------------
	s.e.GET("/healthz", s.handleHealthz)
	s.e.GET("/readyz", s.handleReadyz)

	v1 := s.e.Group("/api/v1")

	s.registerAuthRoutes(v1)   // A0.4 / A0.5
	s.registerUserRoutes(v1)   // A3.1
	s.registerPublicRoutes(v1) // A11.x — public plans, explore, clone
	s.registerPOIRoutes(v1)    // A4.2

	// --- trip-scoped ---------------------------------------------------------
	// Every route below carries :tripId and is guarded by TripRoleMiddleware.
	trips := v1.Group("/trips", s.JwtMiddleware)
	s.registerTripRoutes(trips)          // A1.1 / A2.1
	s.registerMemberRoutes(trips)        // A2.2 / A2.3
	s.registerWishlistRoutes(trips)      // A3.2
	s.registerPlanRoutes(trips)          // A4.x
	s.registerItemRoutes(trips)          // A5.x
	s.registerBudgetRoutes(trips)        // A7.x
	s.registerPrepRoutes(trips)          // A8.x
	s.registerCollaborationRoutes(trips) // A9.x
	s.registerAIRoutes(trips)            // A4.x
	s.registerBookingRoutes(trips)       // A12.x
	s.registerExportRoutes(trips)        // A10.x
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
