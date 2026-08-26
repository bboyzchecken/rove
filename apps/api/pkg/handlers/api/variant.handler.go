package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Plan variants & compare (M6 — A6.x).
//
// A variant is a read-only candidate itinerary: it is compared, voted on and
// adopted — never edited in place. Adopting replaces the live plan through the
// same path an AI draft takes, and freezing locks the room's plan once the
// group has decided.
func (s *Server) registerVariantRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)
	owner := s.TripRoleMiddleware(models.TripRoleOwner)

	g.GET("/:tripId/variants", s.handleListVariants, view)
	g.POST("/:tripId/variants", s.handleForkVariant, edit)
	g.POST("/:tripId/variants/generate", s.handleGenerateVariants, edit)
	g.DELETE("/:tripId/variants/:variantId", s.handleDeleteVariant, edit)
	g.POST("/:tripId/variants/:variantId/vote", s.handleVoteVariant, edit)
	g.POST("/:tripId/variants/:variantId/adopt", s.handleAdoptVariant, owner)

	// A6.4 — freeze. Owner-only: "ตกลงตามนี้" is the owner's call to make.
	g.POST("/:tripId/plan/freeze", s.handleFreezePlan, owner)
	g.DELETE("/:tripId/plan/freeze", s.handleUnfreezePlan, owner)

	// A6.5 — the conflict check that runs before anyone burns a draft credit.
	g.GET("/:tripId/conflicts", s.handleTripConflicts, view)
}

/* ------------------------------------------------------------------ DTOs -- */

type variantVotesDTO struct {
	Up   int `json:"up"`
	Down int `json:"down"`
	Mine int `json:"mine"`
}

type variantDTO struct {
	ID           string                `json:"id"`
	Label        string                `json:"label"`
	KeyDecision  string                `json:"key_decision"`
	Summary      string                `json:"summary"`
	Source       string                `json:"source"`
	CreatedBy    string                `json:"created_by"`
	CreatedAt    string                `json:"created_at"`
	FromDayIndex int                   `json:"from_day_index"`
	Pros         []string              `json:"pros"`
	Cons         []string              `json:"cons"`
	Metrics      domain.VariantMetrics `json:"metrics"`
	Votes        variantVotesDTO       `json:"votes"`
	Days         []planDayDTO          `json:"days"`
}

type variantListDTO struct {
	// The live plan's numbers, so the compare table has its baseline column.
	Current  domain.VariantMetrics `json:"current"`
	Frozen   bool                  `json:"frozen"`
	Variants []variantDTO          `json:"variants"`
}

/* ------------------------------------------------------------------ list -- */

func (s *Server) handleListVariants(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	variants, err := s.plans.ListVariants(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดตัวเลือกแพลนไม่สำเร็จ")
	}
	wishes := s.wishInputsOf(ctx, tripID)

	// Votes for every variant in one query rather than one per row.
	votesByTarget := map[string][]models.Vote{}
	if all, err := s.collab.ListTripVotes(ctx, tripID); err == nil {
		for _, v := range all {
			if v.TargetType == models.TargetVariant {
				votesByTarget[v.TargetID] = append(votesByTarget[v.TargetID], v)
			}
		}
	}

	out := variantListDTO{
		Current:  s.currentPlanMetrics(ctx, *trip, wishes),
		Frozen:   trip.Status == models.TripStatusFinal,
		Variants: make([]variantDTO, 0, len(variants)),
	}

	for _, variant := range variants {
		dto, err := s.variantDTOOf(variant, *trip, wishes, votesByTarget[variant.ID], userID)
		if err != nil {
			continue
		}
		out.Variants = append(out.Variants, dto)
	}

	return c.JSON(http.StatusOK, out)
}

