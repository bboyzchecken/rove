// Package jobs is the background worker: a Redis list used as a queue plus a
// goroutine pool. Phase 1 runs it inside the API process; it becomes a separate
// binary when load justifies it (DEV_SPEC §2.2).
package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Kind string

const (
	KindGenerate    Kind = "generate"
	KindRefine      Kind = "refine"
	KindExplain     Kind = "explain"
	KindNormalize   Kind = "normalize"
	KindParseTicket Kind = "parse_ticket"
	KindExport      Kind = "export"
)

type Job struct {
	ID     string `json:"id"`
	Kind   Kind   `json:"kind"`
	TripID string `json:"trip_id"`
	PlanID string `json:"plan_id"`
	UserID string `json:"user_id"`
	Input  []byte `json:"input"`
}

type Queue interface {
	Enqueue(ctx context.Context, j Job) error
	// Dequeue blocks until a job arrives or ctx is cancelled. It returns
	// (nil, nil) on a poll timeout so the worker loop can re-check ctx.
	Dequeue(ctx context.Context) (*Job, error)
}

type Handler func(ctx context.Context, j Job) error

// queueKey is the Redis list every API instance pushes to and every worker pops
// from, so adding a second instance spreads the load with no extra config.
const queueKey = "rove:jobs"

// blockTimeout bounds BLPOP so a shutdown does not wait on an idle queue.
const blockTimeout = 5 * time.Second

type queue struct{ rdb *redis.Client }

func NewQueue(rdb *redis.Client) Queue { return &queue{rdb: rdb} }

func (q *queue) Enqueue(ctx context.Context, j Job) error {
	raw, err := json.Marshal(j)
	if err != nil {
		return err
	}
	return q.rdb.RPush(ctx, queueKey, raw).Err()
}

func (q *queue) Dequeue(ctx context.Context) (*Job, error) {
	res, err := q.rdb.BLPop(ctx, blockTimeout, queueKey).Result()
	if err == redis.Nil {
		return nil, nil // idle poll, not a failure
	}
	if err != nil {
		return nil, err
	}
	if len(res) != 2 {
		return nil, fmt.Errorf("jobs: unexpected BLPOP result %v", res)
	}

	var j Job
	if err := json.Unmarshal([]byte(res[1]), &j); err != nil {
		// A job we cannot decode can never be retried into success; drop it
		// rather than blocking the queue head forever.
		logger.L().WithError(err).Error("jobs: dropping undecodable job")
		return nil, nil
	}
	return &j, nil
}

// Pool runs N workers against one Queue. Handlers are registered per kind so
// the AI pipeline and the export renderer share the same machinery.
type Pool struct {
	queue    Queue
	handlers map[Kind]Handler
	size     int

	mu      sync.RWMutex
	cancel  context.CancelFunc
	stopped sync.WaitGroup
}

func NewPool(q Queue) *Pool {
	return &Pool{queue: q, handlers: map[Kind]Handler{}, size: defaultWorkers}
}

// defaultWorkers is small on purpose: each AI job is mostly waiting on the
// model, and the 2 GB Lightsail box has no room for a large pool.
const defaultWorkers = 3

var Module = fx.Module("services.jobs", fx.Provide(NewQueue, NewPool))

func (p *Pool) Register(kind Kind, h Handler) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.handlers[kind] = h
}

func (p *Pool) handlerFor(kind Kind) (Handler, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	h, ok := p.handlers[kind]
	return h, ok
}

// Start launches the workers. It returns immediately; Stop drains them.
func (p *Pool) Start(parent context.Context) {
	ctx, cancel := context.WithCancel(parent)
	p.cancel = cancel

	for i := 0; i < p.size; i++ {
		p.stopped.Add(1)
		go func(worker int) {
			defer p.stopped.Done()
			p.run(ctx, worker)
		}(i)
	}
	logger.L().Infof("job pool started with %d workers", p.size)
}

func (p *Pool) run(ctx context.Context, worker int) {
	log := logger.L().WithField("worker", worker)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		job, err := p.queue.Dequeue(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.WithError(err).Warn("jobs: dequeue failed, backing off")
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
			continue
		}
		if job == nil {
			continue
		}

		h, ok := p.handlerFor(job.Kind)
		if !ok {
			log.Warnf("jobs: no handler registered for kind %q", job.Kind)
			continue
		}

		p.execute(ctx, log, h, *job)
	}
}

// execute isolates one job: a panic in a handler must not take down a worker
// and stall the queue.
func (p *Pool) execute(ctx context.Context, log *logrus.Entry, h Handler, job Job) {
	defer func() {
		if r := recover(); r != nil {
			log.WithField("job", job.ID).Errorf("jobs: handler panicked: %v", r)
		}
	}()

	// A job that hangs on the model must not hold a worker forever.
	jobCtx, cancel := context.WithTimeout(ctx, jobTimeout)
	defer cancel()

	if err := h(jobCtx, job); err != nil {
		log.WithField("job", job.ID).WithError(err).Error("jobs: handler failed")
	}
}

// jobTimeout covers a full generate: normalize, frame, generate, up to two
// repairs, explain and persist.
const jobTimeout = 5 * time.Minute

func (p *Pool) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.stopped.Wait()
	logger.L().Info("job pool stopped")
}
