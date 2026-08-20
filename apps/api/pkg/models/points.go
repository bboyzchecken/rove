package models

import (
	"context"
	"time"
)

// Point ledger reasons (DEV_SPEC §6.5).
const (
	PointsReasonReferral    = "referral"
	PointsReasonBooking     = "booking_confirmed"
	PointsReasonClone       = "trip_cloned"
	PointsReasonPublish     = "trip_published"
	PointsReasonAIDraft     = "ai_draft"
	PointsReasonAdjustment  = "adjustment"
)

// UserPoints is an append-only ledger, never a balance column.
//
// A balance you can only reach by summing rows cannot silently drift, and
// "why do I have 1,240 points?" is a question the product has to be able to
// answer line by line.
type UserPoints struct {
	Base
	UserID string `gorm:"type:char(36);not null;index" json:"user_id"`
	// Positive to award, negative to spend.
	Delta     int        `gorm:"not null" json:"delta"`
	Reason    string     `gorm:"type:varchar(40);not null" json:"reason"`
	Note      string     `gorm:"type:varchar(255)" json:"note"`
	TripID    *string    `gorm:"type:char(36);index" json:"trip_id"`
	OccurredAt time.Time `gorm:"not null" json:"occurred_at"`
}

func (UserPoints) TableName() string { return "user_points" }

type PointsStore interface {
	Add(ctx context.Context, entry *UserPoints) error
	Balance(ctx context.Context, userID string) (int, error)
	List(ctx context.Context, userID string, limit int) ([]UserPoints, error)
}
