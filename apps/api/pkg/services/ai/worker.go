package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
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
	// EnqueueVariants runs the pipeline 2–3 times with a different key decision
	// each and stores every result as a PlanVariant (M6 — A6.2).
	EnqueueVariants(job models.AIJob, in GenerateInput, count int)
}

const (
	maxConcurrent = 3
	jobTimeout    = 3 * time.Minute
)

type runner struct {
	cfg      core.Config
	pipeline Pipeline
	jobs     models.AIJobStore
	plans    models.PlanStore
	hub      events.Hub

	// slots caps concurrency: three drafts at once is plenty for one instance,
	// and an unbounded pool would let a burst exhaust the model's rate limit.
	slots chan struct{}
	wg    sync.WaitGroup
}

// eventsHub is the hub this package needs, named locally so queue.go can take
// it without repeating the import in every signature.
type eventsHub = events.Hub

// newLocalRunner is the in-process pool. Both modes use it: `all` runs it
// directly, and the worker process runs it behind the queue consumer, which is
// what keeps the two producing identical drafts.
func newLocalRunner(cfg core.Config, p Pipeline, jobs models.AIJobStore, plans models.PlanStore, hub events.Hub) Runner {
	return &runner{
		cfg:      cfg,
		pipeline: p,
		jobs:     jobs,
		plans:    plans,
		hub:      hub,
		slots:    make(chan struct{}, maxConcurrent),
	}
}

// NewRunner picks how a draft gets run, from the role this process is playing.
//
//	all     — run it here, which is what a laptop and docker compose do
//	api     — hand it to the queue for a worker to pick up
//	worker  — the same in-process pool, driven by ai.Consumer
//
// The API role still falls back to running the draft locally when the queue
// cannot be reached: a credit has already been spent by the time this is
// called, and losing the draft is the one outcome worth avoiding.
func NewRunner(
	cfg core.Config,
	p Pipeline,
	jobs models.AIJobStore,
	plans models.PlanStore,
	hub events.Hub,
	rdb *redis.Client,
) Runner {
	local := newLocalRunner(cfg, p, jobs, plans, hub)

	if cfg.Role != RoleAPI || rdb == nil {
		return local
	}
	return &publisher{redis: rdb, local: local}
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

/* ------------------------------------------------- multi-variant (M6) ---- */

// variantFlavours are the key decisions the multi-variant run explores. Each
// one really changes the draft — pace drives items-per-day in the pipeline —
// rather than being three names for the same itinerary.
var variantFlavours = []struct {
	pace, label, key, brief string
}{
	{
		pace:  "balanced",
		label: "สมดุล",
		key:   "เก็บที่สำคัญให้ครบ โดยไม่ต้องรีบ",
		brief: "จัดจังหวะกลางๆ เก็บ must-do ให้ครบ และเว้นช่วงพักบ้าง",
	},
	{
		pace:  "relaxed",
		label: "สายชิล",
		key:   "วันละไม่กี่ที่ มีเวลานั่งคาเฟ่และเดินเล่น",
		brief: "ลดจำนวนที่ต่อวันลง เน้นคุณภาพเวลามากกว่าจำนวนที่",
	},
	{
		pace:  "packed",
		label: "จัดเต็ม",
		key:   "อัดให้ครบทุกอย่างที่กลุ่มอยากไป",
		brief: "อัดที่เที่ยวให้มากที่สุดเท่าที่วันจะรับไหว เริ่มเช้า กลับดึก",
	},
}

func (r *runner) EnqueueVariants(job models.AIJob, in GenerateInput, count int) {
	if count < 2 {
		count = 2
	}
	if count > len(variantFlavours) {
		count = len(variantFlavours)
	}

	r.wg.Add(1)
	go func() {
		defer r.wg.Done()

		r.slots <- struct{}{}
		defer func() { <-r.slots }()

		// One timeout per draft — a three-variant job is legitimately three
		// drafts long.
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(count)*jobTimeout)
		defer cancel()

		r.runVariants(ctx, job, in, count)
	}()
}