func (s *Server) variantDTOOf(
	variant models.PlanVariant,
	trip models.Trip,
	wishes []domain.WishInput,
	votes []models.Vote,
	userID string,
) (variantDTO, error) {
	var days []ai.DraftDay
	if err := json.Unmarshal(variant.Days, &days); err != nil {
		return variantDTO{}, err
	}

	tally := variantVotesDTO{}
	for _, v := range votes {
		switch {
		case v.Value > 0:
			tally.Up++
		case v.Value < 0:
			tally.Down++
		}
		if v.UserID == userID {
			tally.Mine = v.Value
		}
	}

	return variantDTO{
		ID:           variant.ID,
		Label:        variant.Label,
		KeyDecision:  variant.KeyDecision,
		Summary:      variant.Summary,
		Source:       variant.Source,
		CreatedBy:    variant.CreatedBy,
		CreatedAt:    variant.CreatedAt.UTC().Format(time.RFC3339),
		FromDayIndex: variant.FromDayIndex,
		Pros:         jsonStrings(toJSONRaw(variant.Pros)),
		Cons:         jsonStrings(toJSONRaw(variant.Cons)),
		Metrics:      variantMetricsOf(days, wishes, trip),
		Votes:        tally,
		Days:         draftDayDTOs(days, "v-"+variant.ID),
	}, nil
}

func variantMetricsOf(days []ai.DraftDay, wishes []domain.WishInput, trip models.Trip) domain.VariantMetrics {
	inputs := make([]domain.VariantItemInput, 0, 32)
	for i, day := range days {
		for j, item := range day.Items {
			inputs = append(inputs, domain.VariantItemInput{
				ID:        fmt.Sprintf("d%d-i%d", i, j),
				DayIndex:  i + 1,
				Title:     item.Title,
				POIID:     derefString(item.POIID),
				Zone:      item.Area,
				StartTime: item.StartTime,
				EndTime:   item.EndTime,
				OpenHours: item.OpenHours,
				CostJPY:   item.CostJPY,
				TravelMin: item.TravelMin,
			})
		}
	}
	return domain.ComputeVariantMetrics(inputs, wishes, trip.PartySize, tripFxRate(trip))
}

// currentPlanMetrics scores the live plan with exactly the same maths, so the
// baseline column of the compare table is not flattered.
func (s *Server) currentPlanMetrics(ctx contextT, trip models.Trip, wishes []domain.WishInput) domain.VariantMetrics {
	days, _ := s.plans.ListDays(ctx, trip.ID)
	items, _ := s.plans.ListItems(ctx, trip.ID)

	dayIndex := map[string]int{}
	for _, day := range days {
		dayIndex[day.ID] = day.DayIndex
	}

	inputs := make([]domain.VariantItemInput, 0, len(items))
	for _, item := range items {
		input := domain.VariantItemInput{
			ID:        item.ID,
			DayIndex:  dayIndex[item.DayID],
			Title:     item.Title,
			POIID:     derefString(item.POIID),
			Zone:      item.Area,
			StartTime: item.StartTime,
			EndTime:   item.EndTime,
			OpenHours: item.OpenHours,
		}
		if item.CostJPY != nil {
			input.CostJPY = *item.CostJPY
		}
		if item.TravelMin != nil {
			input.TravelMin = *item.TravelMin
		}
		inputs = append(inputs, input)
	}
	return domain.ComputeVariantMetrics(inputs, wishes, trip.PartySize, tripFxRate(trip))
}

func (s *Server) wishInputsOf(ctx contextT, tripID string) []domain.WishInput {
	wishes, err := s.wishlist.ListByTrip(ctx, tripID)
	if err != nil {
		return nil
	}
	out := make([]domain.WishInput, 0, len(wishes))
	for _, w := range wishes {
		out = append(out, domain.WishInput{
			ID:    w.ID,
			Kind:  w.Kind,
			Text:  w.Title,
			Tags:  jsonStrings(toJSONRaw(w.Tags)),
			POIID: derefString(w.POIID),
		})
	}
	return out
}

/* ------------------------------------------------------------------ fork -- */

type forkVariantRequest struct {
	Label        string `json:"label"`
	KeyDecision  string `json:"key_decision"`
	FromDayIndex int    `json:"from_day_index"`
}

