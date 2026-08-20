package api

import (
	"context"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerItemRoutes covers the itinerary editor's write path (DEV_SPEC §5.5).
//
//	PATCH  /items/:itemId          [editor]
//	POST   /items/:itemId/move     [editor]
//	DELETE /items/:itemId          [editor]
//	POST   /items/:itemId/undo     [editor]
//
// Item creation lives on the plan route (POST /plans/:planId/items) because a
// new item has no id to resolve a trip from yet.
func (s *Server) registerItemRoutes(v1 *echo.Group) {
	items := v1.Group("/items", s.JwtMiddleware)
	editor := s.ResolveTrip("itemId", models.TripRoleEditor, s.itemTrip)

	items.PATCH("/:itemId", s.handleUpdateItem, editor)
	items.POST("/:itemId/move", s.handleMoveItem, editor)
	items.DELETE("/:itemId", s.handleDeleteItem, editor)
	items.POST("/:itemId/undo", s.handleUndoItem, editor)
	items.GET("/:itemId/versions", s.handleItemVersions,
		s.ResolveTrip("itemId", models.TripRoleViewer, s.itemTrip))
}

type itemRequest struct {
	DayID        string   `json:"day_id" validate:"omitempty,uuid4"`
	Type         string   `json:"type" validate:"omitempty,oneof=place food stay transport flight free note"`
	POIID        *string  `json:"poi_id" validate:"omitempty,uuid4"`
	Title        string   `json:"title" validate:"required,max=200"`
	Notes        string   `json:"notes" validate:"omitempty,max=4000"`
	StartTime    string   `json:"start_time" validate:"omitempty,len=5"`
	EndTime      string   `json:"end_time" validate:"omitempty,len=5"`
	DurationMin  int      `json:"duration_min" validate:"omitempty,min=0,max=1440"`
	TravelMode   string   `json:"travel_mode" validate:"omitempty,max=20"`
	TravelMin    int      `json:"travel_min" validate:"omitempty,min=0,max=1440"`
	TravelNote   string   `json:"travel_note" validate:"omitempty,max=255"`
	CostAmount   *float64 `json:"cost_amount" validate:"omitempty,min=0"`
	CostCurrency string   `json:"cost_currency" validate:"omitempty,len=3"`
	CostBasis    string   `json:"cost_basis" validate:"omitempty,oneof=per_person per_group per_night per_unit"`
	CostStatus   string   `json:"cost_status" validate:"omitempty,oneof=estimate quoted actual paid"`
	CostNote     string   `json:"cost_note" validate:"omitempty,max=255"`
	IsPrepaid    *bool    `json:"is_prepaid"`
	Position     *int     `json:"position" validate:"omitempty,min=0"`
}

// handleCreateItem is registered on the plan group; it needs the plan id from
// the path rather than from an item lookup.
func (s *Server) handleCreateItem(c echo.Context) error {
	var req itemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.DayID == "" {
		return request.BadRequest(c, "ต้องระบุ day_id")
	}

	ctx := c.Request().Context()
	planID := c.Param("planId")

	// The day must belong to this plan, or an item could be attached to another
	// trip's day through a guessed id.
	days, err := s.plans.Days(ctx, planID)
	if err != nil {
		return request.Internal(c, "อ่านวันในแพลนไม่สำเร็จ")
	}
	if !containsDay(days, req.DayID) {
		return request.BadRequest(c, "day_id ไม่ได้อยู่ในแพลนนี้")
	}

	order, _ := s.items.NextSortOrder(ctx, req.DayID)
	item := &models.Item{
		PlanID: planID, DayID: req.DayID, SortOrder: order,
		Type:         orDefaultString(req.Type, models.ItemTypePlace),
		Title:        req.Title,
		Notes:        req.Notes,
		StartTime:    req.StartTime,
		EndTime:      req.EndTime,
		DurationMin:  req.DurationMin,
		TravelMode:   req.TravelMode,
		TravelMin:    req.TravelMin,
		TravelNote:   req.TravelNote,
		CostAmount:   req.CostAmount,
		CostCurrency: orDefaultString(req.CostCurrency, "JPY"),
		CostBasis:    orDefaultString(req.CostBasis, models.CostBasisPerPerson),
		// A person typing a price knows it better than the model did.
		CostStatus:    orDefaultString(req.CostStatus, models.CostStatusQuoted),
		CostNote:      req.CostNote,
		BookingStatus: models.BookingStatusNone,
		Verified:      models.VerifiedNo,
	}
	if req.IsPrepaid != nil {
		item.IsPrepaid = *req.IsPrepaid
	}
	if req.POIID != nil && *req.POIID != "" {
		if poi, err := s.pois.GetByID(ctx, *req.POIID); err == nil {
			item.POIID = &poi.ID
			item.Verified = models.VerifiedYes
			item.Lat, item.Lng = poi.Lat, poi.Lng
		}
	}

	if err := s.items.Create(ctx, planID, item); err != nil {
		return request.Internal(c, "เพิ่มรายการไม่สำเร็จ")
	}

	tripID := request.TripID(c)
	s.afterItemChange(c, tripID, planID)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionItemCreated,
		EventType:  events.TypeItemUpdated,
		TargetType: "item", TargetID: item.ID,
		Meta: map[string]any{"plan_id": planID},
	})
	return request.Created(c, item)
}

