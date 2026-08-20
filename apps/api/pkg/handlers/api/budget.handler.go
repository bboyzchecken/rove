package api

import (
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// registerBudgetRoutes exposes the estimate derived from plan items
// (DEV_SPEC §5.6). This is NOT the same number as the Expense tab, and the
// response says so in fx_rate_note and estimate_label so the UI cannot forget.
//
//	GET /plans/:planId/budget   [viewer]
func (s *Server) registerBudgetRoutes(v1 *echo.Group) {
	plans := v1.Group("/plans", s.JwtMiddleware)
	plans.GET("/:planId/budget", s.handlePlanBudget,
		s.ResolveTrip("planId", models.TripRoleViewer, s.planTrip))
}

// BudgetResponse carries the FX provenance alongside the numbers. Every place
// converted money appears has to be able to say when the rate was taken
// (DEV_SPEC §6.2, §7.2).
type BudgetResponse struct {
	domain.BudgetSummary
	PartySize      int        `json:"party_size"`
	SourceCurrency string     `json:"source_currency"`
	FXRate         float64    `json:"fx_rate"`
	FXRateAt       *time.Time `json:"fx_rate_at"`
	FXRateNote     string     `json:"fx_rate_note"`
	EstimateLabel  string     `json:"estimate_label"`
	// BudgetRange is what the group said they wanted to spend, for the
	// "over/under budget" comparison in W7.1.
	BudgetMin *float64 `json:"budget_min"`
	BudgetMax *float64 `json:"budget_max"`
}

func (s *Server) handlePlanBudget(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	planID := c.Param("planId")

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	items, err := s.plans.Items(ctx, planID)
	if err != nil {
		return request.Internal(c, "อ่านรายการไม่สำเร็จ")
	}

	rate, rateAt := s.tripRate(c, trip)

	costs := make([]domain.CostInput, 0, len(items))
	for _, it := range items {
		cost := domain.CostInput{
			ItemID:    it.ID,
			Category:  domain.CategoryForItemType(it.Type),
			Currency:  it.CostCurrency,
			Basis:     it.CostBasis,
			Nights:    trip.Nights(),
			IsPrepaid: it.IsPrepaid,
		}
		if it.CostAmount != nil {
			cost.Amount = *it.CostAmount
		}
		costs = append(costs, cost)
	}

	summary := domain.ComputeBudget(costs, trip.PartySize, rate, trip.HomeCurrency)

	res := BudgetResponse{
		BudgetSummary:  summary,
		PartySize:      trip.PartySize,
		SourceCurrency: trip.DestCurrency,
		FXRate:         rate,
		FXRateAt:       rateAt,
		FXRateNote:     fxNote(rateAt),
		EstimateLabel:  "ประมาณการจากรายการในแพลน ไม่ใช่ยอดใช้จ่ายจริง",
	}

	// The budget range is the tightest one anyone set, because exceeding the
	// most cautious member's ceiling is the conversation worth surfacing.
	if profiles, err := s.profiles.ListByTrip(ctx, tripID); err == nil {
		for _, p := range profiles {
			if p.BudgetMin != nil && (res.BudgetMin == nil || *p.BudgetMin > *res.BudgetMin) {
				res.BudgetMin = p.BudgetMin
			}
			if p.BudgetMax != nil && (res.BudgetMax == nil || *p.BudgetMax < *res.BudgetMax) {
				res.BudgetMax = p.BudgetMax
			}
		}
	}

	return request.OK(c, res)
}

// tripRate prefers the rate snapshotted on the trip so the budget does not move
// under the group's feet between two page loads; it falls back to a live quote
// and stores it.
func (s *Server) tripRate(c echo.Context, trip *models.Trip) (float64, *time.Time) {
	if trip.FxRate != nil && *trip.FxRate > 0 && trip.FxRateAt != nil {
		return *trip.FxRate, trip.FxRateAt
	}

	quote, err := s.fx.Quote(c.Request().Context(), trip.DestCurrency, trip.HomeCurrency)
	if err != nil {
		return 0, nil
	}

	trip.FxRate = &quote.Rate
	at := quote.FetchedAt
	trip.FxRateAt = &at
	// Persisting is best effort; a failure here just means the next request
	// quotes again.
	_ = s.trips.Update(c.Request().Context(), trip)

	return quote.Rate, &at
}

// fxNote is the label DEV_SPEC §7.2 requires next to every converted amount.
func fxNote(at *time.Time) string {
	if at == nil {
		return "ยังไม่มีอัตราแลกเปลี่ยน — แสดงเป็นสกุลเงินต้นทาง"
	}
	return "อัตราโดยประมาณ ณ วันที่ " + at.Format("2 Jan 2006")
}
