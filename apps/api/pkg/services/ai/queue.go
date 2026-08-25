package ai

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Running drafts somewhere other than the web process (DEV_SPEC Phase 3 —
// INFRA: แยก AI worker เป็น service แยก).
//
// Phase 1 ran the pool in-process on purpose: one instance, a handful of
// concurrent drafts, and a job row that already survives a restart. What
// changed is not the load, it is the shape — a draft takes up to three minutes
// and a deploy takes seconds, so every release either waits for the drafts or
// kills them. Moving the work to its own service means the web tier can be
// restarted, autoscaled and rolled back on its own schedule.
//
// The queue is a Redis list, not a broker. Everything a job needs is already in
// `ai_jobs`; the queue carries an id and an envelope, so the failure mode of
// losing the queue is "drafts stay queued", which is the state they already
// have a name for.

// Roles a process can take. `all` is what has always run: one binary doing
// both, which is still the right answer on a laptop and in compose.
const (
	RoleAll    = "all"
	RoleAPI    = "api"
	RoleWorker = "worker"
)

// queueKey is a list; the worker blocks on it. One key rather than one per
// kind: drafts and variant runs are the same work with a different count.
const queueKey = "rove:ai:jobs"

// blockFor is how long a worker waits on an empty queue before looping. Short
// enough that a shutdown is not held for a minute, long enough to be idle.
const blockFor = 5 * time.Second

// envelope is what travels. The job is included whole rather than re-read by
// id so a worker starting on a cold cache does one query fewer, and `Count`
// distinguishes a single draft from a variant run.
type envelope struct {
	Job   models.AIJob  `json:"job"`
	Input GenerateInput `json:"input"`
	Count int           `json:"count"`
}

// publisher is the Runner the API process gets when a worker is running
// elsewhere: it writes to the queue and returns.
type publisher struct {
	redis *redis.Client
	// local is the fallback. A queue that cannot be reached must not silently
	// swallow a draft somebody paid a credit for, so the work happens here
	// instead — degraded to Phase 1 behaviour, which still works.
	local Runner
}

func (p *publisher) Enqueue(job models.AIJob, in GenerateInput) {
	p.push(envelope{Job: job, Input: in, Count: 0}, func() { p.local.Enqueue(job, in) })
}

func (p *publisher) EnqueueVariants(job models.AIJob, in GenerateInput, count int) {
	p.push(envelope{Job: job, Input: in, Count: count}, func() { p.local.EnqueueVariants(job, in, count) })
}

func (p *publisher) push(env envelope, fallback func()) {
	payload, err := json.Marshal(env)
	if err != nil {
		logger.L().WithError(err).Error("ai queue: cannot encode the job — running it here instead")
		fallback()
		return
	}

	// A short timeout: this runs on the request goroutine, and a Redis that is
	// not answering must not hold the HTTP response open.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := p.redis.LPush(ctx, queueKey, payload).Err(); err != nil {
		logger.L().WithError(err).Warn("ai queue: push failed — running the draft in this process")
		fallback()
		return
	}
	logger.L().WithField("job", env.Job.ID).Info("ai queue: job handed to the worker")
}

// Consumer is what the worker process runs.
type Consumer interface {
	// Run blocks until the context is cancelled.
	Run(ctx context.Context)
}

type consumer struct {
	redis *redis.Client
	local Runner
}

func (c *consumer) Run(ctx context.Context) {
	if c.redis == nil {
		logger.L().Error("ai worker: no redis configured — there is no queue to consume")
		return
	}
	logger.L().Info("ai worker: waiting for drafts")

	for {
		if ctx.Err() != nil {
			return
		}

		res, err := c.redis.BRPop(ctx, blockFor, queueKey).Result()
		if err != nil {
			// An empty queue times out; that is the normal case, not a fault.
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			logger.L().WithError(err).Warn("ai worker: pop failed")
			// Back off rather than spin against a Redis that is down.
			select {
			case <-ctx.Done():
				return
			case <-time.After(blockFor):
			}
			continue
		}
		if len(res) != 2 {
			continue
		}

		var env envelope
		if err := json.Unmarshal([]byte(res[1]), &env); err != nil {
			logger.L().WithError(err).Error("ai worker: undecodable job dropped")
			continue
		}

		// The local runner caps its own concurrency, so this loop can hand
		// work over as fast as it arrives without a second limiter.
		if env.Count > 0 {
			c.local.EnqueueVariants(env.Job, env.Input, env.Count)
		} else {
			c.local.Enqueue(env.Job, env.Input)
		}
	}
}

// NewConsumer builds the worker side. It reuses the same in-process runner the
// single-binary mode uses, which is what keeps the two modes producing
// identical drafts.
func NewConsumer(cfg core.Config, p Pipeline, jobs models.AIJobStore, plans models.PlanStore, hub eventsHub, rdb *redis.Client) Consumer {
	return &consumer{redis: rdb, local: newLocalRunner(cfg, p, jobs, plans, hub)}
}

var ConsumerModule = uberfx.Module("services.ai.consumer", uberfx.Provide(NewConsumer))
