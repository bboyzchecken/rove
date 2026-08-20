package models

import "context"

// Comment / vote targets.
const (
	TargetTrip     = "trip"
	TargetPlan     = "plan"
	TargetDay      = "day"
	TargetItem     = "item"
	TargetWishlist = "wishlist"
	TargetPoll     = "poll"
)

// Comment threads are one level deep: a reply has ParentID, a reply to a reply
// does not exist (DEV_SPEC §5.9).
type Comment struct {
	Base
	TripID     string  `gorm:"type:char(36);not null;index:idx_comment_target,priority:1" json:"trip_id"`
	TargetType string  `gorm:"type:varchar(20);not null;index:idx_comment_target,priority:2" json:"target_type"`
	TargetID   string  `gorm:"type:char(36);not null;index:idx_comment_target,priority:3" json:"target_id"`
	UserID     string  `gorm:"type:char(36);not null" json:"user_id"`
	Body       string  `gorm:"type:text;not null" json:"body"`
	ParentID   *string `gorm:"type:char(36);index" json:"parent_id"`
}

func (Comment) TableName() string { return "comments" }

type Vote struct {
	Base
	TripID     string `gorm:"type:char(36);not null;index" json:"trip_id"`
	TargetType string `gorm:"type:varchar(20);not null;uniqueIndex:uq_vote,priority:1" json:"target_type"`
	TargetID   string `gorm:"type:char(36);not null;uniqueIndex:uq_vote,priority:2" json:"target_id"`
	UserID     string `gorm:"type:char(36);not null;uniqueIndex:uq_vote,priority:3" json:"user_id"`
	Choice     string `gorm:"type:varchar(40);not null" json:"choice"`
	Reason     string `gorm:"type:varchar(500)" json:"reason"`
}

func (Vote) TableName() string { return "votes" }

type CommentStore interface {
	List(ctx context.Context, tripID, targetType, targetID string) ([]Comment, error)
	ListByTrip(ctx context.Context, tripID, cursor string, limit int) ([]Comment, error)
	Create(ctx context.Context, c *Comment) error
	Get(ctx context.Context, tripID, id string) (*Comment, error)
	TripID(ctx context.Context, id string) (string, error)
	Delete(ctx context.Context, tripID, id string) error
}

type VoteStore interface {
	Upsert(ctx context.Context, v *Vote) error
	List(ctx context.Context, tripID, targetType, targetID string) ([]Vote, error)
}
