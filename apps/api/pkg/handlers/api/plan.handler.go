package api

import (
	"context"
	"encoding/json"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerPlanRoutes covers plans, days and the validate endpoint
// (DEV_SPEC §5.5). Routes addressed by :planId resolve their trip first via
// ResolveTrip so they run the identical membership check.
func (s *Server) registerPlanRoutes(v1, trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	editor := s.TripRoleMiddleware(models.TripRoleEditor)

	trips.GET("/:tripId/plans", s.handleListPlans, viewer)
	trips.POST("/:tripId/plans", s.handleCreatePlan, editor)

	plans := v1.Group("/plans", s.JwtMiddleware)
	planViewer := s.ResolveTrip("planId", models.TripRoleViewer, s.planTrip)
	planEditor := s.ResolveTrip("planId", models.TripRoleEditor, s.planTrip)
	planOwner := s.ResolveTrip("planId", models.TripRoleOwner, s.planTrip)

	plans.GET("/:planId", s.handleGetPlan, planViewer)
	plans.PATCH("/:planId", s.handleUpdatePlan, planEditor)
	plans.DELETE("/:planId", s.handleDeletePlan, planEditor)
	plans.POST("/:planId/freeze", s.handleFreezePlan, planOwner)
	plans.POST("/:planId/snapshot", s.handleSnapshotPlan, planEditor)
	plans.GET("/:planId/validate", s.handleValidatePlan, planViewer)
	plans.POST("/:planId/days", s.handleCreateDay, planEditor)
	plans.POST("/:planId/items", s.handleCreateItem, planEditor)
}

func (s *Server) handleListPlans(c echo.Context) error {
	plans, err := s.plans.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "อ่านรายการแพลนไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": plans})
}

type createPlanRequest struct {
	Name string `json:"name" validate:"omitempty,max=200"`
}

// handleCreatePlan makes an empty plan with one day per trip day, so a group
// that would rather not use the AI still has something to drag items onto.
func (s *Server) handleCreatePlan(c echo.Context) error {
	var req createPlanRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	plan := &models.Plan{
		TripID:          tripID,
		Name:            orDefaultString(req.Name, "แพลนของเรา"),
		Version:         1,
		CreatedBy:       models.CreatedByUser,
		CreatedByUserID: &userID,
		Status:          models.PlanStatusReady,
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(plan).Error; err != nil {
			return err
		}
		if trip.StartDate == nil || trip.EndDate == nil {
			return nil
		}
		for i := 0; i < trip.Days(); i++ {
			date := trip.StartDate.AddDate(0, 0, i)
			day := &models.Day{
				PlanID: plan.ID, Date: date, DayIndex: i, SortOrder: i,
			}
			if err := tx.Create(day).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return request.Internal(c, "สร้างแพลนไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPlanGenerated,
		EventType:  events.TypePlanUpdated,
		TargetType: "plan", TargetID: plan.ID,
	})
	return request.Created(c, plan)
}

// PlanDetail is the single payload the Plan tab needs (A5.2): days, items,
// rationales and warnings in one request, so opening the editor is one fetch.
type PlanDetail struct {
	Plan       *models.Plan        `json:"plan"`
	Days       []DayDetail         `json:"days"`
	Rationales []models.Rationale  `json:"rationales"`
	Warnings   []domain.Issue      `json:"warnings"`
	POIs       map[string]poiBrief `json:"pois"`
}

type DayDetail struct {
	models.Day
	Items []models.Item `json:"items"`
}

// poiBrief is what an item card renders next to its title.
type poiBrief struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	City     string   `json:"city"`
	Area     string   `json:"area"`
	Category string   `json:"category"`
	ImageURL string   `json:"image_url"`
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
}

func (s *Server) handleGetPlan(c echo.Context) error {
	detail, err := s.planDetail(c.Request().Context(), request.TripID(c), c.Param("planId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลน")
	}
	return request.OK(c, detail)
}

