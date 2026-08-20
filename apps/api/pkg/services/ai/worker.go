package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// The AI worker runs the pipeline off the request goroutine, updates the
// ai_jobs row (status, step, tokens, cost) and publishes ai.progress events so
// the browser can show a live "กำลังร่างแพลน…" state (A4.9).
//
// Phase 1 runs the pool in-process rather than through a Redis queue: one
// instance, a handful of concurrent drafts, and a job row that already survives
// a restart as `queued`. The interface is what a queue would need, so moving to
// one later does not touch the handlers.

// Runner is what handlers depend on.
type Runner interface {
	// Enqueue starts a job and returns immediately.
	Enqueue(job models.AIJob, in GenerateInput)
}

const (
	maxConcurrent = 3
	jobTimeout    = 3 * time.Minute
)

type runner struct {
	cfg      core.Config
	pipeline Pipeline
	jobs     models.AIJobStore
	hub      events.Hub

	// slots caps concurrency: three drafts at once is plenty for one instance,
	// and an unbounded pool would let a burst exhaust the model's rate limit.
	slots chan struct{}
	wg    sync.WaitGroup
}

func NewRunner(cfg core.Config, p Pipeline, jobs models.AIJobStore, hub events.Hub) Runner {
	return &runner{
		cfg:      cfg,
		pipeline: p,
		jobs:     jobs,
		hub:      hub,
		slots:    make(chan struct{}, maxConcurrent),
	}
}

var RunnerModule = uberfx.Module("services.ai.runner", uberfx.Provide(NewRunner))

func (r *runner) Enqueue(job models.AIJob, in GenerateInput) {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()

		r.slots <- struct{}{}
		defer func() { <-r.slots }()

		// The job outlives the HTTP request that created it, so it gets its own
		// context: a user closing the tab must not cancel a draft the rest of
		// the group is waiting for.
		ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
		defer cancel()

		r.run(ctx, job, in)
	}()
}

func (r *runner) run(ctx context.Context, job models.AIJob, in GenerateInput) {
	publish := func(j *models.AIJob) {
		payload, err := json.Marshal(map[string]any{
			"job_id":   j.ID,
			"status":   j.Status,
			"progress": j.Progress,
			"step":     j.Step,
		})
		if err != nil {
			return
		}
		_ = r.hub.Publish(ctx, j.TripID, events.Event{
			Type:       events.TypeAIProgress,
			TargetType: "ai_job",
			TargetID:   j.ID,
			ActorID:    j.UserID,
			TS:         time.Now().UTC(),
			Payload:    payload,
		})
	}

	job.Status = models.AIRunning
	job.Step = "เริ่มร่างแพลน"
	job.Progress = 0.05
	if err := r.jobs.Update(ctx, &job); err != nil {
		logger.L().WithError(err).Error("ai: cannot mark the job running")
		return
	}
	publish(&job)

	// Progress is written through to the row as well as published: a browser
	// that reconnects mid-draft asks for the job and must see where it got to.
	var lastWrite time.Time
	onStep := func(step string, progress float64) {
		job.Step = step
		job.Progress = progress

		// Throttled — a step every few hundred ms does not need its own UPDATE.
		if time.Since(lastWrite) > 700*time.Millisecond || progress >= 1 {
			lastWrite = time.Now()
			if err := r.jobs.Update(ctx, &job); err != nil {
				logger.L().WithError(err).Debug("ai: progress write failed")
			}
		}
		publish(&job)
	}

	result, err := r.pipeline.Generate(ctx, in, onStep)
	if err != nil {
		job.Status = models.AIFailed
		job.Error = err.Error()
		job.Progress = 1
		job.Step = "ร่างไม่สำเร็จ"
		finished := time.Now().UTC()
		job.FinishedAt = &finished
		if err := r.jobs.Update(ctx, &job); err != nil {
			logger.L().WithError(err).Error("ai: cannot mark the job failed")
		}
		publish(&job)
		return
	}

	raw, err := json.Marshal(result)
	if err != nil {
		raw = []byte("{}")
	}

	job.Status = models.AIDone
	job.Progress = 1
	job.Step = "เสร็จแล้ว"
	job.Result = raw
	job.Simulated = result.Simulated
	job.InputTokens = result.Usage.InputTokens
	job.OutputTokens = result.Usage.OutputTokens
	job.CostUSD = result.Usage.CostUSD
	finished := time.Now().UTC()
	job.FinishedAt = &finished

	if err := r.jobs.Update(ctx, &job); err != nil {
		logger.L().WithError(err).Error("ai: cannot store the finished draft")
		return
	}
	publish(&job)

	_ = r.hub.Publish(ctx, job.TripID, events.Event{
		Type:       events.TypePlanReady,
		TargetType: "ai_job",
		TargetID:   job.ID,
		ActorID:    job.UserID,
		TS:         time.Now().UTC(),
	})
}

// CheckDailyCap reports whether another run is allowed today (A4.11). A model
// that can be asked to think for a minute needs a ceiling that is checked
// before the call, not discovered on the invoice.
func CheckDailyCap(ctx context.Context, jobs models.AIJobStore, cap float64) error {
	if cap <= 0 {
		return nil
	}
	since := time.Now().UTC().Truncate(24 * time.Hour)
	spent, err := jobs.CostSince(ctx, since)
	if err != nil {
		return nil // never block a draft because the meter is unreadable
	}
	if spent >= cap {
		return fmt.Errorf("วันนี้ใช้โควตา AI ของระบบครบแล้ว — ลองใหม่พรุ่งนี้")
	}
	return nil
}