func (s *Server) handleUpdateItem(c echo.Context) error {
	var req itemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	planID := request.PlanID(c)

	item, err := s.items.Get(ctx, planID, c.Param("itemId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ")
	}

	item.Title = req.Title
	item.Notes = req.Notes
	item.StartTime = req.StartTime
	item.EndTime = req.EndTime
	item.DurationMin = req.DurationMin
	item.TravelMode = req.TravelMode
	item.TravelMin = req.TravelMin
	item.TravelNote = req.TravelNote
	item.CostAmount = req.CostAmount
	item.CostNote = req.CostNote
	if req.Type != "" {
		item.Type = req.Type
	}
	if req.CostCurrency != "" {
		item.CostCurrency = req.CostCurrency
	}
	if req.CostBasis != "" {
		item.CostBasis = req.CostBasis
	}
	if req.CostStatus != "" {
		item.CostStatus = req.CostStatus
	}
	if req.IsPrepaid != nil {
		item.IsPrepaid = *req.IsPrepaid
	}
	if req.POIID != nil {
		if *req.POIID == "" {
			item.POIID = nil
			item.Verified = models.VerifiedNo
		} else if poi, err := s.pois.GetByID(ctx, *req.POIID); err == nil {
			item.POIID = &poi.ID
			item.Verified = models.VerifiedYes
			item.Lat, item.Lng = poi.Lat, poi.Lng
		}
	}

	err = s.items.Update(ctx, planID, item, request.UserID(c), models.CreatedByUser)
	if err != nil {
		return request.Internal(c, "บันทึกรายการไม่สำเร็จ")
	}

	tripID := request.TripID(c)
	s.afterItemChange(c, tripID, planID)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionItemUpdated,
		EventType:  events.TypeItemUpdated,
		TargetType: "item", TargetID: item.ID,
		Meta: map[string]any{"plan_id": planID},
	})
	return request.OK(c, item)
}

type moveItemRequest struct {
	DayID    string `json:"day_id" validate:"required,uuid4"`
	Position int    `json:"position" validate:"min=0"`
}

// handleMoveItem is the drag-and-drop endpoint. The store validates that the
// target day is in the same plan and renumbers both days.
func (s *Server) handleMoveItem(c echo.Context) error {
	var req moveItemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	planID := request.PlanID(c)
	itemID := c.Param("itemId")

	err := s.items.Move(ctx, planID, itemID, req.DayID, req.Position, request.UserID(c))
	if err != nil {
		return request.BadRequest(c, "ย้ายรายการไม่สำเร็จ")
	}

	tripID := request.TripID(c)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionItemMoved,
		EventType:  events.TypeItemUpdated,
		TargetType: "item", TargetID: itemID,
		Meta: map[string]any{"plan_id": planID, "day_id": req.DayID},
	})

	detail, err := s.planDetail(ctx, tripID, planID)
	if err != nil {
		return request.OK(c, map[string]any{"moved": true})
	}
	return request.OK(c, detail)
}

func (s *Server) handleDeleteItem(c echo.Context) error {
	ctx := c.Request().Context()
	planID := request.PlanID(c)
	itemID := c.Param("itemId")

	if err := s.items.Delete(ctx, planID, itemID, request.UserID(c)); err != nil {
		return request.Internal(c, "ลบรายการไม่สำเร็จ")
	}

	tripID := request.TripID(c)
	s.afterItemChange(c, tripID, planID)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionItemDeleted,
		EventType:  events.TypeItemUpdated,
		TargetType: "item", TargetID: itemID,
		Meta: map[string]any{"plan_id": planID},
	})
	return request.NoContent(c)
}

// handleUndoItem restores the last snapshot, which also brings back a deleted
// item (W5.5).
func (s *Server) handleUndoItem(c echo.Context) error {
	ctx := c.Request().Context()
	planID := request.PlanID(c)

	restored, err := s.items.Undo(ctx, planID, c.Param("itemId"), request.UserID(c))
	if err != nil {
		return request.NotFound(c, "ไม่มีประวัติให้ย้อนกลับ")
	}

	tripID := request.TripID(c)
	s.afterItemChange(c, tripID, planID)
	s.emit(c, tripID, emitOpts{
		Action:     models.ActionItemUpdated,
		EventType:  events.TypeItemUpdated,
		TargetType: "item", TargetID: restored.ID,
		Meta: map[string]any{"plan_id": planID, "undo": true},
	})
	return request.OK(c, restored)
}

func (s *Server) handleItemVersions(c echo.Context) error {
	var versions []models.ItemVersion
	err := s.db.WithContext(c.Request().Context()).
		Where("item_id = ? AND plan_id = ?", c.Param("itemId"), request.PlanID(c)).
		Order("created_at DESC").Limit(20).Find(&versions).Error
	if err != nil {
		return request.Internal(c, "อ่านประวัติไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": versions})
}

// afterItemChange is the A3.5 hook: coverage is recomputed whenever the plan's
// items change, so the Coverage Board never lags behind the timeline.
// It is best-effort — a stale board must not fail the edit that caused it.
func (s *Server) afterItemChange(c echo.Context, tripID, planID string) {
	ctx := context.WithoutCancel(c.Request().Context())

	wishes, err := s.wishlists.ListByTrip(ctx, tripID)
	if err != nil || len(wishes) == 0 {
		return
	}
	items, err := s.plans.Items(ctx, planID)
	if err != nil {
		return
	}
	_ = ai.RecomputeCoverage(ctx, s.wishlists, tripID, wishes, items)
}

func containsDay(days []models.Day, id string) bool {
	for _, d := range days {
		if d.ID == id {
			return true
		}
	}
	return false
}