func (s *Server) planDetail(ctx context.Context, tripID, planID string) (*PlanDetail, error) {
	plan, err := s.plans.Get(ctx, tripID, planID)
	if err != nil {
		return nil, err
	}
	days, err := s.plans.Days(ctx, planID)
	if err != nil {
		return nil, err
	}
	items, err := s.plans.Items(ctx, planID)
	if err != nil {
		return nil, err
	}
	rationales, _ := s.plans.Rationales(ctx, planID)

	byDay := map[string][]models.Item{}
	poiIDs := []string{}
	for _, it := range items {
		byDay[it.DayID] = append(byDay[it.DayID], it)
		if it.POIID != nil {
			poiIDs = append(poiIDs, *it.POIID)
		}
	}

	detail := &PlanDetail{
		Plan:       plan,
		Days:       make([]DayDetail, 0, len(days)),
		Rationales: rationales,
		POIs:       map[string]poiBrief{},
	}
	for _, d := range days {
		list := byDay[d.ID]
		if list == nil {
			list = []models.Item{}
		}
		detail.Days = append(detail.Days, DayDetail{Day: d, Items: list})
	}

	if pois, err := s.pois.ListByIDs(ctx, poiIDs); err == nil {
		for _, p := range pois {
			name := p.NameTH
			if name == "" {
				name = p.NameEN
			}
			detail.POIs[p.ID] = poiBrief{
				ID: p.ID, Name: name, City: p.City, Area: p.Area,
				Category: p.Category, ImageURL: p.ImageURL, Lat: p.Lat, Lng: p.Lng,
			}
		}
	}

	issues, err := s.validatePlan(ctx, tripID, planID)
	if err == nil {
		detail.Warnings = issues
	} else {
		detail.Warnings = []domain.Issue{}
	}
	return detail, nil
}

type updatePlanRequest struct {
	Name        *string `json:"name" validate:"omitempty,max=200"`
	Summary     *string `json:"summary" validate:"omitempty,max=4000"`
	KeyDecision *string `json:"key_decision" validate:"omitempty,max=255"`
}

func (s *Server) handleUpdatePlan(c echo.Context) error {
	var req updatePlanRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	plan, err := s.plans.Get(ctx, request.TripID(c), c.Param("planId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลน")
	}

	if req.Name != nil {
		plan.Name = *req.Name
	}
	if req.Summary != nil {
		plan.Summary = *req.Summary
	}
	if req.KeyDecision != nil {
		plan.KeyDecision = *req.KeyDecision
	}

	if err := s.plans.Update(ctx, plan); err != nil {
		return request.Internal(c, "บันทึกแพลนไม่สำเร็จ")
	}

	s.emit(c, plan.TripID, emitOpts{
		Action:     models.ActionPlanUpdated,
		EventType:  events.TypePlanUpdated,
		TargetType: "plan", TargetID: plan.ID,
	})
	return request.OK(c, plan)
}

func (s *Server) handleDeletePlan(c echo.Context) error {
	tripID := request.TripID(c)
	err := s.plans.Delete(c.Request().Context(), tripID, c.Param("planId"))
	if err != nil {
		return request.Internal(c, "ลบแพลนไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPlanUpdated,
		EventType:  events.TypePlanUpdated,
		TargetType: "plan", TargetID: c.Param("planId"),
	})
	return request.NoContent(c)
}

// handleFreezePlan marks the plan the group agreed on. It is owner-only because
// it also flips the trip's status.
func (s *Server) handleFreezePlan(c echo.Context) error {
	tripID := request.TripID(c)
	planID := c.Param("planId")

	if err := s.plans.Freeze(c.Request().Context(), tripID, planID); err != nil {
		return request.Internal(c, "ล็อกแพลนไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPlanFrozen,
		EventType:  events.TypePlanUpdated,
		TargetType: "plan", TargetID: planID,
	})
	return request.OK(c, map[string]any{"plan_id": planID, "is_final": true})
}

