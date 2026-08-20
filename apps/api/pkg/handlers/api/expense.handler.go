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

// Real spending and the settle-up (M16 — A16.3).
//
// This data never appears in a public payload, at any visibility setting
// (W16.5): who paid for dinner is nobody else's business.
func (s *Server) registerExpenseRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/expenses/summary", s.handleExpenseSummary, view)
	g.POST("/:tripId/expenses", s.handleCreateExpense, edit)
	g.PATCH("/:tripId/expenses/:expenseId", s.handleUpdateExpense, edit)
	g.DELETE("/:tripId/expenses/:expenseId", s.handleDeleteExpense, edit)
	g.POST("/:tripId/expenses/settle", s.handleSettleUp, edit)
}

func (s *Server) handleExpenseSummary(c echo.Context) error {
	summary, err := s.expenseSummaryOf(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดค่าใช้จ่ายไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, summary)
}

func (s *Server) expenseSummaryOf(ctx contextT, tripID string) (expenseSummaryDTO, error) {
	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return expenseSummaryDTO{}, err
	}
	entries, err := s.expenses.ListByTrip(ctx, tripID)
	if err != nil {
		return expenseSummaryDTO{}, err
	}
	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return expenseSummaryDTO{}, err
	}
	settlements, _ := s.expenses.ListSettlements(ctx, tripID)

	inputs := make([]domain.ExpenseInput, 0, len(entries))
	dtos := make([]expenseEntryDTO, 0, len(entries))
	for _, e := range entries {
		inputs = append(inputs, domain.ExpenseInput{
			ID:           e.ID,
			Scope:        e.Scope,
			Amount:       e.Amount,
			Currency:     e.Currency,
			PaidBy:       e.PaidBy,
			Participants: jsonStrings(toJSONRaw(e.Participants)),
		})
		dtos = append(dtos, toExpenseDTO(e))
	}

	settled := make([]domain.SettledPair, 0, len(settlements))
	for _, st := range settlements {
		settled = append(settled, domain.SettledPair{FromUserID: st.FromUserID, ToUserID: st.ToUserID})
	}

	summary := domain.ComputeExpenses(inputs, roster.ids(), tripFxRate(*trip), settled)

	return expenseSummaryDTO{
		SharedTotalTHB:   summary.SharedTotalTHB,
		PersonalTotalTHB: summary.PersonalTotalTHB,
		TotalTHB:         summary.TotalTHB,
		PerMember:        summary.PerMember,
		Settlements:      summary.Settlements,
		Entries:          dtos,
	}, nil
}

type expenseRequest struct {
	Date         string   `json:"date"`
	Title        string   `json:"title"`
	Category     string   `json:"category"`
	Scope        string   `json:"scope" validate:"omitempty,oneof=shared personal"`
	Amount       *float64 `json:"amount"`
	Currency     string   `json:"currency"`
	PaidBy       string   `json:"paid_by"`
	Participants []string `json:"participants"`
	Note         string   `json:"note"`
}

func (s *Server) handleCreateExpense(c echo.Context) error {
	var req expenseRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Title == "" || req.Amount == nil || *req.Amount <= 0 {
		return request.BadRequest(c, "ใส่ชื่อรายการและจำนวนเงินด้วย")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	date := domain.Day(time.Now().UTC())
	if parsed, ok := parseDateParam(req.Date); ok {
		date = parsed
	}

	paidBy := req.PaidBy
	if paidBy == "" {
		paidBy = request.UserID(c)
	}

	entry := &models.ExpenseEntry{
		TripID:       tripID,
		Date:         date,
		Title:        req.Title,
		Category:     orDefault(req.Category, "อื่นๆ"),
		Scope:        orDefault(req.Scope, models.ScopeShared),
		Amount:       *req.Amount,
		Currency:     orDefault(req.Currency, "JPY"),
		PaidBy:       paidBy,
		Participants: jsonArray(req.Participants),
		Note:         req.Note,
	}
	if err := s.expenses.Create(ctx, entry); err != nil {
		return request.Internal(c, "บันทึกค่าใช้จ่ายไม่สำเร็จ")
	}

	s.track(c, tripID, "จ่าย \""+entry.Title+"\"", events.TypeExpenseChanged, "expense", entry.ID)
	return c.JSON(http.StatusCreated, toExpenseDTO(*entry))
}

func (s *Server) handleUpdateExpense(c echo.Context) error {
	var req expenseRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	entry, err := s.expenses.Get(ctx, tripID, c.Param("expenseId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}

	if req.Title != "" {
		entry.Title = req.Title
	}
	if req.Category != "" {
		entry.Category = req.Category
	}
	if req.Scope != "" {
		entry.Scope = req.Scope
	}
	if req.Amount != nil {
		entry.Amount = *req.Amount
	}
	if req.Currency != "" {
		entry.Currency = req.Currency
	}
	if req.PaidBy != "" {
		entry.PaidBy = req.PaidBy
	}
	if req.Participants != nil {
		entry.Participants = jsonArray(req.Participants)
	}
	if parsed, ok := parseDateParam(req.Date); ok {
		entry.Date = parsed
	}

	if err := s.expenses.Update(ctx, entry); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypeExpenseChanged, "expense", entry.ID)
	return c.JSON(http.StatusOK, toExpenseDTO(*entry))
}

func (s *Server) handleDeleteExpense(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.expenses.Delete(ctx, tripID, c.Param("expenseId")); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypeExpenseChanged, "expense", c.Param("expenseId"))
	return c.NoContent(http.StatusNoContent)
}

type settleRequest struct {
	FromUserID string  `json:"from_user_id" validate:"required"`
	ToUserID   string  `json:"to_user_id" validate:"required"`
	AmountTHB  float64 `json:"amount_thb"`
}

// handleSettleUp records that a debt was paid back outside the app, so the
// settle-up card stops suggesting it. ROVE never moves money itself.
func (s *Server) handleSettleUp(c echo.Context) error {
	var req settleRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	err := s.expenses.AddSettlement(ctx, &models.Settlement{
		TripID:     tripID,
		FromUserID: req.FromUserID,
		ToUserID:   req.ToUserID,
		AmountTHB:  req.AmountTHB,
		SettledAt:  time.Now().UTC(),
	})
	if err != nil {
		return request.Internal(c, "บันทึกการจ่ายคืนไม่สำเร็จ")
	}

	text := "จ่ายคืนกันเรียบร้อย"
	if roster, err := s.loadMembers(ctx, tripID); err == nil {
		from := roster.users[req.FromUserID].DisplayName
		to := roster.users[req.ToUserID].DisplayName
		if from != "" && to != "" {
			text = from + " จ่ายคืน " + to + " แล้ว"
		}
	}
	s.track(c, tripID, text, events.TypeExpenseChanged, "expense", tripID)

	summary, err := s.expenseSummaryOf(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดค่าใช้จ่ายไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, summary)
}
