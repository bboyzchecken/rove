package models

import (
	"context"
	"time"
)

// Trip roles, ordered viewer < editor < owner (DEV_SPEC §4.3).
const (
	TripRoleViewer = "viewer"
	TripRoleEditor = "editor"
	TripRoleOwner  = "owner"
)

// TripRoleRank lets middleware compare roles numerically.
var TripRoleRank = map[string]int{
	TripRoleViewer: 1,
	TripRoleEditor: 2,
	TripRoleOwner:  3,
}

// TripMember uses a composite primary key (trip_id, user_id) — see DEV_SPEC §4.2.
type TripMember struct {
	TripID   string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	UserID   string    `gorm:"type:char(36);primaryKey;index" json:"user_id"`
	Role     string    `gorm:"type:varchar(20);not null;default:'viewer'" json:"role"`
	JoinedAt time.Time `gorm:"not null" json:"joined_at"`
}

func (TripMember) TableName() string { return "trip_members" }

type TripMemberStore interface {
	Add(ctx context.Context, m *TripMember) error
	Get(ctx context.Context, tripID, userID string) (*TripMember, error)
	ListByTrip(ctx context.Context, tripID string) ([]TripMember, error)
	UpdateRole(ctx context.Context, tripID, userID, role string) error
	Remove(ctx context.Context, tripID, userID string) error
}