// handleForkVariant snapshots the live plan as a named candidate (A6.1), so
// the group can keep editing the room while an alternative sits safely on ice.
func (s *Server) handleForkVariant(c echo.Context) error {
	var req forkVariantRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	days, err := s.plans.ListDays(ctx, tripID)
	if err != nil || len(days) == 0 {
		return request.BadRequest(c, "ยังไม่มีแพลนให้แตกตัวเลือก — ร่างแพลนก่อน")
	}
	items, err := s.plans.ListItems(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดแพลนไม่สำเร็จ")
	}

	byDay := map[string][]models.PlanItem{}
	for _, item := range items {
		byDay[item.DayID] = append(byDay[item.DayID], item)
	}

	draftDays := make([]ai.DraftDay, 0, len(days))
	for _, day := range days {
		draftDay := ai.DraftDay{
			Date:        day.Date,
			Label:       day.Label,
			City:        day.City,
			WeatherIcon: day.WeatherIcon,
			WeatherText: day.WeatherText,
		}
		if day.WeatherHigh != nil {
			draftDay.WeatherHigh = *day.WeatherHigh
		}
		if day.WeatherLow != nil {
			draftDay.WeatherLow = *day.WeatherLow
		}
		for _, item := range byDay[day.ID] {
			draftItem := ai.DraftItem{
				Type:       item.Type,
				Title:      item.Title,
				Area:       item.Area,
				StartTime:  item.StartTime,
				EndTime:    item.EndTime,
				TravelMode: item.TravelMode,
				OpenHours:  item.OpenHours,
				POIID:      item.POIID,
				ForUsers:   jsonStrings(toJSONRaw(item.ForUsers)),
				Note:       item.Note,
				Bookable:   item.Bookable,
			}
			if item.CostJPY != nil {
				draftItem.CostJPY = *item.CostJPY
			}
			if item.TravelMin != nil {
				draftItem.TravelMin = *item.TravelMin
			}
			draftDay.Items = append(draftDay.Items, draftItem)
		}
		draftDays = append(draftDays, draftDay)
	}

	raw, err := json.Marshal(draftDays)
	if err != nil {
		return request.Internal(c, "บันทึกตัวเลือกไม่สำเร็จ")
	}

	variant := &models.PlanVariant{
		TripID:       tripID,
		Label:        orDefault(req.Label, "ตัวเลือกใหม่"),
		KeyDecision:  req.KeyDecision,
		Source:       models.VariantSourceFork,
		CreatedBy:    userID,
		FromDayIndex: req.FromDayIndex,
		Days:         raw,
	}
	if err := s.plans.CreateVariant(ctx, variant); err != nil {
		return request.Internal(c, "บันทึกตัวเลือกไม่สำเร็จ")
	}

	s.track(c, tripID, "เก็บแพลนปัจจุบันเป็นตัวเลือก \""+variant.Label+"\"",
		events.TypePlanUpdated, "variant", variant.ID)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดทริปไม่สำเร็จ")
	}
	dto, err := s.variantDTOOf(*variant, *trip, s.wishInputsOf(ctx, tripID), nil, userID)
	if err != nil {
		return request.Internal(c, "อ่านตัวเลือกไม่สำเร็จ")
	}
	return c.JSON(http.StatusCreated, dto)
}

/* ------------------------------------------------------------- generate -- */

type generateVariantsRequest struct {
	Count int    `json:"count"`
	Brief string `json:"brief"`
}

