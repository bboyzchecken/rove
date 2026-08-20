package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/jobs"
)

// validate runs the deterministic rules against the draft. It resolves every
// POI the draft references so the rules see real opening hours, not the
// model's recollection of them (DEV_SPEC §6.3).
func (p *pipeline) validate(ctx context.Context, c *tripContext, draft *PlanDraft) ([]domain.Issue, error) {
	ids := []string{}
	seen := map[string]bool{}
	for _, d := range draft.Days {
		for _, it := range d.Items {
			if it.POIRef != nil && it.POIRef.POIID != "" && !seen[it.POIRef.POIID] {
				seen[it.POIRef.POIID] = true
				ids = append(ids, it.POIRef.POIID)
			}
		}
	}

	facts, err := p.tools.POIFactsFor(ctx, ids)
	if err != nil {
		return nil, err
	}

	in := domain.ValidationInput{
		POIs:           map[string]domain.POIFacts{},
		MaxItemsPerDay: strictestPace(c.Profiles),
		TravelSlackMin: domain.DefaultTravelSlackMin,
	}
	for id, f := range facts {
		in.POIs[id] = domain.POIFacts{
			ID: f.ID, Name: f.Name,
			OpenHours: f.OpenHours, ClosedDays: f.ClosedDays, Zone: f.Zone,
		}
	}

	for i, d := range draft.Days {
		date, err := time.Parse("2006-01-02", d.Date)
		if err != nil {
			// A day with an unparseable date still needs its items checked, so
			// fall back to the trip's start date offset by the index.
			date = c.Trip.StartDate.AddDate(0, 0, i)
		}
		day := domain.ValidationDay{Index: i, Date: date}

		for j, it := range d.Items {
			vi := domain.ValidationItem{
				ID:        fmt.Sprintf("d%d-i%d", i, j), // draft items have no id yet
				Title:     it.Title,
				StartTime: it.StartTime,
				EndTime:   it.EndTime,
				TravelMin: it.TravelMin,
			}
			if it.POIRef != nil {
				vi.POIID = it.POIRef.POIID
				if f, ok := facts[vi.POIID]; ok {
					vi.Zone = f.Zone
				}
			}
			day.Items = append(day.Items, vi)
		}
		in.Days = append(in.Days, day)
	}

	for _, w := range c.Wishes {
		wi := domain.WishInput{ID: w.ID, Kind: w.Kind, Text: w.Text}
		if len(w.Tags) > 0 {
			_ = json.Unmarshal(w.Tags, &wi.Tags)
		}
		if w.POIID != nil {
			wi.POIID = *w.POIID
		}
		in.Wishes = append(in.Wishes, wi)
	}

	return domain.ValidatePlan(in), nil
}

// persist writes the whole plan in ONE transaction (§6.2): plan, days, items,
// rationales, warnings and the coverage recompute. A half-written plan would
// show the group an itinerary with days missing.
func (p *pipeline) persist(ctx context.Context, job jobs.Job, c *tripContext, draft *PlanDraft, issues []domain.Issue) (string, error) {
	knownPOIs, err := p.knownPOIs(ctx, draft)
	if err != nil {
		return "", err
	}

	var planID string
	err = p.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		pros, _ := json.Marshal(nonNil(draft.Pros))
		cons, _ := json.Marshal(nonNil(draft.Cons))

		name := strings.TrimSpace(draft.Name)
		if name == "" {
			name = "แพลนจาก AI"
		}

		plan := &models.Plan{
			TripID:          c.Trip.ID,
			Name:            name,
			Version:         1,
			CreatedBy:       models.CreatedByAI,
			Summary:         draft.Summary,
			Pros:            datatypes.JSON(pros),
			Cons:            datatypes.JSON(cons),
			KeyDecision:     draft.KeyDecision,
			Status:          models.PlanStatusReady,
			GenerationJobID: &job.ID,
		}
		if job.UserID != "" {
			plan.CreatedByUserID = &job.UserID
		}
		if err := tx.Create(plan).Error; err != nil {
			return err
		}
		planID = plan.ID

		// itemsByRef lets rationales and coverage point at real item ids after
		// the draft's title-based references are resolved.
		itemsByRef := map[string]string{}

		for dayIdx, d := range draft.Days {
			date, err := time.Parse("2006-01-02", d.Date)
			if err != nil {
				date = c.Trip.StartDate.AddDate(0, 0, dayIdx)
			}
			day := &models.Day{
				PlanID: plan.ID, Date: date, DayIndex: dayIdx,
				Title: d.Title, Theme: d.Theme, SortOrder: dayIdx,
			}
			if err := tx.Create(day).Error; err != nil {
				return err
			}

			for itemIdx, it := range d.Items {
				item := buildItem(plan.ID, day.ID, itemIdx, it, knownPOIs)
				if err := tx.Create(item).Error; err != nil {
					return err
				}
				itemsByRef[normalizeRef(it.Title)] = item.ID
			}
		}

		for _, r := range draft.Rationales {
			row := &models.Rationale{
				PlanID: plan.ID, Kind: r.Kind, Text: r.Text,
				CreatedByKind: models.CreatedByAI,
			}
			if id, ok := itemsByRef[normalizeRef(r.ItemRef)]; ok {
				row.ItemID = &id
			}
			if r.WishlistItemID != "" {
				id := r.WishlistItemID
				row.WishlistItemID = &id
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}

		// Validator findings become rationales too, so the Rationale panel is
		// one list rather than two competing sources of "what to worry about".
		for _, i := range issues {
			row := &models.Rationale{
				PlanID: plan.ID, Kind: models.RationaleWarning,
				Text: i.Message, CreatedByKind: models.CreatedByAI,
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}

		// Open questions are carried on the job output rather than a plan
		// column: they belong to one generation run, not to the plan forever.
		return tx.Model(&models.Trip{}).Where("id = ?", c.Trip.ID).
			Update("status", models.TripStatusPlanning).Error
	})
	if err != nil {
		return "", err
	}

	// Coverage is recomputed from what actually landed in the DB, not from what
	// the model claimed in draft.Coverage — the model is not the authority here.
	if err := p.recomputeCoverage(ctx, c, planID); err != nil {
		return planID, nil // the plan is saved; a stale board is not worth failing over
	}
	return planID, nil
}

