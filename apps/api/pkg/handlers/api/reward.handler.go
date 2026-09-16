package api

import (
	"errors"
	"net/http"
	"slices"
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

	if err := s.ledger.Record(ctx, &models.LedgerEntry{
		Source: &models.ValueSource{
			Kind:        models.SourceRedeem,
			ActorUserID: &userID,
			SubjectType: models.SubjectUser,
			SubjectID:   userID,
			Snapshot: snapshot(map[string]any{
				"user": s.personSnap(ctx, userID), "points": cost, "amount_thb": req.AmountTHB,
			}),
		},
		Points: []models.UserPoints{{
			UserID: userID,
			Delta:  -cost,
			Reason: models.PointsReasonRedeem,
			Note:   "แลกเป็นโค้ดส่วนลด",
		}},
	}); err != nil {
		return request.Internal(c, "หักแต้มไม่สำเร็จ")
	}

	code := &models.DiscountCode{
		UserID:      userID,
		Code:        domain.NewDiscountCode(),
		Scope:       models.DiscountScopeTripPass,
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
//
// It takes several scopes because a purchase can honour more than one: M26
// withdrew the per-draft product, and codes already issued against it are
// accepted on a Trip Pass rather than being left pointing at something that no
// longer exists.
func (s *Server) resolveDiscount(ctx contextT, userID, code string, scopes ...string) (*models.DiscountCode, string) {
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
	if !slices.Contains(scopes, found.Scope) {
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
	ID              string  `json:"id"`
	TripID          string  `json:"trip_id"`
	Partner         string  `json:"partner"`
	BookingValueTHB float64 `json:"booking_value_thb"`
	CommissionTHB   float64 `json:"commission_thb"`
	SharePercent    int     `json:"share_percent"`
	AmountTHB       float64 `json:"amount_thb"`
	Estimated       bool    `json:"estimated"`
	Status          string  `json:"status"`
	OccurredAt      string  `json:"occurred_at"`
	// Set while the creator is unverified: the day this line runs out (D-35).
	ExpiresAt *string `json:"expires_at"`
}

type payoutDTO struct {
	ID           string  `json:"id"`
	PeriodStart  string  `json:"period_start"`
	PeriodEnd    string  `json:"period_end"`
	AmountTHB    float64 `json:"amount_thb"`
	EarningCount int     `json:"earning_count"`
	Status       string  `json:"status"`
	PaidAt       *string `json:"paid_at"`
	DueDate      *string `json:"due_date"`
	BankCode     string  `json:"bank_code"`
	AccountLast4 string  `json:"account_last4"`
	TransferRef  string  `json:"transfer_ref"`
	SlipURL      *string `json:"slip_url"`
}

type nextCycleDTO struct {
	CutoffDate string `json:"cutoff_date"`
	DueDate    string `json:"due_date"`
}

type heldDTO struct {
	AmountTHB      float64 `json:"amount_thb"`
	Count          int     `json:"count"`
	EarliestExpiry string  `json:"earliest_expiry"`
}

type earningsDTO struct {
	Totals           models.EarningTotals `json:"totals"`
	SharePercent     int                  `json:"share_percent"`
	MinimumPayoutTHB float64              `json:"minimum_payout_thb"`
	// Getting paid (F11): whether this person can be, when the next transfer
	// would go out, and what is waiting on them to verify.
	Verified           bool          `json:"verified"`
	VerificationStatus string        `json:"verification_status"`
	NextCycle          *nextCycleDTO `json:"next_cycle"`
	Held               *heldDTO      `json:"held"`
	Entries            []earningDTO  `json:"entries"`
	Payouts            []payoutDTO   `json:"payouts"`
}

// handleMyEarnings is the creator's own statement: what their published plans
// have earned, what has been paid, and what is still owed.
func (s *Server) handleMyEarnings(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	s.sweepHeldEarnings(ctx, userID)

	totals, err := s.earnings.TotalsForUser(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}
	entries, err := s.earnings.ListForUser(ctx, userID, 100)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}
	payouts, _ := s.payouts.ListForUser(ctx, userID)
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}

	out := earningsDTO{
		Totals:             totals,
		SharePercent:       s.economy(ctx).CreatorSharePercent,
		MinimumPayoutTHB:   domain.MinimumPayoutTHB,
		Verified:           user.VerifiedAt != nil,
		VerificationStatus: "none",
		Entries:            make([]earningDTO, 0, len(entries)),
		Payouts:            make([]payoutDTO, 0, len(payouts)),
	}
	if v, err := s.kyc.GetByUser(ctx, userID); err == nil && v != nil {
		out.VerificationStatus = v.Status
	}
	if cycle, err := s.ensureCycles(ctx); err == nil && cycle != nil {
		out.NextCycle = &nextCycleDTO{
			CutoffDate: cycle.CutoffDate.Format(dateLayout), DueDate: cycle.DueDate.Format(dateLayout),
		}
	}

	for _, entry := range entries {
		dto := toEarningDTO(entry)
		held := !out.Verified && entry.AmountTHB > 0 &&
			(entry.Status == models.EarningPending || entry.Status == models.EarningPayable)
		if held {
			expires := entry.OccurredAt.AddDate(0, 0, domain.HeldEarningDays)
			v := expires.Format(dateLayout)
			dto.ExpiresAt = &v
			if out.Held == nil {
				out.Held = &heldDTO{EarliestExpiry: v}
			}
			out.Held.AmountTHB = round2(out.Held.AmountTHB + entry.AmountTHB)
			out.Held.Count++
			if v < out.Held.EarliestExpiry {
				out.Held.EarliestExpiry = v
			}
		}
		out.Entries = append(out.Entries, dto)
	}
	for _, payout := range payouts {
		if payout.Status == models.PayoutVoid {
			continue
		}
		dto := toPayoutDTO(payout)
		if payout.CycleID != nil {
			if cycle, err := s.cycles.Get(ctx, *payout.CycleID); err == nil {
				due := cycle.DueDate.Format(dateLayout)
				dto.DueDate = &due
			}
		}
		if payout.SlipKey != "" {
			if url, err := s.storage.SignedURL(ctx, s.kycBucket(), payout.SlipKey, domain.KYCImageURLLifetime); err == nil {
				dto.SlipURL = &url
			}
		}
		out.Payouts = append(out.Payouts, dto)
	}

	return c.JSON(http.StatusOK, out)
}

func toEarningDTO(e models.CreatorEarning) earningDTO {
	return earningDTO{
		ID:              e.ID,
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
		ID:           p.ID,
		BankCode:     p.BankCode,
		AccountLast4: p.AccountLast4,
		TransferRef:  p.TransferRef,
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

