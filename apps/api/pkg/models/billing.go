package models

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/datatypes"
)

// Bill & Payment (M20 — DEV_SPEC §4.2).
//
// One table holds every purchase, whatever was sold. `kind` says what it was,
// `period_start`/`period_end` are filled in only for a subscription invoice,
// and `provider`/`provider_ref` are where a real gateway will write its charge
// id. Adding monthly billing therefore adds rows, not columns.

// Order is a purchase and its receipt — the same record, because they are the
// same fact. Once written it is never edited: a refund is a status change and a
// correction is a new order, so that a receipt a user has already downloaded
// cannot quietly become a different document.
type Order struct {
	Base
	UserID string `gorm:"type:char(36);not null;index:idx_order_user_issued,priority:1" json:"user_id"`
	// Human-facing receipt number, "RV-2569-000123". Unique so a race that
	// produced the same sequence twice fails loudly instead of printing two
	// receipts with one number.
	Number string `gorm:"type:varchar(24);not null;uniqueIndex" json:"number"`
	Kind   string `gorm:"type:varchar(24);not null;default:'ai_credit'" json:"kind"`
	Status string `gorm:"type:varchar(12);not null;default:'paid'" json:"status"`
	Title  string `gorm:"type:varchar(160);not null" json:"title"`
	// The lines, as JSON rather than a child table. A receipt is an immutable
	// document that is only ever read whole; a join buys nothing and a schema
	// change to `order_lines` would rewrite receipts that were already issued.
	Lines datatypes.JSON `gorm:"type:json" json:"lines"`

	SubtotalTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"subtotal_thb"`
	DiscountTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"discount_thb"`
	TotalTHB    float64 `gorm:"type:decimal(12,2);not null;default:0" json:"total_thb"`
	Currency    string  `gorm:"type:char(3);not null;default:'THB'" json:"currency"`

	Method      string `gorm:"type:varchar(16);not null;default:'card'" json:"method"`
	MethodLabel string `gorm:"type:varchar(60)" json:"method_label"`
	// Points debited for this order. Points are not baht and are never added to
	// one — they are reported side by side.
	PointsSpent int `gorm:"not null;default:0" json:"points_spent"`

	// The trip the purchase was used on, when it was bought for one. Nullable
	// and never a foreign key: deleting a trip must not delete its receipts.
	TripID    *string `gorm:"type:char(36);index" json:"trip_id"`
	TripTitle string  `gorm:"type:varchar(160)" json:"trip_title"`

	Provider    string `gorm:"type:varchar(24)" json:"provider"`
	ProviderRef string `gorm:"type:varchar(120)" json:"provider_ref"`
	// True while there is no gateway behind a cash order (§16).
	Simulated bool `gorm:"not null;default:false" json:"simulated"`

	SubscriptionID *string    `gorm:"type:char(36);index" json:"subscription_id"`
	PeriodStart    *time.Time `json:"period_start"`
	PeriodEnd      *time.Time `json:"period_end"`

	IssuedAt   time.Time  `gorm:"not null;index:idx_order_user_issued,priority:2" json:"issued_at"`
	PaidAt     *time.Time `json:"paid_at"`
	RefundedAt *time.Time `json:"refunded_at"`
}

func (Order) TableName() string { return "orders" }

// OrderLine is one row of a receipt. Stored inside Order.Lines as JSON.
type OrderLine struct {
	Label         string  `json:"label"`
	Quantity      int     `json:"quantity"`
	UnitAmountTHB float64 `json:"unit_amount_thb"`
	AmountTHB     float64 `json:"amount_thb"`
}

// DecodeOrderLines reads the JSON column back. A receipt that cannot be parsed
// renders as no lines rather than as an error page: the totals beside it are
// stored as columns and are still true.
func DecodeOrderLines(raw datatypes.JSON) []OrderLine {
	if len(raw) == 0 {
		return nil
	}
	var out []OrderLine
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

// EncodeOrderLines is the other direction, for the handler that writes one.
func EncodeOrderLines(lines []OrderLine) datatypes.JSON {
	raw, err := json.Marshal(lines)
	if err != nil {
		return datatypes.JSON("[]")
	}
	return datatypes.JSON(raw)
}

// Subscription statuses.
const (
	SubStatusActive   = "active"
	SubStatusPastDue  = "past_due"
	SubStatusCanceled = "canceled"
)

// Subscription is a standing plan. No row exists for a free user — the API
// synthesises the free plan rather than writing a row per signup, so this table
// only ever holds people who are actually being charged.
type Subscription struct {
	Base
	UserID   string  `gorm:"type:char(36);not null;index" json:"user_id"`
	PlanID   string  `gorm:"type:varchar(40);not null" json:"plan_id"`
	Status   string  `gorm:"type:varchar(12);not null;default:'active'" json:"status"`
	Interval string  `gorm:"type:varchar(8);not null;default:'month'" json:"interval"`
	PriceTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"price_thb"`

	CurrentPeriodStart time.Time `gorm:"not null" json:"current_period_start"`
	CurrentPeriodEnd   time.Time `gorm:"not null" json:"current_period_end"`
	// Set when the user has cancelled but the paid period is still running.
	CancelAtPeriodEnd bool `gorm:"not null;default:false" json:"cancel_at_period_end"`

	Provider    string `gorm:"type:varchar(24)" json:"provider"`
	ProviderRef string `gorm:"type:varchar(120)" json:"provider_ref"`

	CanceledAt *time.Time `json:"canceled_at"`
}

func (Subscription) TableName() string { return "subscriptions" }

// BillingSummary is computed, never stored: a purchase total that is kept in a
// column is a purchase total that can disagree with the receipts.
type BillingSummary struct {
	Orders            int
	AIDraftsPurchased int
	TotalSpentTHB     float64
	PointsSpent       int
	Since             *time.Time
}

type BillingStore interface {
	// CreateOrder assigns the receipt number and writes the order in one
	// transaction, so two concurrent purchases cannot share a number.
	CreateOrder(ctx context.Context, order *Order) error
	ListOrders(ctx context.Context, userID string, limit int) ([]Order, error)
	GetOrder(ctx context.Context, userID, orderID string) (*Order, error)
	Summary(ctx context.Context, userID string) (*BillingSummary, error)

	// ActiveSubscription returns nil (with no error) for a free user.
	ActiveSubscription(ctx context.Context, userID string) (*Subscription, error)
	SaveSubscription(ctx context.Context, sub *Subscription) error
}
