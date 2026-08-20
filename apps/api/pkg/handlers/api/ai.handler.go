package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerAIRoutes covers the planner endpoints (DEV_SPEC §5.10).
//
//	POST /trips/:tripId/ai/generate    [editor] -> {job_id}
//	POST /trips/:tripId/ai/normalize   [editor] -> {job_id}
//	POST /plans/:planId/ai/refine      [editor] -> {job_id}
//	POST /plans/:planId/ai/apply-diff  [editor]
//	POST /ai/parse-ticket              [jwt]    synchronous
//	GET  /ai/jobs/:jobId               [member of the job's trip]
func (s *Server) registerAIRoutes(v1, trips *echo.Group) {
	editor := s.TripRoleMiddleware(models.TripRoleEditor)

	// AI calls cost real money, so they carry the tightest limit in the API on
	// top of the per-trip daily cost cap enforced below.
	guard := s.RateLimit(RateLimitConfig{Key: "ai", Limit: 10, Window: 5 * time.Minute})

	trips.POST("/:tripId/ai/generate", s.handleAIGenerate, editor, guard)
	trips.POST("/:tripId/ai/normalize", s.handleAINormalize, editor, guard)

	plans := v1.Group("/plans", s.JwtMiddleware)
	planEditor := s.ResolveTrip("planId", models.TripRoleEditor, s.planTrip)
	plans.POST("/:planId/ai/refine", s.handleAIRefine, planEditor, guard)
	plans.POST("/:planId/ai/apply-diff", s.handleApplyDiff, planEditor)

	aiGroup := v1.Group("/ai", s.JwtMiddleware)
	aiGroup.POST("/parse-ticket", s.handleParseTicket, guard)
	aiGroup.GET("/jobs/:jobId", s.handleGetAIJob)
}

type generateRequest struct {
	Hints string `json:"hints" validate:"omitempty,max=2000"`
}

func (s *Server) handleAIGenerate(c echo.Context) error {
	var req generateRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.checkAIBudget(c, tripID); err != nil {
		return err
	}

	jobID, err := s.ai.Enqueue(ctx, models.JobGenerate, tripID, "", request.UserID(c),
		ai.GenerateInput{Hints: req.Hints})
	if err != nil {
		return s.aiError(c, err)
	}

	s.emit(c, tripID, emitOpts{
		EventType:  events.TypeAIProgress,
		TargetType: "ai_job", TargetID: jobID,
		Meta: map[string]any{"status": "queued", "step": "queued"},
	})
	return c.JSON(http.StatusAccepted, map[string]any{"job_id": jobID})
}

func (s *Server) handleAINormalize(c echo.Context) error {
	jobID, err := s.ai.Enqueue(c.Request().Context(), models.JobNormalize,
		request.TripID(c), "", request.UserID(c), struct{}{})
	if err != nil {
		return s.aiError(c, err)
	}
	return c.JSON(http.StatusAccepted, map[string]any{"job_id": jobID})
}

type refineRequest struct {
	Instruction string `json:"instruction" validate:"required,max=2000"`
}

func (s *Server) handleAIRefine(c echo.Context) error {
	var req refineRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	tripID := request.TripID(c)
	if err := s.checkAIBudget(c, tripID); err != nil {
		return err
	}

	jobID, err := s.ai.Enqueue(c.Request().Context(), models.JobRefine,
		tripID, c.Param("planId"), request.UserID(c),
		ai.RefineInput{Instruction: req.Instruction})
	if err != nil {
		return s.aiError(c, err)
	}
	return c.JSON(http.StatusAccepted, map[string]any{"job_id": jobID})
}

type parseTicketRequest struct {
	Text string `json:"text" validate:"required,max=20000"`
}

// handleParseTicket is synchronous: the entry flow shows a flight preview
// before any trip exists, so there is nothing to hang a job off (M1).
func (s *Server) handleParseTicket(c echo.Context) error {
	var req parseTicketRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c, 60*time.Second)
	defer cancel()

	parsed, err := s.ai.ParseTicket(ctx, req.Text)
	if err != nil {
		return s.aiError(c, err)
	}
	return request.OK(c, parsed)
}

// handleGetAIJob is the polling fallback for clients without an open SSE
// stream (DEV_SPEC §7.1). It re-checks trip membership on the job's own trip
// so a guessed job id reveals nothing.
func (s *Server) handleGetAIJob(c echo.Context) error {
	ctx := c.Request().Context()

	job, err := s.aiJobs.Get(ctx, c.Param("jobId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบงาน")
	}
	if job.TripID != "" {
		if _, err := s.members.Get(ctx, job.TripID, request.UserID(c)); err != nil {
			return request.NotFound(c, "ไม่พบงาน")
		}
	} else if job.UserID != request.UserID(c) {
		return request.NotFound(c, "ไม่พบงาน")
	}

	return request.OK(c, job)
}

type applyDiffRequest struct {
	JobID           string `json:"job_id" validate:"required,uuid4"`
	AcceptedDiffIDs []int  `json:"accepted_diff_ids" validate:"omitempty,max=100,dive,min=0"`
	AcceptAll       bool   `json:"accept_all"`
}

