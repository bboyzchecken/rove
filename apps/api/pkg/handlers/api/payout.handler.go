package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Ops side of the partner economy (M22 — A12.11 / A12.12).
//
// Admin-only: this is the screen somebody reads before money leaves the
// company account, and the queue somebody works before an agent calls a
// customer back.
func (s *Server) registerPayoutRoutes(g *echo.Group) {
	g.GET("/payouts", s.handlePayoutReport)
	g.POST("/payouts", s.handleRunPayout)
	g.GET("/leads", s.handleAdminLeads)
	g.PATCH("/leads/:leadId", s.handleAdminUpdateLead)
}

/* -------------------------------------------------- payout report ------- */

type payoutRowDTO struct {
	UserID       string  `json:"user_id"`
	Name         string  `json:"name"`
	Handle       string  `json:"handle"`
	AmountTHB    float64 `json:"amount_thb"`
	EarningCount int     `json:"earning_count"`
	// True when any line in this row was accrued from a rate table rather
	// than reported by the partner.
	HasEstimates bool `json:"has_estimates"`
	// False below the minimum transfer — the balance rolls into next month.
	Payable bool `json:"payable"`
}

type payoutReportDTO struct {
	Period           string         `json:"period"`
	TotalTHB         float64        `json:"total_thb"`
	PayableTHB       float64        `json:"payable_thb"`
	MinimumPayoutTHB float64        `json:"minimum_payout_thb"`
	SharePercent     int            `json:"share_percent"`
	Rows             []payoutRowDTO `json:"rows"`
	Paid             []payoutDTO    `json:"paid"`
}

type runPayoutRequest struct {
	Period string `json:"period"`
	UserID string `json:"user_id"`
	Note   string `json:"note"`
}

// handlePayoutReport answers "what do we owe creators for this month".
func (s *Server) handlePayoutReport(c echo.Context) error {
	ctx := c.Request().Context()

	from, to, period, err := monthWindow(c.QueryParam("month"))
	if err != nil {
		return request.BadRequest(c, "รูปแบบเดือนต้องเป็น YYYY-MM")
	}

	rows, err := s.payoutRows(ctx, from, to)
	if err != nil {
		return request.Internal(c, "โหลดรายงานไม่สำเร็จ")
	}
	paid, _ := s.payouts.List(ctx, from, to)

	out := payoutReportDTO{
		Period:           period,
		MinimumPayoutTHB: domain.MinimumPayoutTHB,
		SharePercent:     domain.CreatorSharePercent,
		Rows:             rows,
		Paid:             make([]payoutDTO, 0, len(paid)),
	}
	for _, row := range rows {
		out.TotalTHB += row.AmountTHB
		if row.Payable {
			out.PayableTHB += row.AmountTHB
		}
	}
	for _, p := range paid {
		out.Paid = append(out.Paid, toPayoutDTO(p))
	}

	return c.JSON(http.StatusOK, out)
}

// handleRunPayout settles one creator for one period.
//
// One creator at a time on purpose: a button that pays everybody is a button
// somebody clicks twice.
func (s *Server) handleRunPayout(c echo.Context) error {
	ctx := c.Request().Context()

	var req runPayoutRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if req.UserID == "" {
		return request.BadRequest(c, "ต้องระบุครีเอเตอร์")
	}

	from, to, _, err := monthWindow(req.Period)
	if err != nil {
		return request.BadRequest(c, "รูปแบบเดือนต้องเป็น YYYY-MM")
	}

	earnings, err := s.earnings.ListPayable(ctx, from, to)
	if err != nil {
		return request.Internal(c, "โหลดรายการไม่สำเร็จ")
	}

	ids := make([]string, 0, len(earnings))
	total := 0.0
	for _, earning := range earnings {
		if earning.UserID != req.UserID {
			continue
		}
		ids = append(ids, earning.ID)
		total += earning.AmountTHB
	}

	if len(ids) == 0 {
		return request.BadRequest(c, "ไม่มียอดค้างจ่ายของครีเอเตอร์นี้ในเดือนนั้น")
	}
	if total < domain.MinimumPayoutTHB {
		return request.Error(c, http.StatusConflict, "ยอดยังไม่ถึงขั้นต่ำสำหรับโอน")
	}

	now := time.Now().UTC()
	payout := &models.Payout{
		UserID:       req.UserID,
		PeriodStart:  from,
		PeriodEnd:    to.AddDate(0, 0, -1),
		AmountTHB:    total,
		EarningCount: len(ids),
		Status:       models.PayoutPaid,
		Note:         req.Note,
		PaidAt:       &now,
	}
	if err := s.payouts.Create(ctx, payout); err != nil {
		return request.Internal(c, "บันทึกการจ่ายไม่สำเร็จ")
	}
	if err := s.earnings.AttachToPayout(ctx, payout.ID, ids, now); err != nil {
		return request.Internal(c, "ปิดยอดไม่สำเร็จ")
	}

	return c.JSON(http.StatusCreated, toPayoutDTO(*payout))
}

