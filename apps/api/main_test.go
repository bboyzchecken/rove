package main

import (
	"testing"

	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	handlers "github.com/bboyzchecken/rove/apps/api/pkg/handlers/api"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
)

// The dependency graph has to be complete before anything is deployed: a
// missing provider is a panic on boot, and finding that out from a health check
// in production is the worst possible time.
//
// fx.ValidateApp builds the graph without running it, so this needs neither
// MySQL nor Redis — exactly what CI has.
func TestFXGraphIsComplete(t *testing.T) {
	err := fx.ValidateApp(
		fx.Supply(core.Config{
			Environment: "test",
			MockMode:    true,
			Port:        "5000",
		}),
		// The two infrastructure clients are the only things stubbed: they open
		// real connections, and everything downstream only needs the type.
		fx.Provide(func() *gorm.DB { return nil }),
		fx.Provide(newTestRedis),
		storeModules(),
		serviceModules(),
		handlers.Module,
		fx.Invoke(func(*handlers.Server) {}),
		fx.NopLogger,
	)
	if err != nil {
		t.Fatalf("fx graph is incomplete: %v", err)
	}
}

// newTestRedis hands the graph a typed nil. Every service that takes the client
// already handles a nil one — that is what lets a developer without Docker run
// the API — so this exercises the same path.
func newTestRedis() *redis.Client { return nil }

// The worker graph has to stand on its own: it shares every store and service
// with the API and differs only in not serving HTTP (Phase 3 — INFRA).
func TestWorkerGraphIsComplete(t *testing.T) {
	err := fx.ValidateApp(
		fx.Supply(core.Config{
			Environment: "test",
			MockMode:    true,
			Role:        ai.RoleWorker,
		}),
		fx.Provide(func() *gorm.DB { return nil }),
		fx.Provide(newTestRedis),
		storeModules(),
		serviceModules(),
		fx.Invoke(func(ai.Consumer) {}),
		fx.NopLogger,
	)
	if err != nil {
		t.Fatalf("worker graph is incomplete: %v", err)
	}
}
