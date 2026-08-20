package models

import (
	"context"
	"time"
)

// Invite is a link, not an e-mail. These groups live in a LINE chat, and the
// link is what actually gets pasted there — so the token is the whole record.
type Invite struct {
	Base
	TripID    string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	Token     string     `gorm:"type:varchar(64);not null;uniqueIndex" json:"token"`
	Role      string     `gorm:"type:varchar(20);not null;default:'editor'" json:"role"`
	CreatedBy string     `gorm:"type:char(36);not null" json:"created_by"`
	ExpiresAt time.Time  `gorm:"not null" json:"expires_at"`
	// Nil while the link is still open; a used link stays for the audit trail
	// rather than being deleted.
	RevokedAt *time.Time `json:"revoked_at"`
	UsedCount int        `gorm:"not null;default:0" json:"used_count"`
}

func (Invite) TableName() string { return "invites" }

type InviteStore interface {
	Create(ctx context.Context, i *Invite) error
	GetByToken(ctx context.Context, token string) (*Invite, error)
	MarkUsed(ctx context.Context, id string) error
	Revoke(ctx context.Context, tripID, id string) error
	ListByTrip(ctx context.Context, tripID string) ([]Invite, error)
}

// DreamItem is the private bucket list (M15). It hangs off the user, not a
// trip: it is what someone saves before any trip exists.
type DreamItem struct {
	Base
	UserID      string `gorm:"type:char(36);not null;index" json:"user_id"`
	Title       string `gorm:"type:varchar(200);not null" json:"title"`
	Destination string `gorm:"type:varchar(160)" json:"destination"`
	Note        string `gorm:"type:text" json:"note"`
	URL         string `gorm:"type:varchar(1000)" json:"url"`
	Accent      string `gorm:"type:varchar(20);not null;default:'primary'" json:"accent"`
	SortOrder   int    `gorm:"not null;default:0" json:"sort_order"`
}

func (DreamItem) TableName() string { return "dream_items" }

type DreamStore interface {
	Create(ctx context.Context, d *DreamItem) error
	ListByUser(ctx context.Context, userID string) ([]DreamItem, error)
	Update(ctx context.Context, d *DreamItem) error
	Delete(ctx context.Context, userID, dreamID string) error
}
