package api

import (
	"encoding/json"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

// registerExpenseRoutes covers real spending (DEV_SPEC §5.7 / M16).
//
//	GET/POST  /trips/:tripId/expense           [viewer read / editor write]
//	GET       /trips/:tripId/expense/summary   [viewer]
//	PATCH     /expense/:id                     [entry author, or trip owner]
//	DELETE    /expense/:id                     [entry author, or trip owner]
//
// None of this is ever part of a public payload — see public.handler.go.
func (s *Server) registerExpenseRoutes(v1, trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	editor := s.TripRoleMiddleware(models.TripRoleEditor)

	trips.GET("/:tripId/expense", s.handleListExpenses, viewer)
	trips.POST("/:tripId/expense", s.handleCreateExpense, editor)
	trips.GET("/:tripId/expense/summary", s.handleExpenseSummary, viewer)

	expense := v1.Group("/expense", s.JwtMiddleware)
	resolve := s.ResolveTrip("id", models.TripRoleViewer, s.expenseTrip)
	expense.PATCH("/:id", s.handleUpdateExpense, resolve)
	expense.DELETE("/:id", s.handleDeleteExpense, resolve)
}

func (s *Server) handleListExpenses(c echo.Context) error {
	p := request.BindPagination(c)
	filter := models.ExpenseFilter{
		DayID:  c.QueryParam("day_id"),
		UserID: c.QueryParam("user_id"),
		Split:  c.QueryParam("split_type"),
	}

	entries, total, err := s.expenses.ListByTrip(
		c.Request().Context(), request.TripID(c), filter, p.Limit, p.Offset())
	if err != nil {
		return request.Internal(c, "อ่านรายจ่ายไม่สำเร็จ")
	}
	return request.OK(c, store.NewListResult(entries, total, p))
}

type expenseRequest struct {
	Title        string   `json:"title" validate:"required,max=200"`
	Amount       float64  `json:"amount" validate:"required,gt=0"`
	Currency     string   `json:"currency" validate:"omitempty,len=3"`
	Category     string   `json:"category" validate:"omitempty,oneof=food stay transport ticket shopping other"`
	SplitType    string   `json:"split_type" validate:"omitempty,oneof=shared personal"`
	Participants []string `json:"participants_json" validate:"omitempty,max=30,dive,uuid4"`
	DayID        string   `json:"day_id" validate:"omitempty,uuid4"`
	Note         string   `json:"note" validate:"omitempty,max=500"`
	PaidByUserID string   `json:"paid_by_user_id" validate:"omitempty,uuid4"`
}

// handleCreateExpense snapshots the FX rate at write time. Recomputing with
// today's rate would make last week's dinner cost a different amount every time
// the tab is opened (DEV_SPEC §5.7).
func (s *Server) handleCreateExpense(c echo.Context) error {
	var req expenseRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	paidBy := request.UserID(c)
	if req.PaidByUserID != "" && req.PaidByUserID != paidBy {
		// Recording that someone else paid is normal ("เพื่อนจ่ายไปก่อน"), but
		// only for someone who is actually in the trip.
		if _, err := s.members.Get(ctx, tripID, req.PaidByUserID); err != nil {
			return request.BadRequest(c, "ผู้จ่ายต้องเป็นสมาชิกในทริป")
		}
		paidBy = req.PaidByUserID
	}

	participants, err := s.validParticipants(c, tripID, req)
	if err != nil {
		return err
	}

	entry := &models.ExpenseEntry{
		TripID:       tripID,
		PaidByUserID: paidBy,
		Title:        req.Title,
		Amount:       domain.Round2(req.Amount),
		Currency:     orDefaultString(req.Currency, trip.DestCurrency),
		Category:     orDefaultString(req.Category, models.ExpenseOther),
		SplitType:    orDefaultString(req.SplitType, models.SplitShared),
		Note:         req.Note,
	}
	if req.DayID != "" {
		id := req.DayID
		entry.DayID = &id
	}
	if raw, err := json.Marshal(participants); err == nil {
		entry.Participants = datatypes.JSON(raw)
	}

	if entry.Currency != trip.HomeCurrency {
		if quote, err := s.fx.Quote(ctx, entry.Currency, trip.HomeCurrency); err == nil {
			rate := quote.Rate
			entry.FxRateSnapshot = &rate
		}
	} else {
		one := 1.0
		entry.FxRateSnapshot = &one
	}

	if err := s.expenses.Create(ctx, entry); err != nil {
		return request.Internal(c, "บันทึกรายจ่ายไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionExpenseCreated,
		EventType:  events.TypeExpenseCreated,
		TargetType: "expense", TargetID: entry.ID,
	})
	return request.Created(c, entry)
}

// validParticipants filters the split list down to actual trip members, so a
// stale client cannot divide a bill among people who left.
func (s *Server) validParticipants(c echo.Context, tripID string, req expenseRequest) ([]string, error) {
	if req.SplitType == models.SplitPersonal || len(req.Participants) == 0 {
		return []string{}, nil
	}

	members, err := s.members.ListByTrip(c.Request().Context(), tripID)
	if err != nil {
		return nil, request.Internal(c, "อ่านสมาชิกไม่สำเร็จ")
	}
	valid := make(map[string]bool, len(members))
	for _, m := range members {
		valid[m.UserID] = true
	}

	out := make([]string, 0, len(req.Participants))
	for _, p := range req.Participants {
		if valid[p] {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil, request.BadRequest(c, "ผู้ร่วมหารต้องเป็นสมาชิกในทริป")
	}
	return out, nil
}

func (s *Server) handleUpdateExpense(c echo.Context) error {
	var req expenseRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	entry, err := s.expenses.Get(ctx, tripID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายจ่าย")
	}
	if !s.canEditExpense(c, entry) {
		return request.Forbidden(c, "แก้ไขได้เฉพาะรายการที่ตัวเองบันทึก")
	}

	participants, err := s.validParticipants(c, tripID, req)
	if err != nil {
		return err
	}

	entry.Title = req.Title
	entry.Amount = domain.Round2(req.Amount)
	entry.Note = req.Note
	if req.Category != "" {
		entry.Category = req.Category
	}
	if req.SplitType != "" {
		entry.SplitType = req.SplitType
	}
	if req.DayID != "" {
		id := req.DayID
		entry.DayID = &id
	}
	if raw, err := json.Marshal(participants); err == nil {
		entry.Participants = datatypes.JSON(raw)
	}
	// The currency changing means the old snapshot is for the wrong pair.
	if req.Currency != "" && req.Currency != entry.Currency {
		entry.Currency = req.Currency
		if trip, err := s.trips.GetByID(ctx, tripID); err == nil {
			if quote, err := s.fx.Quote(ctx, entry.Currency, trip.HomeCurrency); err == nil {
				rate := quote.Rate
				entry.FxRateSnapshot = &rate
			}
		}
	}

	if err := s.expenses.Update(ctx, entry); err != nil {
		return request.Internal(c, "บันทึกรายจ่ายไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionExpenseUpdated,
		EventType:  events.TypeExpenseUpdated,
		TargetType: "expense", TargetID: entry.ID,
	})
	return request.OK(c, entry)
}

func (s *Server) handleDeleteExpense(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	entry, err := s.expenses.Get(ctx, tripID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายจ่าย")
	}
	if !s.canEditExpense(c, entry) {
		return request.Forbidden(c, "ลบได้เฉพาะรายการที่ตัวเองบันทึก")
	}

	if err := s.expenses.Delete(ctx, tripID, entry.ID); err != nil {
		return request.Internal(c, "ลบรายจ่ายไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionExpenseDeleted,
		EventType:  events.TypeExpenseUpdated,
		TargetType: "expense", TargetID: entry.ID,
	})
	return request.NoContent(c)
}

func (s *Server) canEditExpense(c echo.Context, e *models.ExpenseEntry) bool {
	return e.PaidByUserID == request.UserID(c) || request.TripRole(c) == models.TripRoleOwner
}

// ExpenseSummaryResponse is the "who owes whom" table plus the FX provenance.
type ExpenseSummaryResponse struct {
	domain.ExpenseSummary
	FXRateNote string                       `json:"fx_rate_note"`
	FXRateAt   time.Time                    `json:"fx_rate_at"`
	Members    map[string]models.PublicUser `json:"members"`
}

func (s *Server) handleExpenseSummary(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	entries, err := s.expenses.AllByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "อ่านรายจ่ายไม่สำเร็จ")
	}
	members, err := s.members.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "อ่านสมาชิกไม่สำเร็จ")
	}

	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}

	inputs := make([]domain.ExpenseInput, 0, len(entries))
	for _, e := range entries {
		in := domain.ExpenseInput{
			ID: e.ID, PaidBy: e.PaidByUserID, Amount: e.Amount,
			Currency: e.Currency, Category: e.Category, SplitType: e.SplitType,
			FxRate: 1,
		}
		if e.FxRateSnapshot != nil {
			in.FxRate = *e.FxRateSnapshot
		}
		if len(e.Participants) > 0 {
			_ = json.Unmarshal(e.Participants, &in.Participants)
		}
		inputs = append(inputs, in)
	}

	summary := domain.ComputeExpenseSummary(inputs, ids, trip.HomeCurrency)

	users, _ := s.users.ListByIDs(ctx, ids)
	people := make(map[string]models.PublicUser, len(users))
	for _, u := range users {
		people[u.ID] = u.Public()
	}

	// The label is the most recent snapshot in play, since that is the newest
	// rate any number on this screen was computed with.
	at := latestSnapshot(entries)
	return request.OK(c, ExpenseSummaryResponse{
		ExpenseSummary: summary,
		FXRateNote:     fxNote(&at),
		FXRateAt:       at,
		Members:        people,
	})
}

func latestSnapshot(entries []models.ExpenseEntry) time.Time {
	latest := time.Now().UTC()
	if len(entries) == 0 {
		return latest
	}
	latest = entries[0].CreatedAt
	for _, e := range entries[1:] {
		if e.CreatedAt.After(latest) {
			latest = e.CreatedAt
		}
	}
	return latest
}
