package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Points out, money owed (M22 — A12.10 / A12.11).
//
// Two different currencies live here and are deliberately kept apart. Points
// are a loyalty score this product mints and can redeem for its own prices;
// earnings are money a partner owes, denominated in baht, that eventually
// leaves the company bank account. Only one of them is a liability.
func (s *Server) registerRewardRoutes(me *echo.Group) {
	me.GET("/points/redemptions", s.handleListRedemptions)
	me.POST("/points/redeem", s.handleRedeemPoints)
	me.GET("/earnings", s.handleMyEarnings)
}

/* ------------------------------------------------- redemption (A12.10) --- */

type discountCodeDTO struct {
	Code        string  `json:"code"`
	Scope       string  `json:"scope"`
	AmountTHB   float64 `json:"amount_thb"`
	PointsSpent int     `json:"points_spent"`
	ExpiresAt   string  `json:"expires_at"`
	UsedAt      *string `json:"used_at"`
	Usable      bool    `json:"usable"`
}

type redemptionListDTO struct {
	Balance int               `json:"balance"`
	Tiers   []redemptionTier  `json:"tiers"`
	Codes   []discountCodeDTO `json:"codes"`
}

type redemptionTier struct {
	AmountTHB int  `json:"amount_thb"`
	Points    int  `json:"points"`
	Afford    bool `json:"afford"`
}

type redeemRequest struct {
	AmountTHB int `json:"amount_thb"`
}

func (s *Server) handleListRedemptions(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	balance, err := s.points.Balance(ctx, userID)
	if err != nil {
		return request.Internal(c, "อ่านแต้มไม่สำเร็จ")
	}
	codes, err := s.discounts.ListForUser(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดโค้ดส่วนลดไม่สำเร็จ")
	}

	// While the mint is closed the tiers are empty rather than absent: the
	// list still answers "what codes do I hold", which is the half of this
	// endpoint that Phase 6 keeps (คูปองของฉัน). Advertising a price nobody
	// can pay would be the one thing worse than showing nothing.
	tiers := []redemptionTier{}
	if domain.RedemptionOpen {
		tiers = redemptionTiers(balance)
	}

	return c.JSON(http.StatusOK, redemptionListDTO{
		Balance: balance,
		Tiers:   tiers,
		Codes:   discountDTOs(codes),
	})
}

// handleRedeemPoints turns points into a code.
//
// The points are burned first and the code written second. The other order
// would let a crash leave somebody holding a code they never paid for, and of
// the two failure modes the recoverable one is "my points went but no code
// appeared" — which is a support ticket with a ledger row behind it.
func (s *Server) handleRedeemPoints(c echo.Context) error {
	if !domain.RedemptionOpen {
		// Refused at the handler, not hidden in the client: an old tab, a
		// replayed request or a curl is exactly as able to mint a liability as
		// the button was, and the button is the only thing that went away.
		return request.Forbidden(c, "ระบบแลกแต้มเป็นโค้ดส่วนลดปิดปรับปรุงชั่วคราว")
	}

	ctx := c.Request().Context()
	userID := request.UserID(c)

	var req redeemRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if !domain.IsRedemptionTier(req.AmountTHB) {
		return request.BadRequest(c, "เลือกได้เฉพาะมูลค่าที่กำหนดไว้")
	}

	cost := domain.PointsForDiscount(req.AmountTHB)
	balance, err := s.points.Balance(ctx, userID)
	if err != nil {
		return request.Internal(c, "อ่านแต้มไม่สำเร็จ")
	}
	if balance < cost {
		return request.BadRequest(c, "แต้มไม่พอ")
	}

	if err := s.points.Add(ctx, &models.UserPoints{
		UserID: userID,
		Delta:  -cost,
		Reason: models.PointsReasonRedeem,
		Note:   "แลกเป็นโค้ดส่วนลด",
	}); err != nil {
		return request.Internal(c, "หักแต้มไม่สำเร็จ")
	}

	code := &models.DiscountCode{
		UserID:      userID,
		Code:        domain.NewDiscountCode(),
		Scope:       models.DiscountScopeAICredits,
		AmountTHB:   float64(req.AmountTHB),
		PointsSpent: cost,
		ExpiresAt:   time.Now().UTC().Add(domain.DiscountValidity),
	}
	if err := s.discounts.Create(ctx, code); err != nil {
		return request.Internal(c, "ออกโค้ดไม่สำเร็จ")
	}

	return c.JSON(http.StatusCreated, toDiscountDTO(*code))
}

// resolveDiscount looks up a code the caller wants to spend.
//
// Returns nil for an empty code — no discount is not an error — and an error
// message the buyer can act on for anything else.
func (s *Server) resolveDiscount(ctx contextT, userID, code, scope string) (*models.DiscountCode, string) {
	if code == "" {
		return nil, ""
	}

	found, err := s.discounts.GetByCode(ctx, code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "ไม่พบโค้ดนี้"
		}
		return nil, "ตรวจโค้ดไม่สำเร็จ"
	}
	// Someone else's code is "not found": confirming it exists would turn the
	// code space into something worth guessing at.
	if found.UserID != userID {
		return nil, "ไม่พบโค้ดนี้"
	}
	if found.Scope != scope {
		return nil, "โค้ดนี้ใช้กับรายการนี้ไม่ได้"
	}
	if !found.Usable(time.Now().UTC()) {
		return nil, "โค้ดนี้ถูกใช้ไปแล้วหรือหมดอายุ"
	}
	return found, ""
}

