package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Itinerary items (A5.1). Every mutation snapshots the previous state first, so
// "put that back" is always available, and re-runs validation afterwards, so a
// warning is never stale.
func (s *Server) registerItemRoutes(g *echo.Group) {
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	// PlanUnfrozen (A6.4): once the owner freezes the plan, the timeline stops
	// moving until they unfreeze it.
	g.POST("/:tripId/items", s.handleCreateItem, edit, s.PlanUnfrozen)
	g.PATCH("/:tripId/items/:itemId", s.handleUpdateItem, edit, s.PlanUnfrozen)
	g.POST("/:tripId/items/:itemId/move", s.handleMoveItem, edit, s.PlanUnfrozen)
	g.DELETE("/:tripId/items/:itemId", s.handleDeleteItem, edit, s.PlanUnfrozen)
}

type itemRequest struct {
	DayID      string   `json:"day_id"`
	Index      *int     `json:"index"`
	Type       string   `json:"type"`
	StartTime  string   `json:"start_time"`
	EndTime    string   `json:"end_time"`
	Title      string   `json:"title"`
	Area       string   `json:"area"`
	POIID      *string  `json:"poi_id"`
	CostJPY    *float64 `json:"cost_jpy"`
	TravelMin  *int     `json:"travel_minutes"`
	TravelMode string   `json:"travel_mode"`
	TravelLine string   `json:"travel_line"`
	OpenHours  string   `json:"open_hours"`
	ForUserIDs []string `json:"for_user_ids"`
	Bookable   *bool    `json:"bookable"`
	Booked     *bool    `json:"booked"`
	Note       string   `json:"note"`
}

func (s *Server) handleCreateItem(c echo.Context) error {
	var req itemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Title == "" {
		return request.BadRequest(c, "ใส่ชื่อรายการด้วย")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	dayID := req.DayID
	if dayID == "" {
		days, err := s.plans.ListDays(ctx, tripID)
		if err != nil || len(days) == 0 {
			return request.BadRequest(c, "ยังไม่มีวันในแพลนนี้")
		}
		dayID = days[0].ID
	}
	if _, err := s.plans.GetDay(ctx, tripID, dayID); err != nil {
		return request.BadRequest(c, "ไม่พบวันนี้ในแพลน")
	}

	item := &models.PlanItem{
		DayID:      dayID,
		TripID:     tripID,
		Type:       orDefault(req.Type, models.ItemPOI),
		StartTime:  orDefault(req.StartTime, "09:00"),
		EndTime:    req.EndTime,
		Title:      req.Title,
		Area:       req.Area,
		POIID:      req.POIID,
		CostJPY:    req.CostJPY,
		TravelMin:  req.TravelMin,
		TravelMode: req.TravelMode,
		TravelLine: req.TravelLine,
		OpenHours:  req.OpenHours,
		ForUsers:   jsonArray(req.ForUserIDs),
		Note:       req.Note,
	}
	if req.Bookable != nil {
		item.Bookable = *req.Bookable
	}
	if req.Booked != nil {
		item.Booked = *req.Booked
	}

	index := -1
	if req.Index != nil {
		index = *req.Index
	}
	if err := s.plans.CreateItem(ctx, item, index); err != nil {
		return request.Internal(c, "เพิ่มรายการไม่สำเร็จ")
	}

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	if fresh, err := s.plans.GetItem(ctx, tripID, item.ID); err == nil {
		item = fresh
	}

	s.track(c, tripID, "เพิ่ม \""+item.Title+"\" ลงแพลน", events.TypeItemUpdated, "item", item.ID)
	return c.JSON(http.StatusCreated, toPlanItemDTO(*item))
}

func (s *Server) handleUpdateItem(c echo.Context) error {
	var req itemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	item, err := s.plans.GetItem(ctx, tripID, c.Param("itemId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}
	s.snapshot(ctx, tripID, "update", *item, request.UserID(c))

	if req.Title != "" {
		item.Title = req.Title
	}
	if req.Type != "" {
		item.Type = req.Type
	}
	if req.StartTime != "" {
		item.StartTime = req.StartTime
	}
	if req.EndTime != "" {
		item.EndTime = req.EndTime
	}
	if req.Area != "" {
		item.Area = req.Area
	}
	if req.OpenHours != "" {
		item.OpenHours = req.OpenHours
	}
	if req.TravelMode != "" {
		item.TravelMode = req.TravelMode
	}
	if req.TravelLine != "" {
		item.TravelLine = req.TravelLine
	}
	if req.Note != "" {
		item.Note = req.Note
	}
	if req.CostJPY != nil {
		item.CostJPY = req.CostJPY
	}
	if req.TravelMin != nil {
		item.TravelMin = req.TravelMin
	}
	if req.POIID != nil {
		item.POIID = req.POIID
	}
	if req.ForUserIDs != nil {
		item.ForUsers = jsonArray(req.ForUserIDs)
	}
	if req.Bookable != nil {
		item.Bookable = *req.Bookable
	}
	if req.Booked != nil {
		item.Booked = *req.Booked
	}

	if err := s.plans.UpdateItem(ctx, item); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	if fresh, err := s.plans.GetItem(ctx, tripID, item.ID); err == nil {
		item = fresh
	}

	s.track(c, tripID, "", events.TypeItemUpdated, "item", item.ID)
	return c.JSON(http.StatusOK, toPlanItemDTO(*item))
}

type moveItemRequest struct {
	ToDayID string `json:"to_day_id" validate:"required"`
	ToIndex int    `json:"to_index"`
}

func (s *Server) handleMoveItem(c echo.Context) error {
	var req moveItemRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	itemID := c.Param("itemId")

	item, err := s.plans.GetItem(ctx, tripID, itemID)
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}
	if _, err := s.plans.GetDay(ctx, tripID, req.ToDayID); err != nil {
		return request.BadRequest(c, "ไม่พบวันปลายทาง")
	}
	s.snapshot(ctx, tripID, "move", *item, request.UserID(c))

	if err := s.plans.MoveItem(ctx, tripID, itemID, req.ToDayID, req.ToIndex); err != nil {
		return request.Internal(c, "ย้ายรายการไม่สำเร็จ")
	}

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	text := ""
	if day, err := s.plans.GetDay(ctx, tripID, req.ToDayID); err == nil {
		text = "ย้าย \"" + item.Title + "\" ไป" + orDefault(day.Label, "อีกวัน")
	}
	s.track(c, tripID, text, events.TypeItemUpdated, "item", itemID)

	return s.handlePlanDays(c)
}

func (s *Server) handleDeleteItem(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	itemID := c.Param("itemId")

	item, err := s.plans.GetItem(ctx, tripID, itemID)
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}
	s.snapshot(ctx, tripID, "delete", *item, request.UserID(c))

	if err := s.plans.DeleteItem(ctx, tripID, itemID); err != nil {
		return request.Internal(c, "ลบรายการไม่สำเร็จ")
	}

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "ลบ \""+item.Title+"\" ออกจากแพลน", events.TypeItemUpdated, "item", itemID)
	return c.NoContent(http.StatusNoContent)
}
