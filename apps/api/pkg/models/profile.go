package models

import (
	"context"

	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
)

// Travel pace, feeding the day_too_long validation rule (A4.5).
const (
	PaceChill  = "chill"
	PaceNormal = "normal"
	PacePacked = "packed"
)

// MaxItemsPerDay is the pace budget the validator enforces. The values live in
// pkg/domain so the rule and its tests do not depend on this package.
var MaxItemsPerDay = map[string]int{
	PaceChill:  domain.MaxChillItems,
	PaceNormal: domain.MaxNormalItems,
	PacePacked: domain.MaxPackedItems,
}

// MemberProfile is one member's answers for one trip — the same person can be
// "chill" in a family trip and "packed" with friends, so it is per (trip,user).
type MemberProfile struct {
	TripID        string         `gorm:"type:char(36);primaryKey" json:"trip_id"`
	UserID        string         `gorm:"type:char(36);primaryKey" json:"user_id"`
	VisitedBefore bool           `gorm:"not null;default:false" json:"visited_before"`
	Pace          string         `gorm:"type:varchar(20);not null;default:'normal'" json:"pace"`
	WalkLevel     int            `gorm:"not null;default:3" json:"walk_level"`
	CanDrive      bool           `gorm:"not null;default:false" json:"can_drive"`
	HasIDP        bool           `gorm:"not null;default:false" json:"has_idp"`
	BudgetMin     *float64       `gorm:"type:decimal(12,2)" json:"budget_min"`
	BudgetMax     *float64       `gorm:"type:decimal(12,2)" json:"budget_max"`
	Dietary       datatypes.JSON `gorm:"type:json" json:"dietary"`
	TravelingWith datatypes.JSON `gorm:"type:json" json:"traveling_with"`
	Notes         string         `gorm:"type:text" json:"notes"`
}

func (MemberProfile) TableName() string { return "member_profiles" }

type ProfileStore interface {
	Get(ctx context.Context, tripID, userID string) (*MemberProfile, error)
	ListByTrip(ctx context.Context, tripID string) ([]MemberProfile, error)
	Upsert(ctx context.Context, p *MemberProfile) error
}
