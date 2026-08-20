package models

import (
	"context"
	"time"
)

// Points transaction types (DEV_SPEC §4.2).
const (
	PointsTypeEarnFromClone = "earn_from_clone"
	PointsTypeRedeemBooking = "redeem_booking"
	PointsTypeAdminAdjust   = "admin_adjust"
)

// Points reference types.
const (
	PointsRefBookingConfirmation = "booking_confirmation"
	PointsRefBookingClick        = "booking_click"
)

// UserPoints is 1:1 with users; user_id is the primary key.
type UserPoints struct {
	UserID         string    `gorm:"type:char(36);primaryKey" json:"user_id"`
	Balance        float64   `gorm:"type:decimal(10,0);not null;default:0" json:"balance"`
	LifetimeEarned float64   `gorm:"type:decimal(10,0);not null;default:0" json:"lifetime_earned"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (UserPoints) TableName() string { return "user_points" }

// PointsTransaction is the append-only ledger behind UserPoints.Balance.
// Amount is positive for an earn and negative for a redeem.
type PointsTransaction struct {
	Base
	UserID  string `gorm:"type:char(36);not null;index:idx_points_user" json:"user_id"`
	Amount  int    `gorm:"not null" json:"amount"`
	Type    string `gorm:"type:varchar(30);not null" json:"type"`
	RefID   string `gorm:"type:char(36)" json:"ref_id"`
	RefType string `gorm:"type:varchar(30)" json:"ref_type"`
	Note    string `gorm:"type:varchar(255)" json:"note"`
}

func (PointsTransaction) TableName() string { return "points_transactions" }

type PointsStore interface {
	Get(ctx context.Context, userID string) (*UserPoints, error)
	// Award writes the ledger row and moves the balance in one transaction.
	Award(ctx context.Context, tx *PointsTransaction) error
	History(ctx context.Context, userID, cursor string, limit int) ([]PointsTransaction, error)
}