func (s *Server) handleSnapshotPlan(c echo.Context) error {
	err := s.items.SnapshotPlan(c.Request().Context(), c.Param("planId"), request.UserID(c))
	if err != nil {
		return request.Internal(c, "บันทึกเวอร์ชันไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"snapshot_at": time.Now().UTC()})
}

func (s *Server) handleValidatePlan(c echo.Context) error {
	issues, err := s.validatePlan(c.Request().Context(), request.TripID(c), c.Param("planId"))
	if err != nil {
		return request.Internal(c, "ตรวจแพลนไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{
		"issues":     issues,
		"has_errors": domain.HasErrors(issues),
	})
}

// validatePlan runs the same deterministic rules the AI pipeline runs, against
// the persisted plan. A hand-edited plan is checked exactly like a generated
// one (DEV_SPEC §6.3).
func (s *Server) validatePlan(ctx context.Context, tripID, planID string) ([]domain.Issue, error) {
	days, err := s.plans.Days(ctx, planID)
	if err != nil {
		return nil, err
	}
	items, err := s.plans.Items(ctx, planID)
	if err != nil {
		return nil, err
	}
	profiles, _ := s.profiles.ListByTrip(ctx, tripID)
	wishes, _ := s.wishlists.ListByTrip(ctx, tripID)

	byDay := map[string][]models.Item{}
	poiIDs := []string{}
	for _, it := range items {
		byDay[it.DayID] = append(byDay[it.DayID], it)
		if it.POIID != nil {
			poiIDs = append(poiIDs, *it.POIID)
		}
	}

	facts := map[string]domain.POIFacts{}
	zoneByPOI := map[string]string{}
	if pois, err := s.pois.ListByIDs(ctx, poiIDs); err == nil {
		for _, p := range pois {
			f := domain.POIFacts{ID: p.ID, Name: p.NameTH, Zone: p.ZoneKey()}
			if f.Name == "" {
				f.Name = p.NameEN
			}
			if len(p.OpenHours) > 0 {
				_ = json.Unmarshal(p.OpenHours, &f.OpenHours)
			}
			if len(p.ClosedDays) > 0 {
				_ = json.Unmarshal(p.ClosedDays, &f.ClosedDays)
			}
			facts[p.ID] = f
			zoneByPOI[p.ID] = f.Zone
		}
	}

	in := domain.ValidationInput{
		POIs:           facts,
		MaxItemsPerDay: strictestPace(profiles),
		TravelSlackMin: domain.DefaultTravelSlackMin,
	}
	for _, d := range days {
		day := domain.ValidationDay{Index: d.DayIndex, Date: d.Date}
		for _, it := range byDay[d.ID] {
			vi := domain.ValidationItem{
				ID: it.ID, Title: it.Title,
				StartTime: it.StartTime, EndTime: it.EndTime,
				TravelMin: it.TravelMin,
			}
			if it.POIID != nil {
				vi.POIID = *it.POIID
				vi.Zone = zoneByPOI[*it.POIID]
			}
			day.Items = append(day.Items, vi)
		}
		in.Days = append(in.Days, day)
	}
	for _, w := range wishes {
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

// strictestPace mirrors the pipeline's rule: plan for the least energetic
// member, not the average one.
func strictestPace(profiles []models.MemberProfile) int {
	limit := domain.MaxNormalItems
	for _, p := range profiles {
		if n, ok := models.MaxItemsPerDay[p.Pace]; ok && n < limit {
			limit = n
		}
	}
	return limit
}

// activePlan is the plan the trip is currently working on: the frozen one if
// there is one, otherwise the newest.
func (s *Server) activePlan(ctx context.Context, tripID string) (*models.Plan, error) {
	plans, err := s.plans.ListByTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	if len(plans) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &plans[0], nil
}

type createDayRequest struct {
	Date  string `json:"date" validate:"required,datetime=2006-01-02"`
	Title string `json:"title" validate:"omitempty,max=200"`
	Theme string `json:"theme" validate:"omitempty,max=120"`
}

func (s *Server) handleCreateDay(c echo.Context) error {
	var req createDayRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	date, err := parseDate(req.Date)
	if err != nil || date == nil {
		return request.BadRequest(c, "วันที่ไม่ถูกต้อง")
	}

	ctx := c.Request().Context()
	planID := c.Param("planId")
	existing, _ := s.plans.Days(ctx, planID)

	day := &models.Day{
		PlanID: planID, Date: *date, DayIndex: len(existing),
		Title: req.Title, Theme: req.Theme, SortOrder: len(existing),
	}
	if err := s.plans.CreateDay(ctx, day); err != nil {
		return request.Internal(c, "เพิ่มวันไม่สำเร็จ")
	}

	s.emit(c, request.TripID(c), emitOpts{
		Action:     models.ActionPlanUpdated,
		EventType:  events.TypePlanUpdated,
		TargetType: "day", TargetID: day.ID,
	})
	return request.Created(c, day)
}
