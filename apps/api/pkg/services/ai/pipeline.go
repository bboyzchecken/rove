package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"go.uber.org/fx"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/jobs"
)

// Pipeline is the ordered set of steps that turns a trip + wishlists into a
// persisted plan. Each step is separately testable and separately retryable.
//
//	normalize   wishlist text -> tags + poi_id
//	buildFrame  anchors: flights, prepaid stays, dated must-dos, zone per day
//	generate    -> PlanDraft (schemas.go)
//	validate    pkg/domain.ValidatePlan — pure, no model involved
//	repair      feed issues back to the model, at most 2 loops
//	explain     -> rationales + open questions
//	persist     one DB transaction + item_versions
//
// Validation is deliberately NOT part of the prompt: it is deterministic Go
// code, so a plan is checked the same way whether a model or a person wrote it.
type Pipeline interface {
	// Enqueue creates the ai_jobs row and pushes the job. The HTTP handler
	// returns the job id immediately; progress arrives over SSE.
	Enqueue(ctx context.Context, kind, tripID, planID, userID string, input any) (string, error)
	// Run executes one job to completion. Called by the worker, and directly by
	// tests.
	Run(ctx context.Context, job jobs.Job) error
	// ParseTicket is synchronous: the entry-point flow blocks on it (M1).
	ParseTicket(ctx context.Context, text string) (*ParsedTicket, error)
}

// maxRepairLoops is the §6.3 rule: at most two repair round trips before the
// plan ships with its warnings attached rather than burning more tokens.
const maxRepairLoops = 2

// cataloguePerCity bounds the POI shortlist so the prompt stays affordable.
const cataloguePerCity = 60

type pipeline struct {
	cfg    core.Config
	db     *gorm.DB
	client Client
	tools  *Tools
	queue  jobs.Queue
	hub    events.Hub

	trips     models.TripStore
	members   models.TripMemberStore
	profiles  models.ProfileStore
	flights   models.FlightStore
	wishlists models.WishlistStore
	plans     models.PlanStore
	aiJobs    models.AIJobStore
}

// PipelineDeps keeps the constructor readable as the graph grows. fx.In makes
// FX fill the fields individually instead of looking for a PipelineDeps value.
type PipelineDeps struct {
	fx.In

	Config core.Config
	DB     *gorm.DB
	Client Client
	Tools  *Tools
	Queue  jobs.Queue
	Hub    events.Hub

	Trips     models.TripStore
	Members   models.TripMemberStore
	Profiles  models.ProfileStore
	Flights   models.FlightStore
	Wishlists models.WishlistStore
	Plans     models.PlanStore
	AIJobs    models.AIJobStore
}

func NewPipeline(d PipelineDeps) Pipeline {
	return &pipeline{
		cfg: d.Config, db: d.DB, client: d.Client, tools: d.Tools,
		queue: d.Queue, hub: d.Hub,
		trips: d.Trips, members: d.Members, profiles: d.Profiles,
		flights: d.Flights, wishlists: d.Wishlists, plans: d.Plans, aiJobs: d.AIJobs,
	}
}

func (p *pipeline) Enqueue(ctx context.Context, kind, tripID, planID, userID string, input any) (string, error) {
	if !p.client.Configured() {
		return "", ErrNotConfigured
	}

	raw, err := json.Marshal(input)
	if err != nil {
		return "", err
	}

	job := &models.AIJob{
		TripID: tripID,
		UserID: userID,
		Kind:   kind,
		Status: models.JobQueued,
		Input:  datatypes.JSON(raw),
	}
	if planID != "" {
		job.PlanID = &planID
	}
	if err := p.aiJobs.Create(ctx, job); err != nil {
		return "", err
	}

	err = p.queue.Enqueue(ctx, jobs.Job{
		ID: job.ID, Kind: jobs.Kind(kind),
		TripID: tripID, PlanID: planID, UserID: userID, Input: raw,
	})
	if err != nil {
		_ = p.aiJobs.Fail(ctx, job.ID, "ไม่สามารถส่งงานเข้าคิวได้: "+err.Error())
		return "", err
	}
	return job.ID, nil
}

func (p *pipeline) Run(ctx context.Context, job jobs.Job) error {
	switch job.Kind {
	case jobs.KindGenerate:
		return p.runGenerate(ctx, job)
	case jobs.KindRefine:
		return p.runRefine(ctx, job)
	case jobs.KindNormalize:
		return p.runNormalize(ctx, job)
	default:
		return fmt.Errorf("ai: pipeline has no step for kind %q", job.Kind)
	}
}

