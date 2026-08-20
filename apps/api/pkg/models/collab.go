package models

import (
	"context"
	"time"
)

// Comment and vote targets (DEV_SPEC M9).
const (
	TargetTrip        = "trip"
	TargetDay         = "day"
	TargetItem        = "item"
	TargetWish        = "wish"
	TargetWindow      = "window"
	TargetDestination = "destination"
)

// Comment is a single-level thread — replies are flat, by design: a nested
// discussion in a four-person trip chat is a thread nobody reads twice.
type Comment struct {
	Base
	TripID     string `gorm:"type:char(36);not null;index:idx_comment_target" json:"trip_id"`
	TargetType string `gorm:"type:varchar(12);not null;index:idx_comment_target" json:"target_type"`
	TargetID   string `gorm:"type:char(36);not null;index:idx_comment_target" json:"target_id"`
	UserID     string `gorm:"type:char(36);not null" json:"user_id"`
	Body       string `gorm:"type:text;not null" json:"body"`
	Resolved   bool   `gorm:"not null;default:false" json:"resolved"`
}

func (Comment) TableName() string { return "comments" }

// Vote is one member's thumb on one thing. The composite key means a second
// vote replaces the first rather than stacking.
type Vote struct {
	TripID     string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	TargetType string    `gorm:"type:varchar(12);primaryKey" json:"target_type"`
	TargetID   string    `gorm:"type:varchar(64);primaryKey" json:"target_id"`
	UserID     string    `gorm:"type:char(36);primaryKey" json:"user_id"`
	Value      int       `gorm:"not null;default:1" json:"value"`
	VotedAt    time.Time `gorm:"not null" json:"voted_at"`
}

func (Vote) TableName() string { return "votes" }

// Activity is the trip's feed. `text` is stored already rendered in Thai: the
// feed is read far more often than it is written, and re-deriving a sentence
// from a verb code on every read buys nothing.
type Activity struct {
	Base
	TripID     string  `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID     string  `gorm:"type:char(36);not null" json:"user_id"`
	Text       string  `gorm:"type:varchar(255);not null" json:"text"`
	TargetType string  `gorm:"type:varchar(12)" json:"target_type"`
	TargetID   *string `gorm:"type:varchar(64)" json:"target_id"`
}

func (Activity) TableName() string { return "activity_logs" }

type CollabStore interface {
	CreateComment(ctx context.Context, c *Comment) error
	GetComment(ctx context.Context, tripID, commentID string) (*Comment, error)
	ListComments(ctx context.Context, tripID, targetType, targetID string) ([]Comment, error)
	ListTripComments(ctx context.Context, tripID string) ([]Comment, error)
	UpdateComment(ctx context.Context, c *Comment) error
	DeleteComment(ctx context.Context, tripID, commentID string) error

	SetVote(ctx context.Context, v *Vote) error
	ListVotes(ctx context.Context, tripID, targetType, targetID string) ([]Vote, error)

	Log(ctx context.Context, a *Activity) error
	// ListActivity is keyset-paginated: the feed must stay stable while new
	// rows arrive at the top (§7.1).
	ListActivity(ctx context.Context, tripID, cursor string, limit int) ([]Activity, error)
}
