package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/jobs"
)

// Refine returns a patch, never a whole new plan. The group reviews the diff
// and accepts it item by item (W4.3), so a single bad suggestion cannot quietly
// rewrite an itinerary everyone already agreed on.

// RefineResult is what the refine job stores in ai_jobs.output.
type RefineResult struct {
	Diffs   []ItemDiff `json:"diffs"`
	Summary string     `json:"summary"`
}

func (p *pipeline) runRefine(ctx context.Context, job jobs.Job) error {
	var in RefineInput
	_ = json.Unmarshal(job.Input, &in)
	if strings.TrimSpace(in.Instruction) == "" {
		err := fmt.Errorf("ไม่มีคำสั่งสำหรับปรับแพลน")
		_ = p.aiJobs.Fail(ctx, job.ID, err.Error())
		return err
	}

	fail := func(step string, err error) error {
		_ = p.aiJobs.Fail(ctx, job.ID, step+": "+err.Error())
		p.emit(ctx, job.TripID, job.ID, "error", step)
		return err
	}

	p.step(ctx, job, "gathering")
	c, err := p.gather(ctx, job.TripID)
	if err != nil {
		return fail("รวบรวมข้อมูลทริป", err)
	}

	current, err := p.snapshotPlan(ctx, c.Trip.ID, job.PlanID)
	if err != nil {
		return fail("อ่านแพลนปัจจุบัน", err)
	}

	p.step(ctx, job, "facts")
	facts, err := p.factSheet(ctx, c)
	if err != nil {
		return fail("ดึงข้อมูลอ้างอิง", err)
	}

	p.step(ctx, job, "refining")
	system, err := LoadPrompt(PromptRefine, map[string]string{"instruction": in.Instruction})
	if err != nil {
		return fail("เตรียม prompt", err)
	}

	planJSON, _ := json.MarshalIndent(current, "", "  ")
	user := fmt.Sprintf("# แพลนปัจจุบัน\n```json\n%s\n```\n\n# facts\n```json\n%s\n```",
		planJSON, facts.JSON())

	var result RefineResult
	usage, err := p.completeJSON(ctx, p.cfg.Anthropic.ModelPlanner, system, user, &result)
	if err != nil {
		return fail("ปรับแพลน", err)
	}

	// A diff pointing at an item outside this plan would let one trip edit
	// another's itinerary through the apply-diff endpoint.
	result.Diffs = filterDiffs(result.Diffs, current)

	p.finish(ctx, job.ID, job.PlanID, usage, map[string]any{
		"diffs":   result.Diffs,
		"summary": result.Summary,
	})
	p.emit(ctx, job.TripID, job.ID, "done", "done")
	return nil
}

// PlanSnapshot is the compact plan shape sent to the model for refine.
type PlanSnapshot struct {
	PlanID string        `json:"plan_id"`
	Name   string        `json:"name"`
	Days   []DaySnapshot `json:"days"`
}

type DaySnapshot struct {
	DayID    string         `json:"day_id"`
	DayIndex int            `json:"day_index"`
	Date     string         `json:"date"`
	Title    string         `json:"title"`
	Items    []ItemSnapshot `json:"items"`
}

type ItemSnapshot struct {
	ItemID    string  `json:"item_id"`
	Type      string  `json:"type"`
	Title     string  `json:"title"`
	StartTime string  `json:"start_time,omitempty"`
	EndTime   string  `json:"end_time,omitempty"`
	POIID     string  `json:"poi_id,omitempty"`
	Cost      float64 `json:"cost_jpy,omitempty"`
}

func (p *pipeline) snapshotPlan(ctx context.Context, tripID, planID string) (*PlanSnapshot, error) {
	plan, err := p.plans.Get(ctx, tripID, planID)
	if err != nil {
		return nil, err
	}
	days, err := p.plans.Days(ctx, planID)
	if err != nil {
		return nil, err
	}
	items, err := p.plans.Items(ctx, planID)
	if err != nil {
		return nil, err
	}

	byDay := map[string][]models.Item{}
	for _, it := range items {
		byDay[it.DayID] = append(byDay[it.DayID], it)
	}

	snap := &PlanSnapshot{PlanID: plan.ID, Name: plan.Name}
	for _, d := range days {
		ds := DaySnapshot{
			DayID: d.ID, DayIndex: d.DayIndex,
			Date: d.Date.Format("2006-01-02"), Title: d.Title,
		}
		for _, it := range byDay[d.ID] {
			is := ItemSnapshot{
				ItemID: it.ID, Type: it.Type, Title: it.Title,
				StartTime: it.StartTime, EndTime: it.EndTime,
			}
			if it.POIID != nil {
				is.POIID = *it.POIID
			}
			if it.CostAmount != nil {
				is.Cost = *it.CostAmount
			}
			ds.Items = append(ds.Items, is)
		}
		snap.Days = append(snap.Days, ds)
	}
	return snap, nil
}