// GenerateInput is what the handler puts on the queue for a generate job.
type GenerateInput struct {
	Hints string `json:"hints"`
}

// RefineInput is the same for a refine job.
type RefineInput struct {
	Instruction string `json:"instruction"`
}

func (p *pipeline) runGenerate(ctx context.Context, job jobs.Job) error {
	var in GenerateInput
	_ = json.Unmarshal(job.Input, &in)

	fail := func(step string, err error) error {
		_ = p.aiJobs.Fail(ctx, job.ID, step+": "+err.Error())
		p.emit(ctx, job.TripID, job.ID, "error", step)
		return err
	}

	p.step(ctx, job, "gathering")
	ctxData, err := p.gather(ctx, job.TripID)
	if err != nil {
		return fail("รวบรวมข้อมูลทริป", err)
	}

	p.step(ctx, job, "frame")
	frame, err := p.buildFrame(ctxData)
	if err != nil {
		return fail("สร้างกรอบทริป", err)
	}

	p.step(ctx, job, "facts")
	facts, err := p.factSheet(ctx, ctxData)
	if err != nil {
		return fail("ดึงข้อมูลอ้างอิง", err)
	}

	p.step(ctx, job, "generating")
	draft, usage, err := p.generate(ctx, frame, ctxData, facts, in.Hints)
	if err != nil {
		return fail("ร่างแพลน", err)
	}
	total := usage

	// validate → repair, at most maxRepairLoops times. Issues that survive are
	// attached to the plan as warnings rather than blocking it.
	var issues []domain.Issue
	for loop := 0; loop <= maxRepairLoops; loop++ {
		p.step(ctx, job, "validating")
		issues, err = p.validate(ctx, ctxData, draft)
		if err != nil {
			return fail("ตรวจแพลน", err)
		}
		if !domain.HasErrors(issues) || loop == maxRepairLoops {
			break
		}

		p.step(ctx, job, fmt.Sprintf("repairing_%d", loop+1))
		repaired, ru, err := p.repair(ctx, frame, ctxData, facts, draft, issues)
		if err != nil {
			// A failed repair is not a failed job: ship the plan with warnings.
			logger.L().WithError(err).Warn("ai: repair loop failed, keeping the draft")
			break
		}
		draft = repaired
		total = add(total, ru)
	}

	p.step(ctx, job, "persisting")
	planID, err := p.persist(ctx, job, ctxData, draft, issues)
	if err != nil {
		return fail("บันทึกแพลน", err)
	}

	p.finish(ctx, job.ID, planID, total, map[string]any{
		"plan_id":        planID,
		"issues":         issues,
		"open_questions": draft.OpenQuestions,
	})
	p.emitPlanReady(ctx, job.TripID, planID)
	return nil
}

// tripContext is everything the pipeline needs about one trip, loaded once.
type tripContext struct {
	Trip     *models.Trip
	Members  []models.TripMember
	Profiles []models.MemberProfile
	Flights  []models.TripFlight
	Wishes   []models.WishlistItem
	Cities   []string
}

func (p *pipeline) gather(ctx context.Context, tripID string) (*tripContext, error) {
	trip, err := p.trips.GetByID(ctx, tripID)
	if err != nil {
		return nil, err
	}
	if trip.StartDate == nil || trip.EndDate == nil {
		return nil, fmt.Errorf("ทริปยังไม่มีวันเริ่มและวันจบ")
	}

	members, err := p.members.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	profiles, err := p.profiles.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	flights, err := p.flights.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	wishes, err := p.wishlists.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}

	var cities []string
	if len(trip.DestinationCities) > 0 {
		_ = json.Unmarshal(trip.DestinationCities, &cities)
	}
	if len(cities) == 0 {
		cities = []string{"tokyo"}
	}

	return &tripContext{
		Trip: trip, Members: members, Profiles: profiles,
		Flights: flights, Wishes: wishes, Cities: cities,
	}, nil
}

func (p *pipeline) buildFrame(c *tripContext) (domain.Frame, error) {
	in := domain.FrameInput{
		StartDate:      *c.Trip.StartDate,
		EndDate:        *c.Trip.EndDate,
		PartySize:      c.Trip.PartySize,
		MaxItemsPerDay: strictestPace(c.Profiles),
		HomeCurrency:   c.Trip.HomeCurrency,
		DestCurrency:   c.Trip.DestCurrency,
	}
	for _, f := range c.Flights {
		at := f.DepAt
		airport := f.DepAirport
		if f.Direction == models.FlightDirectionOut {
			at, airport = f.ArrAt, f.ArrAirport
		}
		if at == nil {
			continue
		}
		in.Flights = append(in.Flights, domain.FrameFlight{
			Direction: f.Direction, Airport: airport, At: *at,
		})
	}
	return domain.BuildFrame(in)
}

