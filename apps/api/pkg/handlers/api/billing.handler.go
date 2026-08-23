package api

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Bill & Payment (M20 — A20.x).
//
// Read-only. Orders are written by whatever was sold — buying drafts today, a
// renewal later — so there is no POST here; what these endpoints owe the web
// app is the history, the receipts and the standing plan.
//
// Everything is under /users/me: a receipt belongs to the person who paid, not
// to the trip it was spent on, and it outlives that trip.
func (s *Server) registerBillingRoutes(g *echo.Group) {
	g.GET("/summary", s.handleBillingSummary)
	g.GET("/orders", s.handleListOrders)
	g.GET("/orders/:orderId", s.handleGetOrder)
	g.GET("/subscription", s.handleGetSubscription)
	g.GET("/plans", s.handleListPlans)
}

func (s *Server) handleBillingSummary(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	summary, err := s.billing.Summary(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดสรุปการชำระเงินไม่สำเร็จ")
	}

	out := billingSummaryDTO{
		Orders:            summary.Orders,
		AIDraftsPurchased: summary.AIDraftsPurchased,
		TotalSpentTHB:     summary.TotalSpentTHB,
		PointsSpent:       summary.PointsSpent,
		Subscription:      s.subscriptionDTO(ctx, userID),
	}
	if summary.Since != nil {
		since := summary.Since.UTC().Format(time.RFC3339)
		out.Since = &since
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleListOrders(c echo.Context) error {
	orders, err := s.billing.ListOrders(c.Request().Context(), request.UserID(c), 200)
	if err != nil {
		return request.Internal(c, "โหลดประวัติการซื้อไม่สำเร็จ")
	}

	out := make([]orderDTO, 0, len(orders))
	for _, order := range orders {
		out = append(out, toOrderDTO(order))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleGetOrder(c echo.Context) error {
	order, err := s.billing.GetOrder(c.Request().Context(), request.UserID(c), c.Param("orderId"))
	if err != nil {
		// Someone else's receipt is "not found" to this user, never "forbidden":
		// a 403 would confirm the id exists.
		return request.NotFound(c, "ไม่พบใบเสร็จนี้")
	}
	return c.JSON(http.StatusOK, toOrderDTO(*order))
}

func (s *Server) handleGetSubscription(c echo.Context) error {
	return c.JSON(http.StatusOK, s.subscriptionDTO(c.Request().Context(), request.UserID(c)))
}

func (s *Server) handleListPlans(c echo.Context) error {
	plans := domain.Plans()
	out := make([]subscriptionPlanDTO, 0, len(plans))
	for _, plan := range plans {
		out = append(out, subscriptionPlanDTO{
			ID:                      plan.ID,
			Name:                    plan.Name,
			Tagline:                 plan.Tagline,
			PriceTHB:                plan.PriceTHB,
			Interval:                plan.Interval,
			Perks:                   plan.Perks,
			IncludedDraftsPerPeriod: plan.IncludedDraftsPerPeriod,
			Available:               plan.Available,
		})
	}
	return c.JSON(http.StatusOK, out)
}

/* -------------------------------------------------------------- helpers -- */

// subscriptionDTO answers for a free user without a database row: the free plan
// is a fact about the catalogue, not a record, and writing one per signup would
// fill a table with people nobody is charging.
func (s *Server) subscriptionDTO(ctx context.Context, userID string) subscriptionDTO {
	free := domain.PlanByID(domain.FreePlanID)
	out := subscriptionDTO{
		PlanID:   free.ID,
		PlanName: free.Name,
		Status:   "none",
		PriceTHB: 0,
	}

	sub, err := s.billing.ActiveSubscription(ctx, userID)
	if err != nil || sub == nil {
		return out
	}

	plan := domain.PlanByID(sub.PlanID)
	interval := sub.Interval
	start := sub.CurrentPeriodStart.UTC().Format(time.RFC3339)
	end := sub.CurrentPeriodEnd.UTC().Format(time.RFC3339)

	return subscriptionDTO{
		ID:                      &sub.ID,
		PlanID:                  sub.PlanID,
		PlanName:                plan.Name,
		Status:                  sub.Status,
		Interval:                &interval,
		PriceTHB:                sub.PriceTHB,
		CurrentPeriodStart:      &start,
		CurrentPeriodEnd:        &end,
		CancelAtPeriodEnd:       sub.CancelAtPeriodEnd,
		IncludedDraftsPerPeriod: plan.IncludedDraftsPerPeriod,
	}
}

// recordOrder writes a completed purchase and returns the receipt.
//
// It lives here rather than in the AI handler because the *next* thing that
// gets sold has to file its receipt the same way, and a purchase whose
// bookkeeping is inlined in the feature that sold it is a purchase the billing
// screen eventually stops knowing about.
type recordOrderInput struct {
	UserID      string
	Kind        string
	Title       string
	LineLabel   string
	Quantity    int
	UnitTHB     float64
	Method      string
	MethodLabel string
	PointsSpent int
	TripID      *string
	TripTitle   string
	PeriodStart *time.Time
	PeriodEnd   *time.Time
}

func (s *Server) recordOrder(ctx context.Context, in recordOrderInput) (*models.Order, error) {
	now := time.Now().UTC()
	amount := in.UnitTHB * float64(in.Quantity)
	paidWithPoints := in.Method == domain.PayMethodPoints

	order := &models.Order{
		UserID: in.UserID,
		Kind:   in.Kind,
		Status: domain.OrderPaid,
		Title:  in.Title,
		Lines: models.EncodeOrderLines([]models.OrderLine{{
			Label:         in.LineLabel,
			Quantity:      in.Quantity,
			UnitAmountTHB: in.UnitTHB,
			AmountTHB:     amount,
		}}),
		SubtotalTHB: amount,
		Currency:    "THB",
		Method:      in.Method,
		MethodLabel: in.MethodLabel,
		PointsSpent: in.PointsSpent,
		TripID:      in.TripID,
		TripTitle:   in.TripTitle,
		// No gateway in Phase 1: a cash order is recorded, never charged (§16).
		Simulated:   domain.IsCashMethod(in.Method),
		PeriodStart: in.PeriodStart,
		PeriodEnd:   in.PeriodEnd,
		IssuedAt:    now,
		PaidAt:      &now,
	}

	// Points do not reduce a price, they replace it: the line keeps its list
	// price and the whole of it is discounted away, so the receipt still says
	// what the thing was worth.
	if paidWithPoints {
		order.DiscountTHB = amount
		order.TotalTHB = 0
	} else {
		order.TotalTHB = amount
	}

	if err := s.billing.CreateOrder(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}
