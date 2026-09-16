package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Step overrides (Feedback #2 — D-11 / D-12).
//
// Every step of the room's checklist has one of four statuses — ต้องทำ /
// รอตรวจเช็ค / เรียบร้อย / ไม่จำเป็น. Three are derived on the web side from
// the overview payload and never stored. The fourth is a decision the group
// makes ("this trip has no bookings to make"), which is the only one that
// needs a row and therefore the only one with an endpoint.
func (s *Server) registerProgressRoutes(g *echo.Group) {
	g.PATCH("/:tripId/steps/:step", s.handleSetStepStatus, s.TripRoleMiddleware(models.TripRoleEditor))
}

// stepKeys is the vocabulary the web's lib/trip-progress.ts shares. A step not
// in it is refused rather than stored, so a typo cannot become a row nobody
// can clear from the UI.
var stepKeys = map[string]bool{
	"invite": true, "dates": true, "route": true, "stay": true, "wishlist": true, "plan": true,
	"budget": true, "bookings": true, "prep": true, "documents": true, "expense": true, "photos": true,
}

type setStepStatusRequest struct {
	// "skipped" or "confirmed" writes the override; "todo" removes it and the
	// step goes back to whatever the room derives for it.
	Status string `json:"status" validate:"required,oneof=skipped confirmed todo"`
}

func (s *Server) handleSetStepStatus(c echo.Context) error {
	var req setStepStatusRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	step := c.Param("step")
	if !stepKeys[step] {
		return request.BadRequest(c, "ไม่รู้จักขั้นตอนนี้")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	switch req.Status {
	case models.StepSkipped, models.StepConfirmed:
		err := s.steps.Set(ctx, &models.TripStepOverride{
			TripID:   tripID,
			Step:     step,
			Status:   req.Status,
			ByUserID: userID,
		})
		if err != nil {
			return request.Internal(c, "บันทึกไม่สำเร็จ")
		}
		verb := "ข้ามขั้น "
		if req.Status == models.StepConfirmed {
			verb = "ทำเครื่องหมายเรียบร้อยที่ขั้น "
		}
		s.track(c, tripID, verb+step, events.TypeTripUpdated, "trip", tripID)
	default:
		if err := s.steps.Clear(ctx, tripID, step); err != nil {
			return request.Internal(c, "บันทึกไม่สำเร็จ")
		}
		s.track(c, tripID, "เอาขั้น "+step+" กลับมา", events.TypeTripUpdated, "trip", tripID)
	}

	overrides, err := s.steps.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, stepOverridesDTO(overrides))
}

// stepOverridesDTO is the map the overview and this endpoint both return:
// step → status, only for steps that have a row.
func stepOverridesDTO(rows []models.TripStepOverride) map[string]string {
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.Step] = row.Status
	}
	return out
}