// strictestPace takes the tightest limit across the group: if one person wants
// a chill trip, planning at "packed" guarantees an argument on day two.
func strictestPace(profiles []models.MemberProfile) int {
	limit := domain.MaxNormalItems
	for _, pr := range profiles {
		if n, ok := models.MaxItemsPerDay[pr.Pace]; ok && n < limit {
			limit = n
		}
	}
	return limit
}

func (p *pipeline) factSheet(ctx context.Context, c *tripContext) (FactSheet, error) {
	texts := make([]string, 0, len(c.Wishes))
	for _, w := range c.Wishes {
		if w.Kind != models.WishAvoid {
			texts = append(texts, w.Text)
		}
	}

	pois, err := p.tools.Catalogue(ctx, c.Cities, texts, cataloguePerCity)
	if err != nil {
		return FactSheet{}, err
	}

	facts := FactSheet{POIs: pois}
	if len(pois) == 0 {
		facts.Warnings = append(facts.Warnings,
			"ยังไม่มีข้อมูล POI ในระบบสำหรับเมืองนี้ — ให้เสนอสถานที่โดยไม่ต้องใส่ poi_ref")
	}

	if q, ok := p.tools.FX(ctx, c.Trip.DestCurrency, c.Trip.HomeCurrency); ok {
		facts.FXRate = &q
	}
	if lat, lng, ok := anchorLatLng(pois); ok {
		facts.Weather = p.tools.Weather(ctx, lat, lng, *c.Trip.StartDate, *c.Trip.EndDate)
	}
	return facts, nil
}

// anchorLatLng picks any catalogue coordinate as the weather lookup point; a
// city-level forecast is all a packing list needs.
func anchorLatLng(pois []POICandidate) (float64, float64, bool) {
	// Candidates carry no coordinates by design (the prompt does not need them),
	// so fall back to the Tokyo city centre for the forecast.
	if len(pois) == 0 {
		return 0, 0, false
	}
	return 35.6762, 139.6503, true
}

func (p *pipeline) generate(ctx context.Context, frame domain.Frame, c *tripContext, facts FactSheet, hints string) (*PlanDraft, Usage, error) {
	system := MustPrompt(PromptPlanner)
	user := p.userMessage(frame, c, facts, hints)

	var draft PlanDraft
	usage, err := p.completeJSON(ctx, p.cfg.Anthropic.ModelPlanner, system, user, &draft)
	if err != nil {
		return nil, usage, err
	}
	if len(draft.Days) == 0 {
		return nil, usage, fmt.Errorf("โมเดลตอบกลับมาโดยไม่มีวันในแพลน")
	}
	return &draft, usage, nil
}

func (p *pipeline) repair(ctx context.Context, frame domain.Frame, c *tripContext, facts FactSheet, draft *PlanDraft, issues []domain.Issue) (*PlanDraft, Usage, error) {
	list := make([]string, 0, len(issues))
	for _, i := range issues {
		list = append(list, fmt.Sprintf("- [%s/%s] %s", i.Code, i.Severity, i.Message))
	}
	system, err := LoadPrompt(PromptRepair, map[string]string{"issues": strings.Join(list, "\n")})
	if err != nil {
		return nil, Usage{}, err
	}

	current, _ := json.Marshal(draft)
	user := p.userMessage(frame, c, facts, "") +
		"\n\n# แพลนปัจจุบันที่ต้องแก้\n```json\n" + string(current) + "\n```"

	var repaired PlanDraft
	usage, err := p.completeJSON(ctx, p.cfg.Anthropic.ModelPlanner, system, user, &repaired)
	if err != nil {
		return nil, usage, err
	}
	if len(repaired.Days) == 0 {
		return nil, usage, fmt.Errorf("การซ่อมแพลนคืนค่าว่าง")
	}
	return &repaired, usage, nil
}

