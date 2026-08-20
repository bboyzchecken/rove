package models

import (
	"context"

	"gorm.io/datatypes"
)

// Expense categories.
const (
	ExpenseFood      = "food"
	ExpenseStay      = "stay"
	ExpenseTransport = "transport"
	ExpenseTicket    = "ticket"
	ExpenseShopping  = "shopping"
	ExpenseOther     = "other"
)

// Split types (DEV_SPEC M16).
const (
	SplitShared   = "shared"
	SplitPersonal = "personal"
)

// ExpenseEntry is money actually spent, which is a different thing from the
// Budget estimate derived from plan items — the two never mix in the UI.
//
// Privacy: expense rows are NEVER part of a public payload
// (trips.public_hide_expense, DEV_SPEC §4.3).
type ExpenseEntry struct {
	Base
	TripID         string         `gorm:"type:char(36);not null;index:idx_expense_trip_day,priority:1" json:"trip_id"`
	DayID          *string        `gorm:"type:char(36);index:idx_expense_trip_day,priority:2" json:"day_id"`
	PaidByUserID   string         `gorm:"type:char(36);not null;index" json:"paid_by_user_id"`
	Title          string         `gorm:"type:varchar(200);not null" json:"title"`
	Amount         float64        `gorm:"type:decimal(12,2);not null" json:"amount"`
	Currency       string         `gorm:"type:varchar(3);not null;default:'JPY'" json:"currency"`
	Category       string         `gorm:"type:varchar(20);not null;default:'other'" json:"category"`
	SplitType      string         `gorm:"type:varchar(10);not null;default:'shared'" json:"split_type"`
	Participants   datatypes.JSON `gorm:"column:participants_json;type:json" json:"participants_json"`
	FxRateSnapshot *float64       `gorm:"type:decimal(10,4)" json:"fx_rate_snapshot"`
	Note           string         `gorm:"type:varchar(500)" json:"note"`
}

func (ExpenseEntry) TableName() string { return "expense_entries" }

type ExpenseFilter struct {
	DayID  string
	UserID string
	Split  string
}

type ExpenseStore interface {
	ListByTrip(ctx context.Context, tripID string, f ExpenseFilter, limit, offset int) ([]ExpenseEntry, int64, error)
	AllByTrip(ctx context.Context, tripID string) ([]ExpenseEntry, error)
	Create(ctx context.Context, e *ExpenseEntry) error
	Get(ctx context.Context, tripID, id string) (*ExpenseEntry, error)
	// TripID resolves the owning trip for the /expense/:id routes.
	TripID(ctx context.Context, id string) (string, error)
	Update(ctx context.Context, e *ExpenseEntry) error
	Delete(ctx context.Context, tripID, id string) error
	// TotalHomeForUser powers the "how much did I spend this year" stat (A17.1).
	TotalHomeForUser(ctx context.Context, userID string) (float64, error)
}
