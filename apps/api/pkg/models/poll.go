package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Poll is a question with fixed options, for the decisions that are not about
// a plan variant (M9 — A9.3): which hotel, which day for the theme park, who
// is renting the car.
//
// Answers live in the existing `votes` table with `target_type='poll'` and the
// chosen option index in `value` — a poll answer is still one member's one
// choice about one thing, which is exactly what that table already models.
type Poll struct {
	Base
	TripID   string  `gorm:"type:char(36);not null;index" json:"trip_id"`
	ItemID   *string `gorm:"type:char(36);index" json:"item_id"`
	Question string  `gorm:"type:varchar(255);not null" json:"question"`
	// []string, in display order. The index is the answer.
	Options   datatypes.JSON `gorm:"type:json;not null" json:"options"`
	ClosesAt  *time.Time     `json:"closes_at"`
	Closed    bool           `gorm:"not null;default:false" json:"closed"`
	CreatedBy string         `gorm:"type:char(36)" json:"created_by"`
}

func (Poll) TableName() string { return "polls" }

type PollStore interface {
	Create(ctx context.Context, p *Poll) error
	Get(ctx context.Context, tripID, pollID string) (*Poll, error)
	ListByTrip(ctx context.Context, tripID string) ([]Poll, error)
	Update(ctx context.Context, p *Poll) error
	Delete(ctx context.Context, tripID, pollID string) error
}
