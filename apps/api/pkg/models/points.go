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
	// Points turned into a discount code (A12.10) — a spend, never a balance
	// reset: the ledger still has to answer "where did 2,400 points go?".
	PointsReasonRedeem = "redeem"
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

// PointsCursor is a position in one person's ledger (A23.1).
//
// Two columns, not one: `occurred_at` alone is not unique — a clone award and
// a publish bonus can land in the same second — and a cursor that can point at
// two rows either repeats one or skips one. The id breaks the tie.
type PointsCursor struct {
	OccurredAt time.Time
	ID         string
}

// PointsByTrip is what one published trip has paid its creator (A23.2).
type PointsByTrip struct {
	// How many awards — i.e. how many clones actually paid out.
	Count int
	// Their sum.
	Points int
}

type PointsStore interface {
	Add(ctx context.Context, entry *UserPoints) error
	Balance(ctx context.Context, userID string) (int, error)
	List(ctx context.Context, userID string, limit int) ([]UserPoints, error)
	// ListPage walks the whole ledger a page at a time (A23.1). A nil cursor
	// starts at the newest row; the bool says whether another page exists,
	// answered by reading one row past the page rather than by a COUNT over a
	// table that only grows.
	ListPage(ctx context.Context, userID string, before *PointsCursor, limit int) ([]UserPoints, bool, error)
	// Earned sums only the positive rows — the creator page shows what a
	// profile has earned, not what is left after spending (W11.2).
	Earned(ctx context.Context, userID string) (int, error)
	// EarnedByTrip groups this user's awards for one reason by the trip they
	// came from, so "which of my plans earned this" is one query rather than
	// one per trip (A23.2).
	EarnedByTrip(ctx context.Context, userID, reason string) (map[string]PointsByTrip, error)
}
