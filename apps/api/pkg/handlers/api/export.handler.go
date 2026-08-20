package api

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/export"
)

// registerExportRoutes covers HTML/PDF export (DEV_SPEC §5.11 / M10).
//
//	POST /trips/:tripId/export   [viewer] {format} -> {url}
//
// Export is synchronous. A 7-day plan renders in well under a second, and a job
// with a polling UI would be more machinery than the feature needs; the job
// queue stays reserved for the AI calls that genuinely take minutes.
func (s *Server) registerExportRoutes(v1, trips *echo.Group) {
	trips.POST("/:tripId/export", s.handleExport,
		s.TripRoleMiddleware(models.TripRoleViewer),
		s.RateLimit(RateLimitConfig{Key: "export", Limit: 20, Window: time.Minute}))
}

type exportRequest struct {
	Format string `json:"format" validate:"omitempty,oneof=html pdf"`
	PlanID string `json:"plan_id" validate:"omitempty,uuid4"`
}

func (s *Server) handleExport(c echo.Context) error {
	var req exportRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c, 60*time.Second)
	defer cancel()

	tripID := request.TripID(c)
	planID := req.PlanID
	if planID == "" {
		plan, err := s.activePlan(ctx, tripID)
		if err != nil {
			return request.BadRequest(c, "ทริปนี้ยังไม่มีแพลนให้ export")
		}
		planID = plan.ID
	}

	view, err := s.planView(c, tripID, planID)
	if err != nil {
		return request.NotFound(c, "ไม่พบแพลน")
	}

	format := orDefaultString(req.Format, export.FormatHTML)
	url, err := s.export.Render(ctx, format, *view)
	if err != nil {
		if errors.Is(err, export.ErrPDFNotConfigured) {
			return request.Error(c, http.StatusServiceUnavailable,
				"ยังไม่ได้ตั้งค่าตัวสร้าง PDF — export เป็น HTML แทนได้")
		}
		return request.Internal(c, "สร้างไฟล์ export ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionExportRequested,
		TargetType: "plan", TargetID: planID,
		Meta: map[string]any{"format": format},
	})
	return request.OK(c, map[string]any{
		"url":        url,
		"format":     format,
		"expires_in": int(export.SignedURLTTL.Seconds()),
	})
}

// planView flattens a plan into the export document. It is also what the public
// share page renders, so the two can never drift apart.
func (s *Server) planView(c echo.Context, tripID, planID string) (*export.PlanView, error) {
	ctx := c.Request().Context()

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return nil, err
	}
	detail, err := s.planDetail(ctx, tripID, planID)
	if err != nil {
		return nil, err
	}

	rate, rateAt := s.tripRate(c, trip)

	view := &export.PlanView{
		TripID:       trip.ID,
		PlanID:       planID,
		Title:        trip.Title,
		Subtitle:     detail.Plan.KeyDecision,
		PartySize:    trip.PartySize,
		Summary:      firstNonEmpty(detail.Plan.Summary, trip.Summary),
		BrandName:    "ROVE",
		GeneratedAt:  time.Now().UTC().Format("2 Jan 2006 15:04") + " UTC",
		HomeCurrency: trip.HomeCurrency,
		FXNote:       fxNote(rateAt),
	}
	if trip.StartDate != nil {
		view.StartDate = trip.StartDate.Format("2 Jan 2006")
	}
	if trip.EndDate != nil {
		view.EndDate = trip.EndDate.Format("2 Jan 2006")
	}

	costs := []domain.CostInput{}
	for _, d := range detail.Days {
		day := export.DayView{
			Date:  d.Date.Format("Mon 2 Jan"),
			Title: d.Title,
			Theme: d.Theme,
		}
		for _, it := range d.Items {
			day.Items = append(day.Items, export.ItemView{
				Time:     timeRange(it),
				Title:    it.Title,
				Notes:    it.Notes,
				Type:     it.Type,
				Travel:   travelLabel(it),
				Cost:     costLabel(it),
				Verified: it.Verified == models.VerifiedYes,
			})

			cost := domain.CostInput{
				ItemID:   it.ID,
				Category: domain.CategoryForItemType(it.Type),
				Currency: it.CostCurrency, Basis: it.CostBasis,
				Nights: trip.Nights(), IsPrepaid: it.IsPrepaid,
			}
			if it.CostAmount != nil {
				cost.Amount = *it.CostAmount
			}
			costs = append(costs, cost)
		}
		view.Days = append(view.Days, day)
	}

	budget := domain.ComputeBudget(costs, trip.PartySize, rate, trip.HomeCurrency)
	view.TotalLabel = fmt.Sprintf("ประมาณการรวม %.0f %s · ต่อคน %.0f %s",
		budget.Total, trip.HomeCurrency, budget.PerPerson, trip.HomeCurrency)

	if members, err := s.memberViews(c, tripID); err == nil {
		for _, m := range members {
			view.Members = append(view.Members, m.DisplayName)
		}
	}
	return view, nil
}

func timeRange(it models.Item) string {
	switch {
	case it.StartTime != "" && it.EndTime != "":
		return it.StartTime + "–" + it.EndTime
	case it.StartTime != "":
		return it.StartTime
	default:
		return ""
	}
}

func travelLabel(it models.Item) string {
	if it.TravelMin <= 0 {
		return ""
	}
	mode := it.TravelMode
	if mode == "" {
		mode = "เดินทาง"
	}
	return fmt.Sprintf("%s %d นาที", mode, it.TravelMin)
}

// costLabel always says "ประมาณ" for an estimate, so an exported plan cannot be
// mistaken for a quote (DEV_SPEC §6.3).
func costLabel(it models.Item) string {
	if it.CostAmount == nil || *it.CostAmount == 0 {
		return ""
	}
	basis := map[string]string{
		models.CostBasisPerPerson: "/คน",
		models.CostBasisPerNight:  "/คืน",
		models.CostBasisPerGroup:  "/กลุ่ม",
	}[it.CostBasis]

	label := fmt.Sprintf("%.0f %s%s", *it.CostAmount, it.CostCurrency, basis)
	if it.CostStatus == models.CostStatusEstimate {
		label = "ประมาณ " + label
	}
	if it.IsPrepaid {
		label += " (จ่ายแล้ว)"
	}
	return label
}