// handleGenerateVariants asks the AI for 2–3 candidates in one job (A6.2).
// Each candidate is a full draft, so each costs one draft credit — the quota
// check happens up front, all-or-nothing.
func (s *Server) handleGenerateVariants(c echo.Context) error {
	var req generateVariantsRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Count < 2 {
		req.Count = 2
	}
	if req.Count > 3 {
		req.Count = 3
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	if trip.StartDate == nil || trip.EndDate == nil {
		return request.BadRequest(c, "ล็อควันเดินทางก่อนถึงจะร่างแพลนได้")
	}
	if trip.Status == models.TripStatusFinal {
		return request.Error(c, http.StatusConflict, "แพลนถูกสรุปแล้ว — ปลดล็อกก่อนถึงจะร่างเพิ่มได้")
	}

	credits, err := s.aiJobs.Credits(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดโควตาไม่สำเร็จ")
	}
	if credits.Used+req.Count > credits.Included+credits.Extra {
		return request.Error(c, http.StatusPaymentRequired,
			fmt.Sprintf("ร่าง %d แบบใช้ %d สิทธิ์ แต่โควตาเหลือไม่พอ — ซื้อเพิ่มก่อน", req.Count, req.Count))
	}
	if err := ai.CheckDailyCap(ctx, s.aiJobs, s.cfg.Anthropic.DailyCostCapUSD); err != nil {
		return request.Error(c, http.StatusTooManyRequests, err.Error())
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	wishes, err := s.wishlist.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดที่อยากไปไม่สำเร็จ")
	}
	members := make([]models.User, 0, len(roster.members))
	for _, m := range roster.members {
		if u, ok := roster.users[m.UserID]; ok {
			members = append(members, u)
		}
	}

	job := models.AIJob{
		Base:   models.Base{ID: uuid.NewString()},
		TripID: tripID,
		UserID: userID,
		Kind:   models.AIKindVariants,
		Status: models.AIQueued,
		Step:   "เข้าคิว",
		Input:  toDatatypesJSON(req),
	}
	if err := s.aiJobs.Create(ctx, &job); err != nil {
		return request.Internal(c, "สร้างงานร่างแพลนไม่สำเร็จ")
	}

	credits.Used += req.Count
	if err := s.aiJobs.SaveCredits(ctx, credits); err != nil {
		return request.Internal(c, "บันทึกโควตาไม่สำเร็จ")
	}

	s.aiRunner.EnqueueVariants(job, ai.GenerateInput{
		Trip:    *trip,
		Members: members,
		Wishes:  wishes,
		Brief:   req.Brief,
	}, req.Count)

	s.track(c, tripID, fmt.Sprintf("ให้ AI ร่างแพลน %d แบบมาเทียบกัน", req.Count),
		events.TypeAIProgress, "ai_job", job.ID)
	return c.JSON(http.StatusAccepted, toAIJobDTO(job))
}

/* ------------------------------------------------------ vote / adopt ----- */

type voteVariantRequest struct {
	Value int `json:"value" validate:"oneof=-1 0 1"`
}

func (s *Server) handleVoteVariant(c echo.Context) error {
	var req voteVariantRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	variantID := c.Param("variantId")

	if _, err := s.plans.GetVariant(ctx, tripID, variantID); err != nil {
		return request.NotFound(c, "ไม่พบตัวเลือกนี้")
	}

	err := s.collab.SetVote(ctx, &models.Vote{
		TripID:     tripID,
		TargetType: models.TargetVariant,
		TargetID:   variantID,
		UserID:     request.UserID(c),
		Value:      req.Value,
		VotedAt:    time.Now().UTC(),
	})
	if err != nil {
		return request.Internal(c, "บันทึกโหวตไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePlanUpdated, "variant", variantID)

	votes, _ := s.collab.ListVotes(ctx, tripID, models.TargetVariant, variantID)
	tally := variantVotesDTO{}
	for _, v := range votes {
		switch {
		case v.Value > 0:
			tally.Up++
		case v.Value < 0:
			tally.Down++
		}
		if v.UserID == request.UserID(c) {
			tally.Mine = v.Value
		}
	}
	return c.JSON(http.StatusOK, tally)
}

// handleAdoptVariant writes the chosen candidate over the live plan. Owner
// only, because it replaces work: the safety net is that the previous plan can
// itself be forked into a variant first — the UI does exactly that.
func (s *Server) handleAdoptVariant(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	if trip.Status == models.TripStatusFinal {
		return request.Error(c, http.StatusConflict, "แพลนถูกสรุปแล้ว — ปลดล็อกก่อนถึงจะสลับแพลนได้")
	}

	variant, err := s.plans.GetVariant(ctx, tripID, c.Param("variantId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบตัวเลือกนี้")
	}

	var draftDays []ai.DraftDay
	if err := json.Unmarshal(variant.Days, &draftDays); err != nil {
		return request.Internal(c, "อ่านตัวเลือกไม่สำเร็จ")
	}

	plan, err := s.plans.EnsurePlan(ctx, tripID, userID)
	if err != nil {
		return request.Internal(c, "เตรียมแพลนไม่สำเร็จ")
	}

	days, items := draftDaysToModels(tripID, plan.ID, draftDays)
	if err := s.plans.ReplaceDays(ctx, tripID, days, items); err != nil {
		return request.Internal(c, "สลับแพลนไม่สำเร็จ")
	}

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "สลับมาใช้แพลน \""+variant.Label+"\"",
		events.TypePlanReady, "variant", variant.ID)
	return s.handlePlanDays(c)
}

func (s *Server) handleDeleteVariant(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	variant, err := s.plans.GetVariant(ctx, tripID, c.Param("variantId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบตัวเลือกนี้")
	}
	if err := s.plans.DeleteVariant(ctx, tripID, variant.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePlanUpdated, "variant", variant.ID)
	return c.NoContent(http.StatusNoContent)
}

/* ---------------------------------------------------------------- freeze -- */

// handleFreezePlan marks the plan as settled (A6.4). Item edits, drafts and
// adoptions are refused until the owner unfreezes — "ตกลงตามนี้" has to mean
// the plan stops moving.
func (s *Server) handleFreezePlan(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	if trip.Status == models.TripStatusDone {
		return request.BadRequest(c, "ทริปจบไปแล้ว")
	}

	trip.Status = models.TripStatusFinal
	if plan, err := s.plans.GetPlan(ctx, tripID); err == nil {
		trip.FinalPlanID = &plan.ID
	}
	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "สรุปแพลนไม่สำเร็จ")
	}

	s.track(c, tripID, "สรุปแพลนแล้ว — ตกลงตามนี้ 🎉", events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, toTripDTO(*trip))
}

