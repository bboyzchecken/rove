package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Expense scopes (DEV_SPEC M16).
const (
	ScopeShared   = "shared"
	ScopePersonal = "personal"
)

// ExpenseEntry is real money that was actually spent — never mixed with the
// Budget tab's estimate, which is derived from plan items instead.
type ExpenseEntry struct {
	Base
	TripID   string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	Date     time.Time      `gorm:"type:date;not null" json:"date"`
	Title    string         `gorm:"type:varchar(200);not null" json:"title"`
	Category string         `gorm:"type:varchar(40);not null;default:'อื่นๆ'" json:"category"`
	Scope    string         `gorm:"type:varchar(10);not null;default:'shared'" json:"scope"`
	Amount   float64        `gorm:"type:decimal(12,2);not null" json:"amount"`
	Currency string         `gorm:"type:varchar(3);not null;default:'JPY'" json:"currency"`
	PaidBy   string         `gorm:"type:char(36);not null;index" json:"paid_by"`
	// Empty for a personal entry; a shared one divides evenly across these.
	Participants datatypes.JSON `gorm:"type:json" json:"participants"`
	Note         string         `gorm:"type:varchar(255)" json:"note"`
}

func (ExpenseEntry) TableName() string { return "expense_entries" }

// Settlement records that a debt was paid back outside the app, so the
// settle-up card stops suggesting it.
type Settlement struct {
	Base
	TripID     string    `gorm:"type:char(36);not null;index" json:"trip_id"`
	FromUserID string    `gorm:"type:char(36);not null" json:"from_user_id"`
	ToUserID   string    `gorm:"type:char(36);not null" json:"to_user_id"`
	AmountTHB  float64   `gorm:"type:decimal(12,2)" json:"amount_thb"`
	SettledAt  time.Time `gorm:"not null" json:"settled_at"`
}

func (Settlement) TableName() string { return "expense_settlements" }

type ExpenseStore interface {
	Create(ctx context.Context, e *ExpenseEntry) error
	Get(ctx context.Context, tripID, expenseID string) (*ExpenseEntry, error)
	ListByTrip(ctx context.Context, tripID string) ([]ExpenseEntry, error)
	Update(ctx context.Context, e *ExpenseEntry) error
	Delete(ctx context.Context, tripID, expenseID string) error

	AddSettlement(ctx context.Context, s *Settlement) error
	ListSettlements(ctx context.Context, tripID string) ([]Settlement, error)
}