func redemptionTiers(balance int) []redemptionTier {
	out := make([]redemptionTier, 0, len(domain.RedemptionTiers))
	for _, amount := range domain.RedemptionTiers {
		points := domain.PointsForDiscount(amount)
		out = append(out, redemptionTier{
			AmountTHB: amount,
			Points:    points,
			Afford:    balance >= points,
		})
	}
	return out
}

func discountDTOs(codes []models.DiscountCode) []discountCodeDTO {
	out := make([]discountCodeDTO, 0, len(codes))
	for _, code := range codes {
		out = append(out, toDiscountDTO(code))
	}
	return out
}

func toDiscountDTO(code models.DiscountCode) discountCodeDTO {
	dto := discountCodeDTO{
		Code:        code.Code,
		Scope:       code.Scope,
		AmountTHB:   code.AmountTHB,
		PointsSpent: code.PointsSpent,
		ExpiresAt:   code.ExpiresAt.UTC().Format(time.RFC3339),
		Usable:      code.Usable(time.Now().UTC()),
	}
	if code.UsedAt != nil {
		used := code.UsedAt.UTC().Format(time.RFC3339)
		dto.UsedAt = &used
	}
	return dto
}

/* ------------------------------------------- creator revenue share (A12.11) */

type earningDTO struct {
	TripID          string  `json:"trip_id"`
	Partner         string  `json:"partner"`
	BookingValueTHB float64 `json:"booking_value_thb"`
	CommissionTHB   float64 `json:"commission_thb"`
	SharePercent    int     `json:"share_percent"`
	AmountTHB       float64 `json:"amount_thb"`
	Estimated       bool    `json:"estimated"`
	Status          string  `json:"status"`
	OccurredAt      string  `json:"occurred_at"`
}

type payoutDTO struct {
	PeriodStart  string  `json:"period_start"`
	PeriodEnd    string  `json:"period_end"`
	AmountTHB    float64 `json:"amount_thb"`
	EarningCount int     `json:"earning_count"`
	Status       string  `json:"status"`
	PaidAt       *string `json:"paid_at"`
}

type earningsDTO struct {
	Totals           models.EarningTotals `json:"totals"`
	SharePercent     int                  `json:"share_percent"`
	MinimumPayoutTHB float64              `json:"minimum_payout_thb"`
	Entries          []earningDTO         `json:"entries"`
	Payouts          []payoutDTO          `json:"payouts"`
}

// handleMyEarnings is the creator's own statement: what their published plans
// have earned, what has been paid, and what is still owed.
func (s *Server) handleMyEarnings(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	totals, err := s.earnings.TotalsForUser(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}
	entries, err := s.earnings.ListForUser(ctx, userID, 100)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}
	payouts, _ := s.payouts.ListForUser(ctx, userID)

	out := earningsDTO{
		Totals:           totals,
		SharePercent:     domain.CreatorSharePercent,
		MinimumPayoutTHB: domain.MinimumPayoutTHB,
		Entries:          make([]earningDTO, 0, len(entries)),
		Payouts:          make([]payoutDTO, 0, len(payouts)),
	}
	for _, entry := range entries {
		out.Entries = append(out.Entries, toEarningDTO(entry))
	}
	for _, payout := range payouts {
		out.Payouts = append(out.Payouts, toPayoutDTO(payout))
	}

	return c.JSON(http.StatusOK, out)
}

func toEarningDTO(e models.CreatorEarning) earningDTO {
	return earningDTO{
		TripID:          e.TripID,
		Partner:         partnerName(e.Partner),
		BookingValueTHB: e.BookingValueTHB,
		CommissionTHB:   e.CommissionTHB,
		SharePercent:    e.SharePercent,
		AmountTHB:       e.AmountTHB,
		Estimated:       e.Estimated,
		Status:          e.Status,
		OccurredAt:      e.OccurredAt.UTC().Format(time.RFC3339),
	}
}

func toPayoutDTO(p models.Payout) payoutDTO {
	dto := payoutDTO{
		PeriodStart:  p.PeriodStart.UTC().Format("2006-01-02"),
		PeriodEnd:    p.PeriodEnd.UTC().Format("2006-01-02"),
		AmountTHB:    p.AmountTHB,
		EarningCount: p.EarningCount,
		Status:       p.Status,
	}
	if p.PaidAt != nil {
		paid := p.PaidAt.UTC().Format(time.RFC3339)
		dto.PaidAt = &paid
	}
	return dto
}

// recordCreatorEarning writes the revenue-share line for a confirmed booking.
//
// Called from the same two places that award points (A12.6): the partner
// postback and the manual "จองแล้ว" stand-in. The click id is unique on the
// table, so a partner retrying a webhook cannot accrue twice.
func (s *Server) recordCreatorEarning(
	ctx contextT,
	creatorID, tripID, partner string,
	clickID *string,
	bookingValueTHB, reportedCommission float64,
	hasCommission bool,
) {
	if creatorID == "" {
		return
	}

	commission, estimated := domain.CommissionTHB(partner, bookingValueTHB, reportedCommission, hasCommission)
	amount := domain.CreatorShareTHB(commission)
	if amount <= 0 {
		// Nothing to owe. The points award still happened; this ledger only
		// carries money.
		return
	}

	_ = s.earnings.Create(ctx, &models.CreatorEarning{
		UserID:          creatorID,
		TripID:          tripID,
		ClickID:         clickID,
		Partner:         partner,
		BookingValueTHB: bookingValueTHB,
		CommissionTHB:   commission,
		SharePercent:    domain.CreatorSharePercent,
		AmountTHB:       amount,
		Estimated:       estimated,
		Status:          models.EarningPending,
		OccurredAt:      time.Now().UTC(),
	})
}
