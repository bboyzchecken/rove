package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Trip visibility.
const (
	VisibilityPrivate = "private"
	VisibilityLink    = "link"
	VisibilityPublic  = "public"
)

// Trip status.
const (
	TripStatusDraft    = "draft"
	TripStatusPlanning = "planning"
	TripStatusFinal    = "final"
	TripStatusDone     = "done"
)

type Trip struct {
	Base
	OwnerID            string         `gorm:"type:char(36);not null;index" json:"owner_id"`
	Title              string         `gorm:"type:varchar(200);not null" json:"title"`
	Slug               *string        `gorm:"type:varchar(200);uniqueIndex" json:"slug"`
	DestinationCountry string         `gorm:"type:varchar(2);not null;default:'JP'" json:"destination_country"`
	DestinationCities  datatypes.JSON `gorm:"type:json" json:"destination_cities"`
	StartDate          *time.Time     `gorm:"type:date" json:"start_date"`
	EndDate            *time.Time     `gorm:"type:date" json:"end_date"`
	PartySize          int            `gorm:"not null;default:1" json:"party_size"`
	HomeCurrency       string         `gorm:"type:varchar(3);not null;default:'THB'" json:"home_currency"`
	DestCurrency       string         `gorm:"type:varchar(3);not null;default:'JPY'" json:"dest_currency"`
	FxRate             *float64       `gorm:"type:decimal(12,6)" json:"fx_rate"`
	FxRateAt           *time.Time     `json:"fx_rate_at"`
	Visibility         string         `gorm:"type:varchar(20);not null;default:'private'" json:"visibility"`
	ShareToken         *string        `gorm:"type:varchar(64);uniqueIndex" json:"share_token"`
	Status             string         `gorm:"type:varchar(20);not null;default:'draft'" json:"status"`
	SourceTripID       *string        `gorm:"type:char(36);index" json:"source_trip_id"`
	SourceCreatorID    *string        `gorm:"type:char(36)" json:"source_creator_id"`
	FinalPlanID        *string        `gorm:"type:char(36)" json:"final_plan_id"`
	CoverImageURL      string         `gorm:"type:varchar(500)" json:"cover_image_url"`
	Summary            string         `gorm:"type:text" json:"summary"`
	CloneCount         int            `gorm:"not null;default:0" json:"clone_count"`
	ViewCount          int            `gorm:"not null;default:0" json:"view_count"`
	// Expense is never exposed on a public trip. The column exists so the
	// intent is auditable, but the public payload builder ignores its value
	// and always hides expense (DEV_SPEC §4.3).
	PublicHideExpense bool `gorm:"not null;default:true" json:"public_hide_expense"`
}

// Nights is the number of hotel nights the trip spans, used by per_night costs.
func (t Trip) Nights() int {
	if t.StartDate == nil || t.EndDate == nil {
		return 0
	}
	n := int(t.EndDate.Sub(*t.StartDate).Hours() / 24)
	if n < 0 {
		return 0
	}
	return n
}

// Days is the inclusive day count (a 3-night trip is 4 days).
func (t Trip) Days() int {
	if t.StartDate == nil || t.EndDate == nil {
		return 0
	}
	return t.Nights() + 1
}

func (Trip) TableName() string { return "trips" }

type TripStore interface {
	Create(ctx context.Context, t *Trip) error
	// GetByID is scoped to a user via trip_members — see DEV_SPEC §4.3.
	GetByID(ctx context.Context, tripID string) (*Trip, error)
	ListForUser(ctx context.Context, userID string, limit, offset int) ([]Trip, int64, error)
	Update(ctx context.Context, t *Trip) error
	Delete(ctx context.Context, tripID string) error

	GetByShareToken(ctx context.Context, token string) (*Trip, error)
	GetBySlug(ctx context.Context, slug string) (*Trip, error)
	IncrementView(ctx context.Context, tripID string) error
	IncrementClone(ctx context.Context, tripID string) error
	// ListForStats returns every trip the user belongs to, unpaginated, for the
	// aggregate on /users/me/stats (A17.1).
	ListForStats(ctx context.Context, userID string) ([]Trip, error)
	Upcoming(ctx context.Context, userID string, from time.Time, limit int) ([]Trip, error)
	CountSince(ctx context.Context, since time.Time) (int64, error)
}
