package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
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

// Member paces, shared with the AI generate dialog.
const (
	PaceRelaxed  = "relaxed"
	PaceBalanced = "balanced"
	PacePacked   = "packed"
)

// MemberProfile is what one member wants out of THIS trip (A3.1) — distinct
// from their account profile, because the same person is a temple-hopper on
// one trip and a beach potato on the next.
//
// Composite primary key (trip_id, user_id), same shape as TripMember: a member
// has at most one profile per trip, and the row dies with the membership.
type MemberProfile struct {
	TripID        string `gorm:"type:char(36);primaryKey" json:"trip_id"`
	UserID        string `gorm:"type:char(36);primaryKey;index" json:"user_id"`
	VisitedBefore bool   `gorm:"not null;default:false" json:"visited_before"`
	Pace          string `gorm:"type:varchar(10);not null;default:'balanced'" json:"pace"`
	// 1 = as little as possible, 2 = normal, 3 = happy to hike.
	WalkLevel int  `gorm:"not null;default:2" json:"walk_level"`
	CanDrive  bool `gorm:"not null;default:false" json:"can_drive"`
	HasIDP    bool `gorm:"not null;default:false" json:"has_idp"`
	// Personal comfort range in THB — the conflict detector compares these
	// across members before a plan is generated (A6.5).
	BudgetMinTHB int            `gorm:"not null;default:0" json:"budget_min_thb"`
	BudgetMaxTHB int            `gorm:"not null;default:0" json:"budget_max_thb"`
	Dietary      datatypes.JSON `gorm:"type:json" json:"dietary"`
	Notes        string         `gorm:"type:varchar(500)" json:"notes"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

func (MemberProfile) TableName() string { return "member_profiles" }

type TripMemberStore interface {
	Add(ctx context.Context, m *TripMember) error
	Get(ctx context.Context, tripID, userID string) (*TripMember, error)
	ListByTrip(ctx context.Context, tripID string) ([]TripMember, error)
	// ListByTrips hydrates a whole page of trips at once — the trip list shows
	// a member stack per row and must not query per row (§7.1).
	ListByTrips(ctx context.Context, tripIDs []string) ([]TripMember, error)
	UpdateRole(ctx context.Context, tripID, userID, role string) error
	Remove(ctx context.Context, tripID, userID string) error

	// Trip-scoped member profiles (A3.1).
	GetProfile(ctx context.Context, tripID, userID string) (*MemberProfile, error)
	UpsertProfile(ctx context.Context, p *MemberProfile) error
	ListProfiles(ctx context.Context, tripID string) ([]MemberProfile, error)
}
