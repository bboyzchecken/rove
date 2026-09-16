package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Paying creators (Feedback #4 — F11, D-21, D-35, D-36, D-40).
//
// The money moves in one direction through four doors, each an admin action
// with an audit entry: a partner's statement makes an earning payable; closing
// a fortnight puts verified creators' payable money into a payout; a transfer
// with its reference marks the payout paid. Nothing here runs on a timer —
// there is no scheduler — so cycles and expiries are brought up to date
// whenever this screen or a creator's statement is opened.
func (s *Server) registerAdminPayoutRoutes(g *echo.Group) {
	g.GET("/payouts", s.handleAdminPayouts)
	g.PUT("/payouts/anchor", s.handleAdminSetPayoutAnchor)
	g.GET("/payouts/earnings", s.handleAdminEarnings)
	g.POST("/payouts/reconcile", s.handleAdminReconcile)
	g.GET("/payouts/cycles/:cycleId", s.handleAdminCycle)
	g.POST("/payouts/cycles/:cycleId/move", s.handleAdminMoveCycle)
	g.POST("/payouts/cycles/:cycleId/close", s.handleAdminCloseCycle)
	g.POST("/payouts/:payoutId/paid", s.handleAdminMarkPaid)

	g.GET("/kyc", s.handleAdminKYCList)
	g.GET("/kyc/:verificationId", s.handleAdminKYCDetail)
	g.POST("/kyc/:verificationId/approve", s.handleAdminKYCApprove)
	g.POST("/kyc/:verificationId/reject", s.handleAdminKYCReject)
	g.POST("/kyc/:verificationId/revoke", s.handleAdminKYCRevoke)
	g.GET("/payout-accounts/pending", s.handleAdminPendingAccounts)
	g.POST("/payout-accounts/:accountId/verify", s.handleAdminVerifyAccount)
	g.POST("/payout-accounts/:accountId/reject", s.handleAdminRejectAccount)
}

const dateLayout = "2006-01-02"

/* -------------------------------------------------------------- cycles --- */

func (s *Server) payoutAnchor(ctx contextT) *time.Time {
	values, err := s.settings.All(ctx)
	if err != nil {
		return nil
	}
	raw := values[domain.SettingPayoutAnchor]
	if raw == "" {
		return nil
	}
	anchor, err := time.Parse(dateLayout, raw)
	if err != nil {
		return nil
	}
	return &anchor
}

// ensureCycles keeps exactly one open cycle ahead once an anchor exists
// (D-40). The rhythm follows the original cutoffs, so pulling one cycle earlier
// for a holiday does not shift every cycle after it.
func (s *Server) ensureCycles(ctx contextT) (*models.PayoutCycle, error) {
	anchor := s.payoutAnchor(ctx)
	if anchor == nil {
		return nil, nil
	}
	open, err := s.cycles.NextOpen(ctx)
	if err != nil || open != nil {
		return open, err
	}

	cycles, err := s.cycles.List(ctx)
	if err != nil {
		return nil, err
	}
	today := domain.Day(time.Now().UTC())
	cutoff := domain.NextCutoff(*anchor, today)
	if len(cycles) > 0 {
		latest := cycles[0].OriginalCutoff
		for _, c := range cycles {
			if c.OriginalCutoff.After(latest) {
				latest = c.OriginalCutoff
			}
		}
		next := domain.Day(latest).AddDate(0, 0, domain.PayoutCycleDays)
		for next.Before(today) {
			next = next.AddDate(0, 0, domain.PayoutCycleDays)
		}
		cutoff = next
	}

	cycle := &models.PayoutCycle{
		CutoffDate: cutoff, OriginalCutoff: cutoff, DueDate: domain.DueDate(cutoff), Status: models.CycleOpen,
	}
	if err := s.cycles.Create(ctx, cycle); err != nil {
		return nil, err
	}
	return cycle, nil
}

type cycleDTO struct {
	ID             string  `json:"id"`
	CutoffDate     string  `json:"cutoff_date"`
	OriginalCutoff string  `json:"original_cutoff"`
	DueDate        string  `json:"due_date"`
	Status         string  `json:"status"`
	MovedReason    string  `json:"moved_reason"`
	ClosedAt       *string `json:"closed_at"`
	PayoutCount    int     `json:"payout_count"`
	PaidCount      int     `json:"paid_count"`
	TotalTHB       float64 `json:"total_thb"`
	// A closed cycle with an unpaid transfer past its due date.
	Overdue bool `json:"overdue"`
}

func (s *Server) toCycleDTO(ctx contextT, c models.PayoutCycle) cycleDTO {
	dto := cycleDTO{
		ID: c.ID, CutoffDate: c.CutoffDate.Format(dateLayout), OriginalCutoff: c.OriginalCutoff.Format(dateLayout),
		DueDate: c.DueDate.Format(dateLayout), Status: c.Status, MovedReason: c.MovedReason,
		ClosedAt: timeString(c.ClosedAt),
	}
	payouts, _ := s.cycles.PayoutsForCycle(ctx, c.ID)
	today := domain.Day(time.Now().UTC())
	for _, p := range payouts {
		if p.Status == models.PayoutVoid {
			continue
		}
		dto.PayoutCount++
		dto.TotalTHB += p.AmountTHB
		if p.Status == models.PayoutPaid {
			dto.PaidCount++
		} else if today.After(domain.Day(c.DueDate)) {
			dto.Overdue = true
		}
	}
	dto.TotalTHB = round2(dto.TotalTHB)
	return dto
}

type readyCreatorDTO struct {
	UserID          string  `json:"user_id"`
	Name            string  `json:"name"`
	Handle          string  `json:"handle"`
	AmountTHB       float64 `json:"amount_thb"`
	EarningCount    int     `json:"earning_count"`
	Verified        bool    `json:"verified"`
	AccountVerified bool    `json:"account_verified"`
	BelowMinimum    bool    `json:"below_minimum"`
	// Will this person be paid when the open cycle closes.
	WillBePaid bool `json:"will_be_paid"`
}

type payoutsOverviewDTO struct {
	AnchorDate       *string           `json:"anchor_date"`
	MinimumPayoutTHB float64           `json:"minimum_payout_thb"`
	NextCycle        *cycleDTO         `json:"next_cycle"`
	Cycles           []cycleDTO        `json:"cycles"`
	PendingCount     int               `json:"pending_count"`
	PendingTHB       float64           `json:"pending_thb"`
	Ready            []readyCreatorDTO `json:"ready"`
	HeldTHB          float64           `json:"held_thb"`
	KYCQueue         int               `json:"kyc_queue"`
	AccountQueue     int               `json:"account_queue"`
	OpenFlags        int               `json:"open_flags"`
}

func (s *Server) handleAdminPayouts(c echo.Context) error {
	ctx := c.Request().Context()
	s.sweepHeldEarnings(ctx, "")

	next, err := s.ensureCycles(ctx)
	if err != nil {
		return request.Internal(c, "โหลดรอบปิดยอดไม่สำเร็จ")
	}
	cycles, err := s.cycles.List(ctx)
	if err != nil {
		return request.Internal(c, "โหลดรอบปิดยอดไม่สำเร็จ")
	}

	out := payoutsOverviewDTO{MinimumPayoutTHB: domain.MinimumPayoutTHB, Cycles: make([]cycleDTO, 0, len(cycles))}
	if anchor := s.payoutAnchor(ctx); anchor != nil {
		v := anchor.Format(dateLayout)
		out.AnchorDate = &v
	}
	if next != nil {
		dto := s.toCycleDTO(ctx, *next)
		out.NextCycle = &dto
	}
	for _, cycle := range cycles {
		out.Cycles = append(out.Cycles, s.toCycleDTO(ctx, cycle))
	}

	pending, _ := s.ledger.EarningsByStatus(ctx, models.EarningPending, "", 500)
	for _, e := range pending {
		out.PendingCount++
		out.PendingTHB += e.AmountTHB
	}
	out.PendingTHB = round2(out.PendingTHB)

	ready, err := s.readyCreators(ctx)
	if err != nil {
		return request.Internal(c, "โหลดยอดพร้อมโอนไม่สำเร็จ")
	}
	out.Ready = ready
	for _, r := range ready {
		if !r.Verified {
			out.HeldTHB += r.AmountTHB
		}
	}
	out.HeldTHB = round2(out.HeldTHB)

	queue, _ := s.kyc.List(ctx, models.KYCSubmitted, 200)
	out.KYCQueue = len(queue)
	accounts, _ := s.kyc.PendingAccountChanges(ctx, 200)
	out.AccountQueue = len(accounts)
	flags, _ := s.ledger.ListFlags(ctx, true, 200)
	out.OpenFlags = len(flags)

	return c.JSON(http.StatusOK, out)
}

// readyCreators groups payable money by creator and says whether each would be
// paid if the open cycle closed now.
func (s *Server) readyCreators(ctx contextT) ([]readyCreatorDTO, error) {
	payable, err := s.ledger.EarningsByStatus(ctx, models.EarningPayable, "", 500)
	if err != nil {
		return nil, err
	}
	byUser := map[string]*readyCreatorDTO{}
	order := []string{}
	for _, e := range payable {
		row, ok := byUser[e.UserID]
		if !ok {
			row = &readyCreatorDTO{UserID: e.UserID}
			byUser[e.UserID] = row
			order = append(order, e.UserID)
		}
		row.AmountTHB += e.AmountTHB
		row.EarningCount++
	}

	out := make([]readyCreatorDTO, 0, len(order))
	for _, userID := range order {
		row := byUser[userID]
		row.AmountTHB = round2(row.AmountTHB)
		if user, err := s.users.GetByID(ctx, userID); err == nil {
			row.Name = user.DisplayName
			if user.Handle != nil {
				row.Handle = *user.Handle
			}
			row.Verified = user.VerifiedAt != nil
		}
		if account, err := s.kyc.CurrentAccount(ctx, userID); err == nil && account != nil {
			row.AccountVerified = account.Status == models.AccountVerified
		}
		row.BelowMinimum = row.AmountTHB < domain.MinimumPayoutTHB
		row.WillBePaid = row.Verified && row.AccountVerified && !row.BelowMinimum
		out = append(out, *row)
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].AmountTHB > out[b].AmountTHB })
	return out, nil
}