func (s *Server) handleUnfreezePlan(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	if trip.Status != models.TripStatusFinal {
		return request.BadRequest(c, "แพลนยังไม่ได้ถูกสรุป")
	}

	trip.Status = models.TripStatusPlanning
	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "ปลดล็อกไม่สำเร็จ")
	}

	s.track(c, tripID, "ปลดล็อกแพลนกลับมาแก้ต่อ", events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, toTripDTO(*trip))
}

// planFrozen is the write guard the item endpoints call: a settled plan does
// not move until the owner unfreezes it.
func (s *Server) planFrozen(ctx contextT, tripID string) bool {
	trip, err := s.trips.GetByID(ctx, tripID)
	return err == nil && trip.Status == models.TripStatusFinal
}

var errPlanFrozenMessage = "แพลนถูกสรุปแล้ว — เจ้าของทริปต้องปลดล็อกก่อนถึงจะแก้ได้"

// PlanUnfrozen refuses plan mutations while the plan is settled (A6.4). Runs
// after TripRoleMiddleware, so the trip id is already validated.
func (s *Server) PlanUnfrozen(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if s.planFrozen(c.Request().Context(), request.TripID(c)) {
			return request.Error(c, http.StatusConflict, errPlanFrozenMessage)
		}
		return next(c)
	}
}

/* ------------------------------------------------------------- conflicts -- */

// handleTripConflicts (A6.5) compares saved member profiles and wishes before
// a draft is generated: the model cannot satisfy a group that disagrees with
// itself, so the disagreement is surfaced to the humans first.
func (s *Server) handleTripConflicts(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	profiles, _ := s.members.ListProfiles(ctx, tripID)
	wishes, _ := s.wishlist.ListByTrip(ctx, tripID)

	nameOf := func(userID string) string {
		if u, ok := roster.users[userID]; ok && u.DisplayName != "" {
			return u.DisplayName
		}
		return "สมาชิก"
	}

	profileInputs := make([]domain.ConflictProfile, 0, len(profiles))
	for _, p := range profiles {
		profileInputs = append(profileInputs, domain.ConflictProfile{
			UserID:       p.UserID,
			Name:         nameOf(p.UserID),
			Pace:         p.Pace,
			WalkLevel:    p.WalkLevel,
			BudgetMinTHB: p.BudgetMinTHB,
			BudgetMaxTHB: p.BudgetMaxTHB,
		})
	}
	wishInputs := make([]domain.ConflictWish, 0, len(wishes))
	for _, w := range wishes {
		wishInputs = append(wishInputs, domain.ConflictWish{
			Kind:      w.Kind,
			Text:      w.Title,
			OwnerName: nameOf(w.UserID),
		})
	}

	conflicts := domain.DetectConflicts(profileInputs, wishInputs)
	if conflicts == nil {
		conflicts = []domain.Conflict{}
	}
	return c.JSON(http.StatusOK, conflicts)
}
