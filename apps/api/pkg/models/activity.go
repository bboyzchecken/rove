package models

import (
	"context"

	"gorm.io/datatypes"
)

// Activity actions. Every mutation writes one of these AND publishes the
// matching SSE event (DEV_SPEC §6.2) — the feed and the realtime stream are
// two views of the same fact.
const (
	ActionTripCreated     = "trip.created"
	ActionTripUpdated     = "trip.updated"
	ActionMemberJoined    = "member.joined"
	ActionMemberRemoved   = "member.removed"
	ActionMemberRoleSet   = "member.role_changed"
	ActionWishlistAdded   = "wishlist.added"
	ActionWishlistUpdated = "wishlist.updated"
	ActionWishlistRemoved = "wishlist.removed"
	ActionPlanGenerated   = "plan.generated"
	ActionPlanUpdated     = "plan.updated"
	ActionPlanFrozen      = "plan.frozen"
	ActionItemCreated     = "item.created"
	ActionItemUpdated     = "item.updated"
	ActionItemMoved       = "item.moved"
	ActionItemDeleted     = "item.deleted"
	ActionCommentCreated  = "comment.created"
	ActionExpenseCreated  = "expense.created"
	ActionExpenseUpdated  = "expense.updated"
	ActionExpenseDeleted  = "expense.deleted"
	ActionPrepUpdated     = "prep.updated"
	ActionBookingClicked  = "booking.clicked"
	ActionExportRequested = "export.requested"
)

type ActivityLog struct {
	Base
	TripID     string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID     string         `gorm:"type:char(36)" json:"user_id"`
	Action     string         `gorm:"type:varchar(40);not null" json:"action"`
	TargetType string         `gorm:"type:varchar(20)" json:"target_type"`
	TargetID   string         `gorm:"type:char(36)" json:"target_id"`
	Meta       datatypes.JSON `gorm:"type:json" json:"meta"`
}

func (ActivityLog) TableName() string { return "activity_logs" }

type ActivityStore interface {
	Log(ctx context.Context, a *ActivityLog) error
	// List is cursor-paginated on created_at so the feed stays stable while
	// new rows arrive.
	List(ctx context.Context, tripID, cursor string, limit int) ([]ActivityLog, error)
}