type anchorRequest struct {
	AnchorDate string `json:"anchor_date"`
	Reason     string `json:"reason"`
}

func (s *Server) handleAdminSetPayoutAnchor(c echo.Context) error {
	ctx := c.Request().Context()
	var req anchorRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	anchor, err := time.Parse(dateLayout, req.AnchorDate)
	if err != nil {
		return request.BadRequest(c, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD")
	}
	if anchor.Weekday() != time.Tuesday {
		return request.BadRequest(c, "วันตั้งต้นต้องเป็นวันอังคาร")
	}
	if anchor.Before(domain.Day(time.Now().UTC())) {
		return request.BadRequest(c, "วันตั้งต้นต้องไม่อยู่ในอดีต")
	}
	cycles, err := s.cycles.List(ctx)
	if err != nil {
		return request.Internal(c, "โหลดรอบปิดยอดไม่สำเร็จ")
	}
	if len(cycles) > 0 {
		return request.Error(c, http.StatusConflict, "ตั้งวันตั้งต้นไปแล้ว — ถ้าจะเปลี่ยนรอบ ให้เลื่อนรอบให้เร็วขึ้นแทน")
	}

	adminID := request.UserID(c)
	if err := s.settings.Set(ctx, domain.SettingPayoutAnchor, anchor.Format(dateLayout), &adminID); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	s.logAdmin(c, "payout.anchor", "app_settings", domain.SettingPayoutAnchor, req.Reason, nil, anchor.Format(dateLayout))
	return s.handleAdminPayouts(c)
}

type moveCycleRequest struct {
	CutoffDate string `json:"cutoff_date"`
	Reason     string `json:"reason"`
}

// handleAdminMoveCycle pulls a cutoff earlier, never later (D-21).
func (s *Server) handleAdminMoveCycle(c echo.Context) error {
	ctx := c.Request().Context()
	var req moveCycleRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		return request.BadRequest(c, "ต้องกรอกเหตุผลที่เลื่อนรอบ")
	}
	cutoff, err := time.Parse(dateLayout, req.CutoffDate)
	if err != nil {
		return request.BadRequest(c, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD")
	}
	cycle, err := s.cycles.Get(ctx, c.Param("cycleId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรอบนี้")
	}
	if cycle.Status != models.CycleOpen {
		return request.Error(c, http.StatusConflict, "รอบนี้ปิดไปแล้ว")
	}
	if !cutoff.Before(domain.Day(cycle.CutoffDate)) {
		return request.BadRequest(c, "เลื่อนรอบได้เฉพาะให้เร็วขึ้นเท่านั้น")
	}
	if cutoff.Before(domain.Day(time.Now().UTC())) {
		return request.BadRequest(c, "วันปิดยอดต้องไม่อยู่ในอดีต")
	}

	before := cycle.CutoffDate.Format(dateLayout)
	adminID := request.UserID(c)
	cycle.CutoffDate, cycle.DueDate = cutoff, domain.DueDate(cutoff)
	cycle.MovedBy, cycle.MovedReason = &adminID, req.Reason
	if err := s.cycles.Update(ctx, cycle); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	s.logAdmin(c, "payout.move_cycle", "payout_cycle", cycle.ID, req.Reason, before, cutoff.Format(dateLayout))
	return c.JSON(http.StatusOK, s.toCycleDTO(ctx, *cycle))
}

/* ------------------------------------------------------- reconciliation -- */

type adminEarningDTO struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	Name            string  `json:"name"`
	TripID          string  `json:"trip_id"`
	Partner         string  `json:"partner"`
	BookingValueTHB float64 `json:"booking_value_thb"`
	CommissionTHB   float64 `json:"commission_thb"`
	AmountTHB       float64 `json:"amount_thb"`
	Estimated       bool    `json:"estimated"`
	Status          string  `json:"status"`
	OccurredAt      string  `json:"occurred_at"`
}