// userMessage assembles the one user turn: the frame, the wishlists, and the
// facts. Everything the model is allowed to rely on is in here.
func (p *pipeline) userMessage(frame domain.Frame, c *tripContext, facts FactSheet, hints string) string {
	frameJSON, _ := json.MarshalIndent(frame, "", "  ")

	type wishOut struct {
		ID     string   `json:"id"`
		Kind   string   `json:"kind"`
		Text   string   `json:"text"`
		Tags   []string `json:"tags,omitempty"`
		POIID  string   `json:"poi_id,omitempty"`
		Member string   `json:"member_id"`
	}
	wishes := make([]wishOut, 0, len(c.Wishes))
	for _, w := range c.Wishes {
		o := wishOut{ID: w.ID, Kind: w.Kind, Text: w.Text, Member: w.MemberID}
		if len(w.Tags) > 0 {
			_ = json.Unmarshal(w.Tags, &o.Tags)
		}
		if w.POIID != nil {
			o.POIID = *w.POIID
		}
		wishes = append(wishes, o)
	}
	wishJSON, _ := json.MarshalIndent(wishes, "", "  ")

	var b strings.Builder
	fmt.Fprintf(&b, "# frame\n```json\n%s\n```\n\n", frameJSON)
	fmt.Fprintf(&b, "# wishlist\n```json\n%s\n```\n\n", wishJSON)
	fmt.Fprintf(&b, "# facts\n```json\n%s\n```\n", facts.JSON())
	if strings.TrimSpace(hints) != "" {
		fmt.Fprintf(&b, "\n# คำขอเพิ่มเติมจากกลุ่ม\n%s\n", hints)
	}
	return b.String()
}

// completeJSON is the one place a model call turns into a Go struct. The retry
// here is for schema failures; transport retries live in the client.
func (p *pipeline) completeJSON(ctx context.Context, model, system, user string, dst any) (Usage, error) {
	if model == "" {
		model = "claude-opus-5"
	}

	var total Usage
	msgs := []Message{{Role: "user", Content: user}}

	for attempt := 1; attempt <= 2; attempt++ {
		res, err := p.client.Complete(ctx, model, system, msgs, p.cfg.Anthropic.MaxTokens)
		if err != nil {
			return total, err
		}
		total = add(total, res.Usage)

		if err := ParseJSON(res.Text, dst); err == nil {
			return total, nil
		} else if attempt == 2 {
			return total, err
		}

		// Show the model its own output and the parse error; a bare "try again"
		// usually reproduces the same malformed shape.
		msgs = append(msgs,
			Message{Role: "assistant", Content: truncate(res.Text, 4000)},
			Message{Role: "user", Content: "ผลลัพธ์ก่อนหน้าไม่ใช่ JSON ที่ตรง schema ตอบใหม่เป็น JSON อย่างเดียว ไม่ต้องมีข้อความอื่น"},
		)
	}
	return total, fmt.Errorf("ai: model did not return valid JSON")
}

func add(a, b Usage) Usage {
	return Usage{
		InputTokens:  a.InputTokens + b.InputTokens,
		OutputTokens: a.OutputTokens + b.OutputTokens,
		CostUSD:      a.CostUSD + b.CostUSD,
	}
}

func (p *pipeline) step(ctx context.Context, job jobs.Job, step string) {
	_ = p.aiJobs.SetStep(ctx, job.ID, step)
	p.emit(ctx, job.TripID, job.ID, "running", step)
}

func (p *pipeline) emit(ctx context.Context, tripID, jobID, status, step string) {
	if p.hub == nil || tripID == "" {
		return
	}
	_ = p.hub.Publish(ctx, tripID, events.Event{
		Type:       events.TypeAIProgress,
		TargetType: "ai_job",
		TargetID:   jobID,
		Meta:       map[string]any{"status": status, "step": step},
	})
}

func (p *pipeline) emitPlanReady(ctx context.Context, tripID, planID string) {
	if p.hub == nil {
		return
	}
	_ = p.hub.Publish(ctx, tripID, events.Event{
		Type:       events.TypePlanReady,
		TargetType: "plan",
		TargetID:   planID,
	})
}

func (p *pipeline) finish(ctx context.Context, jobID, planID string, usage Usage, output map[string]any) {
	job, err := p.aiJobs.Get(ctx, jobID)
	if err != nil {
		return
	}
	raw, _ := json.Marshal(output)
	now := time.Now().UTC()

	job.Status = models.JobDone
	job.Step = "done"
	job.Output = datatypes.JSON(raw)
	job.TokensIn = usage.InputTokens
	job.TokensOut = usage.OutputTokens
	job.CostUSD = usage.CostUSD
	job.FinishedAt = &now
	if planID != "" {
		job.PlanID = &planID
	}
	_ = p.aiJobs.Update(ctx, job)
}
