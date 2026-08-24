package models

import (
	"context"
	"time"
)

// Notification kinds (M9 — A9.2).
const (
	NotifyMention    = "mention"     // someone wrote @you in a comment
	NotifyAssigned   = "assigned"    // a prep task was put in your name
	NotifyPollOpened = "poll_opened" // the group is waiting on your answer
	NotifyPlanReady  = "plan_ready"  // the AI draft you started finished
	NotifyPoints     = "points"      // your public trip earned something
)

// Notification is one thing that happened *to one person*.
//
// Distinct from `activity_logs`, which is what happened in a ROOM: the feed is
// shared and read by whoever opens it, while this is addressed post — it has a
// recipient, it can be unread, and it is the thing a badge counts.
type Notification struct {
	Base
	// Who it is for. Everything here is scoped by this, never by trip alone.
	UserID  string  `gorm:"type:char(36);not null;index:idx_notify_inbox,priority:1" json:"user_id"`
	TripID  *string `gorm:"type:char(36);index" json:"trip_id"`
	Kind    string  `gorm:"type:varchar(20);not null" json:"kind"`
	// Rendered Thai, same reasoning as activity_logs: read far more often than
	// written, and re-deriving a sentence on every read buys nothing.
	Title   string `gorm:"type:varchar(255);not null" json:"title"`
	Body    string `gorm:"type:varchar(500)" json:"body"`
	// Where tapping it should land, as an app path.
	Link    string  `gorm:"type:varchar(255)" json:"link"`
	ActorID string  `gorm:"type:char(36)" json:"actor_id"`
	ReadAt  *time.Time `gorm:"index:idx_notify_inbox,priority:2" json:"read_at"`
}

func (Notification) TableName() string { return "notifications" }

type NotificationStore interface {
	Create(ctx context.Context, n *Notification) error
	// CreateMany is one round trip for a comment that mentions three people.
	CreateMany(ctx context.Context, notifications []Notification) error
	ListForUser(ctx context.Context, userID string, limit int) ([]Notification, error)
	CountUnread(ctx context.Context, userID string) (int64, error)
	MarkRead(ctx context.Context, userID, notificationID string) error
	MarkAllRead(ctx context.Context, userID string) error
}
