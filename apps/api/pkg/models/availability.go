package models

import (
	"context"
	"time"
)

// Availability marks (M2.5 — the date board).
const (
	MarkFree  = "free"
	MarkMaybe = "maybe"
	MarkBusy  = "busy"
)

// Availability is one member's answer for one calendar day.
//
// A row exists only for a day someone actually marked: "no row" means "has not
// answered", which is a different thing from "busy" and the board draws them
// differently.
type Availability struct {
	TripID string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	UserID string    `gorm:"type:char(36);primaryKey" json:"user_id"`
	Date   time.Time `gorm:"type:date;primaryKey" json:"date"`
	Mark   string    `gorm:"type:varchar(10);not null;default:'free'" json:"mark"`
}

func (Availability) TableName() string { return "trip_availability" }

// AvailabilitySubmission records that a member considers their answer final,
// so the board can nudge the ones who have not finished rather than the ones
// who genuinely have no free days.
type AvailabilitySubmission struct {
	TripID      string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	UserID      string    `gorm:"type:char(36);primaryKey" json:"user_id"`
	SubmittedAt time.Time `gorm:"not null" json:"submitted_at"`
}

func (AvailabilitySubmission) TableName() string { return "trip_availability_submissions" }

// DateStore is the whole date-coordination surface (A2.6).
type DateStore interface {
	// Replace overwrites this member's marks for the given dates; a nil mark
	// clears them.
	Replace(ctx context.Context, tripID, userID string, dates []time.Time, mark *string) error
	List(ctx context.Context, tripID string) ([]Availability, error)
	// Months returns the distinct months that carry at least one mark.
	Months(ctx context.Context, tripID string) ([]time.Time, error)
	Submit(ctx context.Context, tripID, userID string) error
	Submissions(ctx context.Context, tripID string) ([]AvailabilitySubmission, error)
	ClearMember(ctx context.Context, tripID, userID string) error
}