// payoutRows groups a period's payable earnings by creator, biggest first.
func (s *Server) payoutRows(ctx contextT, from, to time.Time) ([]payoutRowDTO, error) {
	earnings, err := s.earnings.ListPayable(ctx, from, to)
	if err != nil {
		return nil, err
	}

	byUser := map[string]*payoutRowDTO{}
	order := make([]string, 0, 8)

	for _, earning := range earnings {
		row, ok := byUser[earning.UserID]
		if !ok {
			row = &payoutRowDTO{UserID: earning.UserID}
			byUser[earning.UserID] = row
			order = append(order, earning.UserID)
		}
		row.AmountTHB += earning.AmountTHB
		row.EarningCount++
		row.HasEstimates = row.HasEstimates || earning.Estimated
	}

	out := make([]payoutRowDTO, 0, len(order))
	for _, userID := range order {
		row := byUser[userID]
		row.Payable = row.AmountTHB >= domain.MinimumPayoutTHB
		if user, err := s.users.GetByID(ctx, userID); err == nil {
			row.Name = user.DisplayName
			if user.Handle != nil {
				row.Handle = *user.Handle
			}
		}
		out = append(out, *row)
	}

	sort.SliceStable(out, func(a, b int) bool { return out[a].AmountTHB > out[b].AmountTHB })
	return out, nil
}

// monthWindow turns "2026-08" into [1 Aug, 1 Sep). An empty value means the
// month we are in, which is what the report opens on.
func monthWindow(value string) (from, to time.Time, label string, err error) {
	now := time.Now().UTC()
	if value == "" {
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		return from, from.AddDate(0, 1, 0), from.Format("2006-01"), nil
	}

	from, err = time.Parse("2006-01", value)
	if err != nil {
		return time.Time{}, time.Time{}, "", err
	}
	return from, from.AddDate(0, 1, 0), value, nil
}

/* ------------------------------------------------------- lead queue ----- */

type adminLeadDTO struct {
	leadDTO
	TripID             string  `json:"trip_id"`
	Destination        string  `json:"destination"`
	PartySize          int     `json:"party_size"`
	BudgetPerPersonTHB float64 `json:"budget_per_person_thb"`
	AdminNote          string  `json:"admin_note"`
}

type updateLeadRequest struct {
	Status    string `json:"status"`
	AdminNote string `json:"admin_note"`
}

func (s *Server) handleAdminLeads(c echo.Context) error {
	leads, err := s.leads.List(c.Request().Context(), c.QueryParam("status"), 100)
	if err != nil {
		return request.Internal(c, "โหลดคำขอไม่สำเร็จ")
	}

	out := make([]adminLeadDTO, 0, len(leads))
	for _, lead := range leads {
		out = append(out, s.toAdminLeadDTO(lead))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleAdminUpdateLead(c echo.Context) error {
	ctx := c.Request().Context()

	lead, err := s.leads.Get(ctx, c.Param("leadId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}

	var req updateLeadRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if req.Status != "" {
		if !validLeadStatus(req.Status) {
			return request.BadRequest(c, "สถานะไม่ถูกต้อง")
		}
		lead.Status = req.Status
	}
	if req.AdminNote != "" {
		lead.AdminNote = req.AdminNote
	}

	if err := s.leads.Update(ctx, lead); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, s.toAdminLeadDTO(*lead))
}

func validLeadStatus(status string) bool {
	switch status {
	case models.LeadNew, models.LeadSent, models.LeadContacted, models.LeadWon, models.LeadLost:
		return true
	}
	return false
}

func (s *Server) toAdminLeadDTO(lead models.AgentLead) adminLeadDTO {
	return adminLeadDTO{
		leadDTO:            s.toLeadDTO(lead),
		TripID:             lead.TripID,
		Destination:        lead.Destination,
		PartySize:          lead.PartySize,
		BudgetPerPersonTHB: lead.BudgetPerPersonTHB,
		AdminNote:          lead.AdminNote,
	}
}
