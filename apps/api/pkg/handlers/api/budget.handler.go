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

// Budget (M7 — A7.1 / A7.2).
//
// Everything here is an ESTIMATE derived from plan items. Actual money lives in
// the Expense tab and the two are never mixed, because conflating them is how
// group budgets go wrong.
func (s *Server) registerBudgetRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/budget", s.handleGetBudget, view)
	g.PUT("/:tripId/budget", s.handleSetBudget, edit)
	g.POST("/:tripId/budget/fx", s.handleRefreshFx, edit)
}

// categoryMeta maps an item type to the row the Budget tab renders. The icon
// and accent live here rather than in the client so the export, the API and the
// web app label the same money the same way.
var categoryMeta = map[string]struct{ label, icon, accent string }{
	models.ItemStay:      {"ที่พัก", "🏠", "joyfull"},
	models.ItemTransport: {"เดินทาง", "🚄", "sky"},
	models.ItemFlight:    {"เดินทาง", "🚄", "sky"},
	models.ItemMeal:      {"อาหาร", "🍜", "primary"},
	models.ItemPOI:       {"ตั๋ว/กิจกรรม", "🎟️", "matcha"},
	models.ItemFree:      {"อื่นๆ", "✨", "joyfull"},
}

func (s *Server) handleGetBudget(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	items, err := s.plans.ListItems(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดแพลนไม่สำเร็จ")
	}

	return c.JSON(http.StatusOK, s.budgetOf(*trip, items))
}

func (s *Server) budgetOf(trip models.Trip, items []models.PlanItem) budgetDTO {
	costs := make([]domain.CostInput, 0, len(items))
	for _, item := range items {
		meta, ok := categoryMeta[item.Type]
		if !ok {
			meta = categoryMeta[models.ItemFree]
		}
		amount := 0.0
		if item.CostJPY != nil {
			amount = *item.CostJPY
		}
		costs = append(costs, domain.CostInput{
			ItemID:   item.ID,
			Category: meta.label,
			Amount:   amount,
			Currency: trip.DestCurrency,
			Basis:    domain.BasisPerPerson,
			// A hotel already paid for should not be in the "bring this much
			// cash" number, which is what prepaid separates out.
			IsPrepaid: item.Type == models.ItemStay && item.Booked,
		})
	}

	rate := tripFxRate(trip)
	summary := domain.ComputeBudget(costs, trip.PartySize, rate, trip.HomeCurrency)

	lines := make([]budgetLineDTO, 0, len(summary.Lines))
	for _, line := range summary.Lines {
		icon, accent := "✨", "joyfull"
		for _, meta := range categoryMeta {
			if meta.label == line.Category {
				icon, accent = meta.icon, meta.accent
				break
			}
		}
		lines = append(lines, budgetLineDTO{
			Category:     line.Category,
			Icon:         icon,
			Accent:       accent,
			TotalJPY:     line.TotalJPY,
			PerPersonJPY: line.PerPersonJPY,
			Prepaid:      line.Prepaid,
		})
	}

	perPersonTHB := domain.ToHomeCurrency(summary.PerPerson, rate)
	used := 0.0
	if trip.BudgetPerPersonTHB > 0 {
		used = perPersonTHB / trip.BudgetPerPersonTHB
	}

	fxAsOf := ""
	if trip.FxRateAt != nil {
		fxAsOf = trip.FxRateAt.Format("2006-01-02")
	}

	return budgetDTO{
		Lines:            lines,
		TotalJPY:         summary.Total,
		PerPersonJPY:     summary.PerPerson,
		PrepaidJPY:       summary.PrepaidTotal,
		PerPersonTHB:     perPersonTHB,
		BudgetUsed:       used,
		RemainingTHB:     trip.BudgetPerPersonTHB - perPersonTHB,
		ItemsWithoutCost: summary.ItemsWithoutCost,
		FxRate:           rate,
		FxAsOf:           fxAsOf,
	}
}

type setBudgetRequest struct {
	PerPersonTHB float64 `json:"per_person_thb"`
}

func (s *Server) handleSetBudget(c echo.Context) error {
	var req setBudgetRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	trip.BudgetPerPersonTHB = req.PerPersonTHB
	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกงบไม่สำเร็จ")
	}

	items, _ := s.plans.ListItems(ctx, tripID)
	s.track(c, tripID, "ตั้งงบไว้ที่ "+itoa(int(req.PerPersonTHB))+" บาท/คน", events.TypeTripUpdated, "trip", tripID)
	return c.JSON(http.StatusOK, s.budgetOf(*trip, items))
}

// handleRefreshFx re-snapshots the rate. It is explicit rather than automatic:
// a budget that changes on its own overnight is a budget nobody trusts.
func (s *Server) handleRefreshFx(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	rate, err := s.fx.Rate(ctx, trip.DestCurrency, trip.HomeCurrency)
	if err != nil {
		return request.Internal(c, "ดึงอัตราแลกเปลี่ยนไม่สำเร็จ")
	}

	now := time.Now().UTC()
	trip.FxRate = &rate
	trip.FxRateAt = &now
	if err := s.trips.Update(ctx, trip); err != nil {
		return request.Internal(c, "บันทึกอัตราแลกเปลี่ยนไม่สำเร็จ")
	}

	items, _ := s.plans.ListItems(ctx, tripID)
	return c.JSON(http.StatusOK, s.budgetOf(*trip, items))
}