func (s *Server) handleAdminEarnings(c echo.Context) error {
	ctx := c.Request().Context()
	status := orDefault(c.QueryParam("status"), models.EarningPending)
	earnings, err := s.ledger.EarningsByStatus(ctx, status, c.QueryParam("partner"), 500)
	if err != nil {
		return request.Internal(c, "โหลดรายได้ไม่สำเร็จ")
	}
	names := map[string]string{}
	out := make([]adminEarningDTO, 0, len(earnings))
	for _, e := range earnings {
		name, ok := names[e.UserID]
		if !ok {
			if user, err := s.users.GetByID(ctx, e.UserID); err == nil {
				name = user.DisplayName
			}
			names[e.UserID] = name
		}
		out = append(out, adminEarningDTO{
			ID: e.ID, UserID: e.UserID, Name: name, TripID: e.TripID, Partner: partnerName(e.Partner),
			BookingValueTHB: e.BookingValueTHB, CommissionTHB: e.CommissionTHB, AmountTHB: e.AmountTHB,
			Estimated: e.Estimated, Status: e.Status, OccurredAt: e.OccurredAt.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(http.StatusOK, out)
}

type reconcileRequest struct {
	EarningIDs   []string `json:"earning_ids"`
	StatementRef string   `json:"statement_ref"`
}

// handleAdminReconcile records that a partner actually paid us for these
// bookings — the only thing that makes an earning payable (D-21).
func (s *Server) handleAdminReconcile(c echo.Context) error {
	ctx := c.Request().Context()
	var req reconcileRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.StatementRef = strings.TrimSpace(req.StatementRef)
	if req.StatementRef == "" || len(req.EarningIDs) == 0 {
		return request.BadRequest(c, "เลือกรายการและกรอกเลขใบแจ้งยอดของพาร์ตเนอร์")
	}

	adminID := request.UserID(c)
	moved := 0
	for _, id := range req.EarningIDs {
		earning, err := s.ledger.GetEarning(ctx, id)
		if err != nil || earning.Status != models.EarningPending {
			continue
		}
		source := &models.ValueSource{
			Kind: models.SourcePartnerPaid, ParentID: earning.SourceID, ActorUserID: &adminID,
			SubjectType: models.SubjectEarning, SubjectID: earning.ID, TripID: strOrNil(earning.TripID),
			Snapshot: snapshot(map[string]any{
				"statement_ref": req.StatementRef, "partner": earning.Partner,
				"commission_thb": earning.CommissionTHB, "amount_thb": earning.AmountTHB,
				"admin": s.personSnap(ctx, adminID),
			}),
		}
		if !s.record(ctx, &models.LedgerEntry{Source: source}) {
			return request.Internal(c, "บันทึกการกระทบยอดไม่สำเร็จ")
		}
		ok, err := s.ledger.TransitionEarning(ctx, earning.ID, []string{models.EarningPending}, models.EarningPayable,
			&adminID, "พาร์ตเนอร์จ่ายแล้ว", req.StatementRef)
		if err != nil {
			return request.Internal(c, "บันทึกการกระทบยอดไม่สำเร็จ")
		}
		if ok {
			moved++
		}
	}
	s.logAdmin(c, "payout.reconcile", "partner_statement", req.StatementRef, "", nil,
		map[string]any{"earning_ids": req.EarningIDs, "moved": moved})
	return c.JSON(http.StatusOK, map[string]int{"moved": moved})
}

/* ---------------------------------------------------------------- close -- */

type adminPayoutDTO struct {
	ID            string  `json:"id"`
	UserID        string  `json:"user_id"`
	Name          string  `json:"name"`
	Handle        string  `json:"handle"`
	AmountTHB     float64 `json:"amount_thb"`
	EarningCount  int     `json:"earning_count"`
	Status        string  `json:"status"`
	AccountKind   string  `json:"account_kind"`
	BankCode      string  `json:"bank_code"`
	AccountLast4  string  `json:"account_last4"`
	AccountName   string  `json:"account_name"`
	AccountNumber string  `json:"account_number"`
	TransferRef   string  `json:"transfer_ref"`
	SlipURL       *string `json:"slip_url"`
	PaidAt        *string `json:"paid_at"`
}

type cycleDetailDTO struct {
	Cycle   cycleDTO         `json:"cycle"`
	Payouts []adminPayoutDTO `json:"payouts"`
}

func (s *Server) cycleDetail(c echo.Context, cycle *models.PayoutCycle) (cycleDetailDTO, error) {
	ctx := c.Request().Context()
	payouts, err := s.cycles.PayoutsForCycle(ctx, cycle.ID)
	if err != nil {
		return cycleDetailDTO{}, err
	}
	box, _ := s.kycBox()
	out := cycleDetailDTO{Cycle: s.toCycleDTO(ctx, *cycle), Payouts: make([]adminPayoutDTO, 0, len(payouts))}
	for _, p := range payouts {
		if p.Status == models.PayoutVoid {
			continue
		}
		dto := adminPayoutDTO{
			ID: p.ID, UserID: p.UserID, AmountTHB: p.AmountTHB, EarningCount: p.EarningCount, Status: p.Status,
			AccountKind: p.AccountKind, BankCode: p.BankCode, AccountLast4: p.AccountLast4, AccountName: p.AccountName,
			TransferRef: p.TransferRef, PaidAt: timeString(p.PaidAt),
		}
		if user, err := s.users.GetByID(ctx, p.UserID); err == nil {
			dto.Name = user.DisplayName
			if user.Handle != nil {
				dto.Handle = *user.Handle
			}
		}
		// The admin needs the full number only while the transfer is owed.
		if p.Status == models.PayoutPending && p.AccountID != nil && box != nil {
			if account, err := s.kyc.GetAccount(ctx, *p.AccountID); err == nil {
				if number, err := box.Open(account.NumberSealed); err == nil {
					dto.AccountNumber = number
				}
			}
		}
		if p.SlipKey != "" {
			if url, err := s.storage.SignedURL(ctx, s.kycBucket(), p.SlipKey, domain.KYCImageURLLifetime); err == nil {
				dto.SlipURL = &url
			}
		}
		out.Payouts = append(out.Payouts, dto)
	}
	return out, nil
}

func (s *Server) handleAdminCycle(c echo.Context) error {
	cycle, err := s.cycles.Get(c.Request().Context(), c.Param("cycleId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรอบนี้")
	}
	out, err := s.cycleDetail(c, cycle)
	if err != nil {
		return request.Internal(c, "โหลดรอบไม่สำเร็จ")
	}
	s.logAdmin(c, "payout.view_cycle", "payout_cycle", cycle.ID, "", nil, nil)
	return c.JSON(http.StatusOK, out)
}

// handleAdminCloseCycle builds the transfers for a fortnight. Only verified
// creators with a verified account and at least the minimum are paid; everyone
// else stays payable and rolls into the next cycle (D-21, D-35).
func (s *Server) handleAdminCloseCycle(c echo.Context) error {
	ctx := c.Request().Context()
	adminID := request.UserID(c)

	cycle, err := s.cycles.Get(ctx, c.Param("cycleId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรอบนี้")
	}
	if cycle.Status != models.CycleOpen {
		return request.Error(c, http.StatusConflict, "รอบนี้ปิดไปแล้ว")
	}
	s.sweepHeldEarnings(ctx, "")

	payable, err := s.ledger.EarningsByStatus(ctx, models.EarningPayable, "", 500)
	if err != nil {
		return request.Internal(c, "โหลดยอดไม่สำเร็จ")
	}
	byUser := map[string][]models.CreatorEarning{}
	for _, e := range payable {
		byUser[e.UserID] = append(byUser[e.UserID], e)
	}

	periodStart := domain.Day(cycle.CutoffDate).AddDate(0, 0, -domain.PayoutCycleDays+1)
	created := 0
	for userID, earnings := range byUser {
		user, err := s.users.GetByID(ctx, userID)
		if err != nil || user.VerifiedAt == nil {
			continue
		}
		account, err := s.kyc.CurrentAccount(ctx, userID)
		if err != nil || account == nil || account.Status != models.AccountVerified {
			continue
		}
		total := 0.0
		ids := make([]string, 0, len(earnings))
		for _, e := range earnings {
			total += e.AmountTHB
			ids = append(ids, e.ID)
		}
		total = round2(total)
		if total < domain.MinimumPayoutTHB {
			continue
		}

		payout := &models.Payout{
			UserID: userID, PeriodStart: periodStart, PeriodEnd: domain.Day(cycle.CutoffDate),
			AmountTHB: total, EarningCount: len(ids), Status: models.PayoutPending,
			CycleID: &cycle.ID, AccountID: &account.ID, AccountKind: account.Kind, BankCode: account.BankCode,
			AccountLast4: account.NumberLast4, AccountName: account.AccountName,
		}
		if err := s.cycles.CreatePayout(ctx, payout); err != nil {
			return request.Internal(c, "สร้างรายการโอนไม่สำเร็จ")
		}
		if _, err := s.ledger.MoveEarningsToPayout(ctx, ids, payout.ID, &adminID); err != nil {
			logger.L().WithError(err).WithField("payout_id", payout.ID).Error("move earnings to payout")
			// The move rolled back, so the earnings are still payable; the empty
			// payout must not be paid, and a retry must not see it as owed.
			payout.Status, payout.Note = models.PayoutVoid, "ย้ายรายได้เข้ารอบไม่สำเร็จ"
			_ = s.cycles.UpdatePayout(ctx, payout)
			return request.Internal(c, "นับรายได้เข้ารอบไม่สำเร็จ — ลองปิดรอบอีกครั้ง")
		}
		created++
	}

	now := time.Now().UTC()
	cycle.Status, cycle.ClosedAt, cycle.ClosedBy = models.CycleClosed, &now, &adminID
	if err := s.cycles.Update(ctx, cycle); err != nil {
		return request.Internal(c, "ปิดรอบไม่สำเร็จ")
	}
	if _, err := s.ensureCycles(ctx); err != nil {
		logger.L().WithError(err).Error("open next payout cycle")
	}
	s.logAdmin(c, "payout.close_cycle", "payout_cycle", cycle.ID, "", nil, map[string]any{"payouts": created})

	out, err := s.cycleDetail(c, cycle)
	if err != nil {
		return request.Internal(c, "โหลดรอบไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, out)
}

// handleAdminMarkPaid records the transfer: its reference, optionally the slip.
func (s *Server) handleAdminMarkPaid(c echo.Context) error {
	ctx := c.Request().Context()
	adminID := request.UserID(c)

	payout, err := s.cycles.GetPayout(ctx, c.Param("payoutId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการโอนนี้")
	}
	if payout.Status != models.PayoutPending {
		return request.Error(c, http.StatusConflict, "รายการนี้บันทึกโอนไปแล้ว")
	}
	ref := strings.TrimSpace(c.FormValue("transfer_ref"))
	if ref == "" {
		return request.BadRequest(c, "กรอกเลขอ้างอิงการโอน")
	}

	if file, err := c.FormFile("slip"); err == nil {
		contentType := file.Header.Get("Content-Type")
		ext, ok := photoContentTypes[contentType]
		if !ok && contentType == "application/pdf" {
			ext, ok = ".pdf", true
		}
		if !ok {
			return request.BadRequest(c, "สลิปต้องเป็นรูปหรือ PDF")
		}
		src, err := file.Open()
		if err != nil {
			return request.BadRequest(c, "อ่านไฟล์สลิปไม่ได้")
		}
		key := fmt.Sprintf("slips/%s/%s%s", payout.UserID, uuid.NewString(), ext)
		err = s.storage.Put(ctx, s.kycBucket(), key, src, contentType)
		_ = src.Close()
		if err != nil {
			return request.Internal(c, "อัปโหลดสลิปไม่สำเร็จ")
		}
		payout.SlipKey = key
	}

	now := time.Now().UTC()
	payout.Status, payout.TransferRef, payout.PaidAt, payout.PaidBy = models.PayoutPaid, ref, &now, &adminID
	if err := s.cycles.UpdatePayout(ctx, payout); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	earnings, err := s.ledger.EarningsForPayout(ctx, payout.ID)
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	for _, e := range earnings {
		if _, err := s.ledger.TransitionEarning(ctx, e.ID, []string{models.EarningInPayout}, models.EarningPaid,
			&adminID, "โอนแล้ว", ref); err != nil {
			return request.Internal(c, "บันทึกไม่สำเร็จ")
		}
	}

	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: payout.UserID,
		Kind:   models.NotifyPayoutPaid,
		Title:  fmt.Sprintf("โอนรายได้ ฿%s ให้แล้ว", formatBaht(payout.AmountTHB)),
		Body:   fmt.Sprintf("เข้าบัญชีลงท้าย %s · เลขอ้างอิง %s", payout.AccountLast4, ref),
		Link:   "/profile",
	})
	s.logAdmin(c, "payout.mark_paid", "payout", payout.ID, ref, nil,
		map[string]any{"amount_thb": payout.AmountTHB, "transfer_ref": ref})

	return c.JSON(http.StatusOK, map[string]string{"status": payout.Status})
}

func formatBaht(v float64) string {
	if v == float64(int64(v)) {
		return fmt.Sprintf("%d", int64(v))
	}
	return fmt.Sprintf("%.2f", v)
}

/* ------------------------------------------------------- held earnings --- */

// sweepHeldEarnings is D-35 without a scheduler: income that has waited 180 days
// for its creator to verify expires, and anyone within 14 days of that is warned
// once. Called for one person when they open their statement, and for everyone
// when an admin opens the payouts screen.
func (s *Server) sweepHeldEarnings(ctx contextT, userID string) {
	now := time.Now().UTC()
	expireBefore := now.AddDate(0, 0, -domain.HeldEarningDays)
	warnBefore := now.AddDate(0, 0, -(domain.HeldEarningDays - domain.ExpiryWarningDays))

	held, err := s.ledger.HeldEarnings(ctx, userID, &warnBefore)
	if err != nil {
		logger.L().WithError(err).Error("read held earnings")
		return
	}

	type warning struct {
		amount float64
		first  time.Time
	}
	warnings := map[string]*warning{}

	for _, e := range held {
		if e.OccurredAt.Before(expireBefore) {
			source := &models.ValueSource{
				Kind: models.SourceEarningExpired, ParentID: e.SourceID,
				SubjectType: models.SubjectEarning, SubjectID: e.ID, TripID: strOrNil(e.TripID),
				Snapshot: snapshot(map[string]any{
					"amount_thb": e.AmountTHB, "occurred_at": e.OccurredAt.Format(time.RFC3339),
					"held_days": domain.HeldEarningDays, "creator": s.personSnap(ctx, e.UserID),
				}),
			}
			if !s.record(ctx, &models.LedgerEntry{Source: source}) {
				continue
			}
			if _, err := s.ledger.TransitionEarning(ctx, e.ID,
				[]string{models.EarningPending, models.EarningPayable}, models.EarningExpired,
				nil, "ไม่ได้ยืนยันตัวตนภายใน 180 วัน", source.ID); err != nil {
				logger.L().WithError(err).Error("expire held earning")
			}
			continue
		}
		fresh, err := s.kyc.MarkNotice(ctx, e.ID)
		if err != nil || !fresh {
			continue
		}
		w, ok := warnings[e.UserID]
		if !ok {
			w = &warning{first: e.OccurredAt}
			warnings[e.UserID] = w
		}
		w.amount += e.AmountTHB
		if e.OccurredAt.Before(w.first) {
			w.first = e.OccurredAt
		}
	}

	for uid, w := range warnings {
		expires := w.first.AddDate(0, 0, domain.HeldEarningDays)
		_ = s.notifications.Create(ctx, &models.Notification{
			UserID: uid,
			Kind:   models.NotifyExpiring,
			Title:  fmt.Sprintf("รายได้ ฿%s จะหมดอายุ %s", formatBaht(round2(w.amount)), thaiShortDate(expires)),
			Body:   "ยืนยันตัวตนเพื่อเปิดรับรายได้ก่อนวันหมดอายุ ไม่งั้นรายได้ก้อนนี้จะหายไป",
			Link:   "/profile/verify",
		})
	}
}

var thaiMonths = []string{"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."}

func thaiShortDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), thaiMonths[t.Month()-1], t.Year()+543)
}