// handleApplyDiff applies the refine job's suggestions the group accepted.
// Diffs are addressed by index into the job output, because a diff is not a
// stored entity — it exists only inside one job's result (W4.3).
func (s *Server) handleApplyDiff(c echo.Context) error {
	var req applyDiffRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	planID := c.Param("planId")

	job, err := s.aiJobs.Get(ctx, req.JobID)
	if err != nil || job.TripID != tripID {
		return request.NotFound(c, "ไม่พบงาน")
	}
	if job.Status != models.JobDone {
		return request.BadRequest(c, "งานยังไม่เสร็จ")
	}

	var output struct {
		Diffs []ai.ItemDiff `json:"diffs"`
	}
	if err := json.Unmarshal(job.Output, &output); err != nil {
		return request.BadRequest(c, "อ่านผลลัพธ์ของงานไม่สำเร็จ")
	}

	accepted := map[int]bool{}
	for _, i := range req.AcceptedDiffIDs {
		accepted[i] = true
	}

	days, err := s.plans.Days(ctx, planID)
	if err != nil {
		return request.Internal(c, "อ่านวันในแพลนไม่สำเร็จ")
	}

	applied := 0
	for i, diff := range output.Diffs {
		if !req.AcceptAll && !accepted[i] {
			continue
		}
		if err := s.applyOneDiff(c, planID, diff, days); err == nil {
			applied++
		}
	}

	s.afterItemChange(c, tripID, planID)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPlanUpdated,
		EventType:  events.TypePlanUpdated,
		TargetType: "plan", TargetID: planID,
		Meta: map[string]any{"applied_diffs": applied},
	})

	detail, err := s.planDetail(ctx, tripID, planID)
	if err != nil {
		return request.OK(c, map[string]any{"applied": applied})
	}
	return request.OK(c, map[string]any{"applied": applied, "plan": detail})
}

func (s *Server) applyOneDiff(c echo.Context, planID string, diff ai.ItemDiff, days []models.Day) error {
	ctx := c.Request().Context()
	actorID := request.UserID(c)

	switch diff.Op {
	case "remove":
		return s.items.Delete(ctx, planID, diff.ItemID, actorID)

	case "move":
		dayID := dayIDForIndex(days, diff.DayIndex)
		if dayID == "" {
			return errors.New("ai: diff points at a day that is not in this plan")
		}
		return s.items.Move(ctx, planID, diff.ItemID, dayID, diff.Position, actorID)

	case "update":
		item, err := s.items.Get(ctx, planID, diff.ItemID)
		if err != nil {
			return err
		}
		applyItemFields(item, diff.Item)
		return s.items.Update(ctx, planID, item, actorID, models.CreatedByAI)

	case "add":
		dayID := dayIDForIndex(days, diff.DayIndex)
		if dayID == "" {
			return errors.New("ai: diff points at a day that is not in this plan")
		}
		order, _ := s.items.NextSortOrder(ctx, dayID)
		item := &models.Item{
			PlanID: planID, DayID: dayID, SortOrder: order,
			Type: models.ItemTypePlace, CostCurrency: "JPY",
			CostBasis: models.CostBasisPerPerson,
			// Anything the model adds is an estimate, same as a generate.
			CostStatus:    models.CostStatusEstimate,
			BookingStatus: models.BookingStatusNone,
			Verified:      models.VerifiedNo,
		}
		applyItemFields(item, diff.Item)
		if item.Title == "" {
			return errors.New("ai: diff adds an item with no title")
		}
		return s.items.Create(ctx, planID, item)
	}
	return errors.New("ai: unknown diff op")
}

// applyItemFields copies the whitelisted fields from a model-produced map.
// Anything not listed here — ids, verified, booking state — is not the model's
// to set.
func applyItemFields(item *models.Item, fields map[string]any) {
	if v, ok := fields["title"].(string); ok && v != "" {
		item.Title = v
	}
	if v, ok := fields["notes"].(string); ok {
		item.Notes = v
	}
	if v, ok := fields["type"].(string); ok && v != "" {
		item.Type = v
	}
	if v, ok := fields["start_time"].(string); ok {
		item.StartTime = v
	}
	if v, ok := fields["end_time"].(string); ok {
		item.EndTime = v
	}
	if v, ok := fields["travel_mode"].(string); ok {
		item.TravelMode = v
	}
	if v, ok := fields["travel_note"].(string); ok {
		item.TravelNote = v
	}
	if v, ok := fields["duration_min"].(float64); ok {
		item.DurationMin = int(v)
	}
	if v, ok := fields["travel_min"].(float64); ok {
		item.TravelMin = int(v)
	}
	if v, ok := fields["cost_amount"].(float64); ok {
		amount := v
		item.CostAmount = &amount
		item.CostStatus = models.CostStatusEstimate
		if item.CostNote == "" {
			item.CostNote = "ประมาณการโดย AI"
		}
	}
}

func dayIDForIndex(days []models.Day, index int) string {
	for _, d := range days {
		if d.DayIndex == index {
			return d.ID
		}
	}
	return ""
}

// checkAIBudget enforces the per-trip daily cost cap (A4.11). Without it one
// group hammering "ร่างใหม่" can spend the whole month's AI budget in an hour.
func (s *Server) checkAIBudget(c echo.Context, tripID string) error {
	dailyCap := s.cfg.Anthropic.DailyCostCapUSD
	if dailyCap <= 0 {
		return nil
	}

	since := time.Now().UTC().Add(-24 * time.Hour)
	spent, err := s.aiJobs.CostSince(c.Request().Context(), tripID, since)
	if err != nil {
		return nil // never block on a failed accounting read
	}
	if spent >= dailyCap {
		return request.Error(c, http.StatusTooManyRequests,
			"ทริปนี้ใช้ AI ครบโควตาของวันนี้แล้ว ลองใหม่พรุ่งนี้")
	}
	return nil
}

// aiError turns the two conditions a user can actually act on into clear
// messages instead of a 500.
func (s *Server) aiError(c echo.Context, err error) error {
	if errors.Is(err, ai.ErrNotConfigured) {
		return request.Error(c, http.StatusServiceUnavailable,
			"ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY)")
	}
	return request.Internal(c, "เรียกใช้ AI ไม่สำเร็จ")
}