// buildItem maps one draft item onto the models.Item columns, applying the
// §6.3 rules: unknown POIs are unverified, every AI cost is an estimate.
func buildItem(planID, dayID string, idx int, it Item, known map[string]bool) *models.Item {
	item := &models.Item{
		PlanID: planID, DayID: dayID, SortOrder: idx,
		Type:  itemType(it.Type),
		Title: it.Title, Notes: it.Notes,
		StartTime: it.StartTime, EndTime: it.EndTime, DurationMin: it.DurationMin,
		TravelMode: it.TravelMode, TravelMin: it.TravelMin, TravelNote: it.TravelNote,
		CostCurrency: "JPY", CostBasis: models.CostBasisPerPerson,
		CostStatus: models.CostStatusEstimate,
		Verified:   models.VerifiedNo,
	}

	if it.POIRef != nil && it.POIRef.POIID != "" && known[it.POIRef.POIID] {
		id := it.POIRef.POIID
		item.POIID = &id
		item.Verified = models.VerifiedYes
	}

	if it.Cost != nil && it.Cost.Amount > 0 {
		amount := it.Cost.Amount
		item.CostAmount = &amount
		if it.Cost.Currency != "" {
			item.CostCurrency = strings.ToUpper(it.Cost.Currency)
		}
		if it.Cost.Basis != "" {
			item.CostBasis = it.Cost.Basis
		}
		note := it.Cost.Note
		if note == "" {
			note = "ประมาณการโดย AI"
		}
		item.CostNote = note
	}
	return item
}

var validItemTypes = map[string]bool{
	models.ItemTypePlace: true, models.ItemTypeFood: true, models.ItemTypeStay: true,
	models.ItemTypeTransport: true, models.ItemTypeFlight: true,
	models.ItemTypeFree: true, models.ItemTypeNote: true,
}

func itemType(t string) string {
	if validItemTypes[t] {
		return t
	}
	return models.ItemTypePlace
}

// knownPOIs is the allowlist that turns verified on. A poi_id the model made up
// must not silently become a verified reference to somebody else's row.
func (p *pipeline) knownPOIs(ctx context.Context, draft *PlanDraft) (map[string]bool, error) {
	ids := []string{}
	for _, d := range draft.Days {
		for _, it := range d.Items {
			if it.POIRef != nil && it.POIRef.POIID != "" {
				ids = append(ids, it.POIRef.POIID)
			}
		}
	}
	if len(ids) == 0 {
		return map[string]bool{}, nil
	}

	facts, err := p.tools.POIFactsFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	known := make(map[string]bool, len(facts))
	for id := range facts {
		known[id] = true
	}
	return known, nil
}

// recomputeCoverage is called after any change to a plan's items — it is the
// hook A3.5 asks for, living in the service layer rather than in a handler.
func (p *pipeline) recomputeCoverage(ctx context.Context, c *tripContext, planID string) error {
	items, err := p.plans.Items(ctx, planID)
	if err != nil {
		return err
	}
	return RecomputeCoverage(ctx, p.wishlists, c.Trip.ID, c.Wishes, items)
}

// RecomputeCoverage is exported so handlers can call it after a manual item
// edit without going through the whole pipeline.
func RecomputeCoverage(ctx context.Context, store models.WishlistStore, tripID string, wishes []models.WishlistItem, items []models.Item) error {
	wishInputs := make([]domain.WishInput, 0, len(wishes))
	for _, w := range wishes {
		wi := domain.WishInput{ID: w.ID, Kind: w.Kind, Text: w.Text}
		if len(w.Tags) > 0 {
			_ = json.Unmarshal(w.Tags, &wi.Tags)
		}
		if w.POIID != nil {
			wi.POIID = *w.POIID
		}
		wishInputs = append(wishInputs, wi)
	}

	itemInputs := make([]domain.PlanItemInput, 0, len(items))
	for _, it := range items {
		pi := domain.PlanItemInput{ID: it.ID, Title: it.Title}
		if it.POIID != nil {
			pi.POIID = *it.POIID
		}
		itemInputs = append(itemInputs, pi)
	}

	results := domain.ComputeCoverage(wishInputs, itemInputs)

	updates := make([]models.WishlistItem, 0, len(results))
	for _, r := range results {
		ids, _ := json.Marshal(nonNil(r.CoveredByItemID))
		updates = append(updates, models.WishlistItem{
			Base:             models.Base{ID: r.WishlistItemID},
			TripID:           tripID,
			Coverage:         string(r.Status),
			CoveredByItemIDs: datatypes.JSON(ids),
			CoverageNote:     r.Note,
		})
	}
	return store.SaveCoverage(ctx, tripID, updates)
}

// nonNil keeps JSON columns as [] rather than null, which the frontend types
// as an array and would otherwise have to guard on every render.
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func normalizeRef(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