/* ----------------------------------------------------------------- KYC --- */

type adminKYCRowDTO struct {
	ID             string  `json:"id"`
	UserID         string  `json:"user_id"`
	Name           string  `json:"name"`
	Handle         string  `json:"handle"`
	Status         string  `json:"status"`
	LegalType      string  `json:"legal_type"`
	LegalName      string  `json:"legal_name"`
	AccountName    string  `json:"account_name"`
	SubmittedAt    *string `json:"submitted_at"`
	SharedAccounts int     `json:"shared_accounts"`
}

func (s *Server) handleAdminKYCList(c echo.Context) error {
	ctx := c.Request().Context()
	rows, err := s.kyc.List(ctx, orDefault(c.QueryParam("status"), models.KYCSubmitted), 200)
	if err != nil {
		return request.Internal(c, "โหลดคิวยืนยันตัวตนไม่สำเร็จ")
	}
	out := make([]adminKYCRowDTO, 0, len(rows))
	for _, v := range rows {
		dto := adminKYCRowDTO{
			ID: v.ID, UserID: v.UserID, Status: v.Status, LegalType: v.LegalType, LegalName: v.LegalName,
			SubmittedAt: timeString(v.SubmittedAt),
		}
		if user, err := s.users.GetByID(ctx, v.UserID); err == nil {
			dto.Name = user.DisplayName
			if user.Handle != nil {
				dto.Handle = *user.Handle
			}
		}
		if account, err := s.kyc.CurrentAccount(ctx, v.UserID); err == nil && account != nil {
			dto.AccountName = account.AccountName
			shared, _ := s.kyc.UsersSharingAccount(ctx, account.NumberHash, v.UserID)
			dto.SharedAccounts = len(shared)
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

type sharedUserDTO struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Handle string `json:"handle"`
}

type adminAccountDTO struct {
	payoutAccountDTO
	Number string          `json:"number"`
	Shared []sharedUserDTO `json:"shared_with"`
}

type adminKYCDetailDTO struct {
	adminKYCRowDTO
	Phone         string           `json:"phone"`
	PhoneVerified bool             `json:"phone_verified"`
	Email         string           `json:"email"`
	EmailVerified bool             `json:"email_verified"`
	IDNumber      string           `json:"id_number"`
	IDCardURL     *string          `json:"id_card_url"`
	SelfieURL     *string          `json:"selfie_url"`
	Account       *adminAccountDTO `json:"account"`
	RejectedSteps []string         `json:"rejected_steps"`
	RejectReason  string           `json:"reject_reason"`
	ReviewedAt    *string          `json:"reviewed_at"`
	History       []auditDTO       `json:"history"`
}

func (s *Server) handleAdminKYCDetail(c echo.Context) error {
	ctx := c.Request().Context()
	v, err := s.kyc.Get(ctx, c.Param("verificationId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}
	box, err := s.kycBox()
	if err != nil {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่เปิดระบบยืนยันตัวตน")
	}

	dto := adminKYCDetailDTO{
		adminKYCRowDTO: adminKYCRowDTO{
			ID: v.ID, UserID: v.UserID, Status: v.Status, LegalType: v.LegalType, LegalName: v.LegalName,
			SubmittedAt: timeString(v.SubmittedAt),
		},
		Phone: v.Phone, PhoneVerified: v.PhoneVerifiedAt != nil,
		Email: v.Email, EmailVerified: v.EmailVerifiedAt != nil,
		RejectedSteps: rejectedSteps(v), RejectReason: v.RejectReason, ReviewedAt: timeString(v.ReviewedAt),
		History: []auditDTO{},
	}
	if user, err := s.users.GetByID(ctx, v.UserID); err == nil {
		dto.Name = user.DisplayName
		if user.Handle != nil {
			dto.Handle = *user.Handle
		}
	}
	if v.IDNumberSealed != "" {
		dto.IDNumber, _ = box.Open(v.IDNumberSealed)
	}
	for key, target := range map[string]**string{v.IDCardKey: &dto.IDCardURL, v.SelfieKey: &dto.SelfieURL} {
		if key == "" {
			continue
		}
		if url, err := s.storage.SignedURL(ctx, s.kycBucket(), key, domain.KYCImageURLLifetime); err == nil {
			*target = &url
		}
	}
	if account, err := s.kyc.CurrentAccount(ctx, v.UserID); err == nil && account != nil {
		dto.AccountName = account.AccountName
		ad := &adminAccountDTO{payoutAccountDTO: *toPayoutAccountDTO(account), Shared: []sharedUserDTO{}}
		ad.Number, _ = box.Open(account.NumberSealed)
		shared, _ := s.kyc.UsersSharingAccount(ctx, account.NumberHash, v.UserID)
		for _, id := range shared {
			row := sharedUserDTO{ID: id}
			if user, err := s.users.GetByID(ctx, id); err == nil {
				row.Name = user.DisplayName
				if user.Handle != nil {
					row.Handle = *user.Handle
				}
			}
			ad.Shared = append(ad.Shared, row)
		}
		dto.SharedAccounts = len(shared)
		dto.Account = ad
	}
	if logs, err := s.audit.List(ctx, "creator_verification", v.ID, 50); err == nil {
		for _, row := range logs {
			dto.History = append(dto.History, auditDTO{
				ID: row.ID, ActorID: row.ActorID, Action: row.Action, TargetType: row.TargetType,
				TargetID: row.TargetID, Reason: row.Reason, Before: rawOrNull(row.Before), After: rawOrNull(row.After),
				OccurredAt: row.OccurredAt.UTC().Format(time.RFC3339),
			})
		}
	}

	// Somebody looked at a person's ID card — that is itself worth a line.
	s.logAdmin(c, "kyc.view", "creator_verification", v.ID, "", nil, nil)
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleAdminKYCApprove(c echo.Context) error {
	ctx := c.Request().Context()
	adminID := request.UserID(c)
	v, err := s.kyc.Get(ctx, c.Param("verificationId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}
	if v.Status != models.KYCSubmitted {
		return request.Error(c, http.StatusConflict, "คำขอนี้ไม่ได้อยู่ในคิวตรวจ")
	}
	user, err := s.users.GetByID(ctx, v.UserID)
	if err != nil {
		return request.Internal(c, "โหลดผู้ใช้ไม่สำเร็จ")
	}

	now := time.Now().UTC()
	v.Status, v.ReviewedAt, v.ReviewedBy = models.KYCApproved, &now, &adminID
	v.RejectedSteps, v.RejectReason = nil, ""
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if account, err := s.kyc.CurrentAccount(ctx, v.UserID); err == nil && account != nil {
		account.Status, account.VerifiedAt, account.VerifiedBy, account.RejectReason = models.AccountVerified, &now, &adminID, ""
		_ = s.kyc.SaveAccount(ctx, account)
	}
	user.VerifiedAt = &now
	if err := s.users.Update(ctx, user); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: v.UserID, Kind: models.NotifyKYC,
		Title: "ยืนยันตัวตนผ่านแล้ว",
		Body:  "โปรไฟล์ของคุณได้ป้ายยืนยันตัวตนแล้ว และรายได้จะเข้ารอบโอนถัดไป",
		Link:  "/profile",
	})
	s.logAdmin(c, "kyc.approve", "creator_verification", v.ID, "", models.KYCSubmitted, models.KYCApproved)
	return c.NoContent(http.StatusNoContent)
}

type kycRejectRequest struct {
	Steps  []string `json:"steps"`
	Reason string   `json:"reason"`
}

var kycStepLabels = map[string]string{
	models.KYCStepBasic:     "ข้อมูลพื้นฐาน",
	models.KYCStepIdentity:  "เลขบัตร",
	models.KYCStepDocuments: "รูปบัตรและเซลฟี่",
	models.KYCStepAccount:   "บัญชีรับเงิน",
}

func (s *Server) handleAdminKYCReject(c echo.Context) error {
	ctx := c.Request().Context()
	adminID := request.UserID(c)
	var req kycRejectRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || len(req.Steps) == 0 {
		return request.BadRequest(c, "เลือกขั้นที่ไม่ผ่านและกรอกเหตุผล")
	}
	labels := []string{}
	for _, step := range req.Steps {
		label, ok := kycStepLabels[step]
		if !ok {
			return request.BadRequest(c, "ขั้นที่เลือกไม่ถูกต้อง")
		}
		labels = append(labels, label)
	}

	v, err := s.kyc.Get(ctx, c.Param("verificationId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}
	if v.Status != models.KYCSubmitted {
		return request.Error(c, http.StatusConflict, "คำขอนี้ไม่ได้อยู่ในคิวตรวจ")
	}

	raw, _ := json.Marshal(req.Steps)
	now := time.Now().UTC()
	v.Status, v.RejectedSteps, v.RejectReason = models.KYCRejected, raw, req.Reason
	v.ReviewedAt, v.ReviewedBy = &now, &adminID
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if slicesContains(req.Steps, models.KYCStepAccount) {
		if account, err := s.kyc.CurrentAccount(ctx, v.UserID); err == nil && account != nil {
			account.Status, account.RejectReason = models.AccountRejected, req.Reason
			_ = s.kyc.SaveAccount(ctx, account)
		}
	}

	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: v.UserID, Kind: models.NotifyKYC,
		Title: "ยืนยันตัวตนยังไม่ผ่าน — แก้ " + strings.Join(labels, ", "),
		Body:  req.Reason,
		Link:  "/profile/verify",
	})
	s.logAdmin(c, "kyc.reject", "creator_verification", v.ID, req.Reason, nil, req.Steps)
	return c.NoContent(http.StatusNoContent)
}

type reasonRequest struct {
	Reason string `json:"reason"`
}

func (s *Server) handleAdminKYCRevoke(c echo.Context) error {
	ctx := c.Request().Context()
	var req reasonRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		return request.BadRequest(c, "ต้องกรอกเหตุผล")
	}
	v, err := s.kyc.Get(ctx, c.Param("verificationId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}
	if v.Status != models.KYCApproved {
		return request.Error(c, http.StatusConflict, "ถอนได้เฉพาะคนที่ยืนยันตัวตนแล้ว")
	}
	user, err := s.users.GetByID(ctx, v.UserID)
	if err != nil {
		return request.Internal(c, "โหลดผู้ใช้ไม่สำเร็จ")
	}
	now := time.Now().UTC()
	adminID := request.UserID(c)
	v.Status, v.RejectReason, v.ReviewedAt, v.ReviewedBy = models.KYCRevoked, req.Reason, &now, &adminID
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	user.VerifiedAt = nil
	if err := s.users.Update(ctx, user); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: v.UserID, Kind: models.NotifyKYC,
		Title: "สถานะยืนยันตัวตนถูกระงับ", Body: req.Reason, Link: "/profile/verify",
	})
	s.logAdmin(c, "kyc.revoke", "creator_verification", v.ID, req.Reason, models.KYCApproved, models.KYCRevoked)
	return c.NoContent(http.StatusNoContent)
}

/* ------------------------------------------------------ account changes -- */

type adminPendingAccountDTO struct {
	adminAccountDTO
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	LegalName string `json:"legal_name"`
	CreatedAt string `json:"created_at"`
}

func (s *Server) handleAdminPendingAccounts(c echo.Context) error {
	ctx := c.Request().Context()
	accounts, err := s.kyc.PendingAccountChanges(ctx, 200)
	if err != nil {
		return request.Internal(c, "โหลดคำขอเปลี่ยนบัญชีไม่สำเร็จ")
	}
	box, err := s.kycBox()
	if err != nil {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่เปิดระบบยืนยันตัวตน")
	}
	out := make([]adminPendingAccountDTO, 0, len(accounts))
	for i := range accounts {
		a := accounts[i]
		row := adminPendingAccountDTO{
			adminAccountDTO: adminAccountDTO{payoutAccountDTO: *toPayoutAccountDTO(&a), Shared: []sharedUserDTO{}},
			UserID:          a.UserID, CreatedAt: a.CreatedAt.UTC().Format(time.RFC3339),
		}
		row.Number, _ = box.Open(a.NumberSealed)
		if user, err := s.users.GetByID(ctx, a.UserID); err == nil {
			row.Name = user.DisplayName
		}
		if v, err := s.kyc.GetByUser(ctx, a.UserID); err == nil && v != nil {
			row.LegalName = v.LegalName
		}
		shared, _ := s.kyc.UsersSharingAccount(ctx, a.NumberHash, a.UserID)
		for _, id := range shared {
			row.Shared = append(row.Shared, sharedUserDTO{ID: id})
		}
		out = append(out, row)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleAdminVerifyAccount(c echo.Context) error {
	ctx := c.Request().Context()
	account, err := s.kyc.GetAccount(ctx, c.Param("accountId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบบัญชีนี้")
	}
	if account.Status != models.AccountPending {
		return request.Error(c, http.StatusConflict, "บัญชีนี้ตรวจไปแล้ว")
	}
	now := time.Now().UTC()
	adminID := request.UserID(c)
	account.Status, account.VerifiedAt, account.VerifiedBy = models.AccountVerified, &now, &adminID
	if err := s.kyc.SaveAccount(ctx, account); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: account.UserID, Kind: models.NotifyKYC,
		Title: "บัญชีรับเงินใหม่ใช้ได้แล้ว",
		Body:  "รายได้รอบถัดไปจะโอนเข้าบัญชีลงท้าย " + account.NumberLast4,
		Link:  "/profile",
	})
	s.logAdmin(c, "account.verify", "payout_account", account.ID, "", models.AccountPending, models.AccountVerified)
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handleAdminRejectAccount(c echo.Context) error {
	ctx := c.Request().Context()
	var req reasonRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		return request.BadRequest(c, "ต้องกรอกเหตุผล")
	}
	account, err := s.kyc.GetAccount(ctx, c.Param("accountId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบบัญชีนี้")
	}
	if account.Status != models.AccountPending {
		return request.Error(c, http.StatusConflict, "บัญชีนี้ตรวจไปแล้ว")
	}
	account.Status, account.RejectReason = models.AccountRejected, req.Reason
	if err := s.kyc.SaveAccount(ctx, account); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: account.UserID, Kind: models.NotifyKYC,
		Title: "บัญชีรับเงินใหม่ยังใช้ไม่ได้", Body: req.Reason, Link: "/profile/verify",
	})
	s.logAdmin(c, "account.reject", "payout_account", account.ID, req.Reason, models.AccountPending, models.AccountRejected)
	return c.NoContent(http.StatusNoContent)
}

func slicesContains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}