// filterDiffs drops any diff whose item_id is not in this plan, and any op we
// do not know how to apply.
func filterDiffs(diffs []ItemDiff, plan *PlanSnapshot) []ItemDiff {
	known := map[string]bool{}
	for _, d := range plan.Days {
		for _, it := range d.Items {
			known[it.ItemID] = true
		}
	}

	validOps := map[string]bool{"add": true, "update": true, "move": true, "remove": true}
	out := []ItemDiff{}
	for _, d := range diffs {
		if !validOps[d.Op] {
			continue
		}
		if d.Op != "add" && !known[d.ItemID] {
			continue
		}
		out = append(out, d)
	}
	return out
}

// runNormalize turns free-text wishes into tags plus a poi_id when the text
// names a place we already have (A3.3). Everything it writes is a hint for
// coverage matching, never a decision.
func (p *pipeline) runNormalize(ctx context.Context, job jobs.Job) error {
	c, err := p.gather(ctx, job.TripID)
	if err != nil {
		_ = p.aiJobs.Fail(ctx, job.ID, err.Error())
		return err
	}

	pending := []models.WishlistItem{}
	for _, w := range c.Wishes {
		if len(w.Tags) == 0 || string(w.Tags) == "null" || string(w.Tags) == "[]" {
			pending = append(pending, w)
		}
	}
	if len(pending) == 0 {
		p.finish(ctx, job.ID, "", Usage{}, map[string]any{"normalized": 0})
		return nil
	}

	p.step(ctx, job, "normalizing")

	type wishIn struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	list := make([]wishIn, 0, len(pending))
	texts := make([]string, 0, len(pending))
	for _, w := range pending {
		list = append(list, wishIn{ID: w.ID, Text: w.Text})
		texts = append(texts, w.Text)
	}

	candidates, err := p.tools.Catalogue(ctx, c.Cities, texts, 20)
	if err != nil {
		candidates = nil
	}

	wishJSON, _ := json.MarshalIndent(list, "", "  ")
	candJSON, _ := json.MarshalIndent(candidates, "", "  ")
	user := fmt.Sprintf("# wishlist\n```json\n%s\n```\n\n# candidates\n```json\n%s\n```",
		wishJSON, candJSON)

	var result struct {
		Items []struct {
			ID    string   `json:"id"`
			Tags  []string `json:"tags"`
			POIID string   `json:"poi_id"`
		} `json:"items"`
	}
	model := p.cfg.Anthropic.ModelFast
	if model == "" {
		model = p.cfg.Anthropic.ModelPlanner
	}
	usage, err := p.completeJSON(ctx, model, MustPrompt(PromptNormalize), user, &result)
	if err != nil {
		_ = p.aiJobs.Fail(ctx, job.ID, "แปลง wishlist: "+err.Error())
		return err
	}

	known := map[string]bool{}
	for _, cand := range candidates {
		known[cand.ID] = true
	}
	byID := map[string]models.WishlistItem{}
	for _, w := range pending {
		byID[w.ID] = w
	}

	updated := 0
	for _, r := range result.Items {
		w, ok := byID[r.ID]
		if !ok {
			continue // the model invented an id
		}
		if len(r.Tags) > 0 {
			raw, _ := json.Marshal(r.Tags)
			w.Tags = datatypes.JSON(raw)
		}
		if r.POIID != "" && known[r.POIID] {
			id := r.POIID
			w.POIID = &id
		}
		if err := p.wishlists.Update(ctx, &w); err == nil {
			updated++
		}
	}

	p.finish(ctx, job.ID, "", usage, map[string]any{"normalized": updated})
	return nil
}

// ParseTicket is synchronous — the entry-point flow shows a flight preview
// before the trip exists, so there is nothing to attach a job to (M1 / A1.2).
func (p *pipeline) ParseTicket(ctx context.Context, text string) (*ParsedTicket, error) {
	if !p.client.Configured() {
		return nil, ErrNotConfigured
	}
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("ไม่มีข้อความตั๋วให้อ่าน")
	}

	model := p.cfg.Anthropic.ModelFast
	if model == "" {
		model = p.cfg.Anthropic.ModelPlanner
	}

	var out ParsedTicket
	if _, err := p.completeJSON(ctx, model, MustPrompt(PromptTicket), text, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
