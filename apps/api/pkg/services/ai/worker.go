package ai

import (
	"context"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/jobs"
)

// The AI worker consumes the Redis queue, runs the pipeline, updates the
// ai_jobs row (status, step, tokens, cost) and publishes ai.progress SSE events
// so the browser can show a live "กำลังร่างแพลน..." state (A4.9).
//
// Phase 1 runs it inside the API process; the only thing that has to change to
// split it out is which binary calls StartWorker.

// StartWorker registers the pipeline against every AI job kind and starts the
// pool, tying its lifetime to the FX application lifecycle.
func StartWorker(lc fx.Lifecycle, pool *jobs.Pool, p Pipeline) {
	for _, kind := range []jobs.Kind{
		jobs.KindGenerate, jobs.KindRefine, jobs.KindNormalize, jobs.KindExplain,
	} {
		pool.Register(kind, p.Run)
	}

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			// A background context, not the start context: the pool must
			// outlive startup and stop only when Stop is called.
			pool.Start(context.Background())
			return nil
		},
		OnStop: func(context.Context) error {
			pool.Stop()
			return nil
		},
	})
	logger.L().Info("ai worker registered")
}
