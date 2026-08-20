package models

import (
	"context"
	"time"
)

// TripInvite is a shareable join link. The token is the secret — it is long,
// random, and the only thing needed to join at the embedded role.
type TripInvite struct {
	Base
	TripID    string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	Token     string     `gorm:"type:varchar(64);uniqueIndex;not null" json:"token"`
	Role      string     `gorm:"type:varchar(20);not null;default:'editor'" json:"role"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedBy string     `gorm:"type:char(36);not null" json:"created_by"`
	UsedCount int        `gorm:"not null;default:0" json:"used_count"`
	MaxUses   int        `gorm:"not null;default:20" json:"max_uses"`
}

func (TripInvite) TableName() string { return "trip_invites" }

// Usable reports whether the link can still be redeemed.
func (i TripInvite) Usable(now time.Time) bool {
	if i.ExpiresAt != nil && now.After(*i.ExpiresAt) {
		return false
	}
	return i.MaxUses <= 0 || i.UsedCount < i.MaxUses
}

type InviteStore interface {
	Create(ctx context.Context, i *TripInvite) error
	// GetByToken is the one lookup NOT scoped by tripID: the token IS the
	// authorization, and the caller is by definition not yet a member.
	GetByToken(ctx context.Context, token string) (*TripInvite, error)
	ListByTrip(ctx context.Context, tripID string) ([]TripInvite, error)
	MarkUsed(ctx context.Context, id string) error
	Revoke(ctx context.Context, tripID, id string) error
}
