package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// The itinerary as a whole (A5.2): one payload with days, items and warnings.
func (s *Server) registerPlanRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/plan/days", s.handlePlanDays, view)
	g.POST("/:tripId/plan/revalidate", s.handleRevalidatePlan, edit)
	g.GET("/:tripId/plan/versions", s.handlePlanVersions, view)
	g.POST("/:tripId/plan/undo", s.handleUndo, edit, s.PlanUnfrozen)
}

func (s *Server) handlePlanDays(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	days, err := s.plans.ListDays(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดแพลนไม่สำเร็จ")
	}
	items, err := s.plans.ListItems(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดรายการไม่สำเร็จ")
	}

	byDay := map[string][]models.PlanItem{}
	for _, item := range items {
		byDay[item.DayID] = append(byDay[item.DayID], item)
	}

	out := make([]planDayDTO, 0, len(days))
	for _, day := range days {
		out = append(out, toPlanDayDTO(day, byDay[day.ID]))
	}
	return c.JSON(http.StatusOK, out)
}

// handleRevalidatePlan re-runs the deterministic checks and rewrites the
// warnings. It is the "ตรวจแพลนอีกรอบ" button, and it is also called after
// every structural edit.
func (s *Server) handleRevalidatePlan(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.revalidate(ctx, tripID); err != nil {
		return request.Internal(c, "ตรวจแพลนไม่สำเร็จ")
	}
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "", events.TypePlanUpdated, "plan", tripID)
	return s.handlePlanDays(c)
}

// revalidate is the shared path: validate → write warnings. Called by the
// button and by every item mutation, so a warning can never be stale.
func (s *Server) revalidate(ctx contextT, tripID string) error {
	days, err := s.plans.ListDays(ctx, tripID)
	if err != nil {
		return err
	}
	items, err := s.plans.ListItems(ctx, tripID)
	if err != nil {
		return err
	}

	dayIndex := map[string]int{}
	for _, day := range days {
		dayIndex[day.ID] = day.DayIndex
	}

	inputs := make([]domain.ValidateItem, 0, len(items))
	for _, item := range items {
		travel := 0
		if item.TravelMin != nil {
			travel = *item.TravelMin
		}
		inputs = append(inputs, domain.ValidateItem{
			ID:        item.ID,
			DayIndex:  dayIndex[item.DayID],
			Title:     item.Title,
			StartTime: item.StartTime,
			EndTime:   item.EndTime,
			OpenHours: item.OpenHours,
			TravelMin: travel,
			POIID:     derefString(item.POIID),
			Zone:      item.Area,
		})
	}

	musts := make([]string, 0)
	if wishes, err := s.wishlist.ListByTrip(ctx, tripID); err == nil {
		for _, w := range wishes {
			if w.Kind == models.WishMust {
				musts = append(musts, w.Title)
			}
		}
	}

	issues := domain.ValidatePlan(domain.ValidateInput{Items: inputs, MustWishes: musts})
	return s.plans.SetWarnings(ctx, tripID, domain.WarningsByItem(issues))
}

/* -------------------------------------------------------------- versions -- */

func (s *Server) handlePlanVersions(c echo.Context) error {
	versions, err := s.plans.ListVersions(c.Request().Context(), request.TripID(c), 30)
	if err != nil {
		return request.Internal(c, "โหลดประวัติไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, versions)
}

// handleUndo restores the most recent snapshot (W5.5). One step is deliberate:
// a group editing together needs "put that back", not a time machine.
func (s *Server) handleUndo(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	versions, err := s.plans.ListVersions(ctx, tripID, 1)
	if err != nil || len(versions) == 0 {
		return request.NotFound(c, "ไม่มีอะไรให้ย้อนกลับ")
	}
	version := versions[0]

	var snapshot models.PlanItem
	if err := unmarshalJSON(version.Snapshot, &snapshot); err != nil {
		return request.Internal(c, "ข้อมูลย้อนกลับเสียหาย")
	}

	switch version.Action {
	case "delete":
		snapshot.TripID = tripID
		if err := s.plans.CreateItem(ctx, &snapshot, snapshot.SortOrder); err != nil {
			return request.Internal(c, "กู้คืนรายการไม่สำเร็จ")
		}
	default:
		if err := s.plans.UpdateItem(ctx, &snapshot); err != nil {
			return request.Internal(c, "ย้อนกลับไม่สำเร็จ")
		}
	}

	_ = s.plans.DeleteVersion(ctx, tripID, version.ID)
	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "ย้อนกลับการแก้ไขล่าสุด", events.TypePlanUpdated, "item", snapshot.ID)
	return s.handlePlanDays(c)
}

// snapshot records an item as it was, so the change can be undone (A5.1).
func (s *Server) snapshot(ctx contextT, tripID, action string, item models.PlanItem, actor string) {
	_ = s.plans.AddVersion(ctx, &models.ItemVersion{
		TripID:   tripID,
		ItemID:   item.ID,
		Action:   action,
		Snapshot: toDatatypesJSON(item),
		ActorID:  actor,
	})
}

var _ = time.Now