func (r *runner) runVariants(ctx context.Context, job models.AIJob, in GenerateInput, count int) {
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
	job.Step = "เริ่มร่างหลายแบบ"
	job.Progress = 0.05
	if err := r.jobs.Update(ctx, &job); err != nil {
		logger.L().WithError(err).Error("ai: cannot mark the variants job running")
		return
	}
	publish(&job)

	variantIDs := make([]string, 0, count)
	var usage Usage
	simulated := false

	for i := 0; i < count; i++ {
		flavour := variantFlavours[i]

		base := float64(i) / float64(count)
		span := 1.0 / float64(count)
		onStep := func(step string, progress float64) {
			job.Step = fmt.Sprintf("แบบที่ %d/%d (%s) — %s", i+1, count, flavour.label, step)
			job.Progress = base + progress*span*0.95
			if err := r.jobs.Update(ctx, &job); err != nil {
				logger.L().WithError(err).Debug("ai: variants progress write failed")
			}
			publish(&job)
		}

		variantIn := in
		variantIn.Pace = flavour.pace
		if in.Brief != "" {
			variantIn.Brief = in.Brief + "\n" + flavour.brief
		} else {
			variantIn.Brief = flavour.brief
		}

		result, err := r.pipeline.Generate(ctx, variantIn, onStep)
		if err != nil {
			// One failed flavour does not waste the ones that finished: keep what
			// exists and report the failure honestly.
			logger.L().WithError(err).Errorf("ai: variant %d/%d failed", i+1, count)
			continue
		}
		usage.InputTokens += result.Usage.InputTokens
		usage.OutputTokens += result.Usage.OutputTokens
		usage.CostUSD += result.Usage.CostUSD
		simulated = simulated || result.Simulated

		daysJSON, err := json.Marshal(result.Days)
		if err != nil {
			continue
		}
		variant := models.PlanVariant{
			TripID:      job.TripID,
			Label:       flavour.label,
			KeyDecision: flavour.key,
			Summary:     firstLine(result.Rationales),
			Source:      models.VariantSourceAI,
			CreatedBy:   job.UserID,
			Days:        daysJSON,
			Pros:        mustJSON(prosOf(flavour.pace)),
			Cons:        mustJSON(consOf(flavour.pace)),
		}
		if err := r.plans.CreateVariant(ctx, &variant); err != nil {
			logger.L().WithError(err).Error("ai: cannot store a variant")
			continue
		}
		variantIDs = append(variantIDs, variant.ID)
	}

	finished := time.Now().UTC()
	job.FinishedAt = &finished
	job.Simulated = simulated
	job.InputTokens = usage.InputTokens
	job.OutputTokens = usage.OutputTokens
	job.CostUSD = usage.CostUSD
	job.Progress = 1

	if len(variantIDs) == 0 {
		job.Status = models.AIFailed
		job.Error = "ร่างไม่สำเร็จสักแบบ"
		job.Step = "ร่างไม่สำเร็จ"
	} else {
		job.Status = models.AIDone
		job.Step = fmt.Sprintf("ได้ %d แบบ", len(variantIDs))
		raw, err := json.Marshal(map[string]any{"variant_ids": variantIDs})
		if err == nil {
			job.Result = raw
		}
	}

	if err := r.jobs.Update(ctx, &job); err != nil {
		logger.L().WithError(err).Error("ai: cannot store the finished variants job")
		return
	}
	publish(&job)

	_ = r.hub.Publish(ctx, job.TripID, events.Event{
		Type:       events.TypePlanUpdated,
		TargetType: "variant",
		TargetID:   job.ID,
		ActorID:    job.UserID,
		TS:         time.Now().UTC(),
	})
}

func firstLine(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	return lines[0]
}

func prosOf(pace string) []string {
	switch pace {
	case "relaxed":
		return []string{"ไม่เหนื่อย มีเวลาซึมซับแต่ละที่", "เผื่อเวลาหลงทาง/ต่อคิวได้สบาย"}
	case "packed":
		return []string{"เก็บครบทุกอย่างที่กลุ่มอยากไป", "คุ้มค่าตั๋วเครื่องบินที่สุด"}
	default:
		return []string{"สมดุลระหว่างเก็บที่เที่ยวกับเวลาพัก", "เหมาะกับกลุ่มที่จังหวะต่างกัน"}
	}
}

func consOf(pace string) []string {
	switch pace {
	case "relaxed":
		return []string{"อาจเก็บ must-do ได้ไม่ครบ"}
	case "packed":
		return []string{"เหนื่อย — วันเริ่มเช้าและจบดึก", "เวลาแต่ละที่จำกัด"}
	default:
		return []string{"ไม่สุดสักทาง ถ้ากลุ่มอยากได้แนวชัดๆ"}
	}
}

func mustJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return raw
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
