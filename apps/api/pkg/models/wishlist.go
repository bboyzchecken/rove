package models

import (
	"context"

	"gorm.io/datatypes"
)

// Wishlist kinds (DEV_SPEC M3).
const (
	WishMust  = "must"
	WishNice  = "nice"
	WishAvoid = "avoid"
)

// Coverage states, mirrored by pkg/domain/coverage.go.
const (
	CoverageCovered   = "covered"
	CoveragePartial   = "partial"
	CoverageUncovered = "uncovered"
)

// WishlistItem is one thing a member wants out of the trip.
//
// Anyone may write their own; only the owner may touch someone else's — the
// list is personal, and editing it for someone is how a group argument starts.
type WishlistItem struct {
	Base
	TripID   string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID   string         `gorm:"type:char(36);not null;index" json:"user_id"`
	Kind     string         `gorm:"type:varchar(10);not null;default:'nice'" json:"kind"`
	Title    string         `gorm:"type:varchar(200);not null" json:"title"`
	Tags     datatypes.JSON `gorm:"type:json" json:"tags"`
	Note     string         `gorm:"type:text" json:"note"`
	POIID    *string        `gorm:"type:char(36);index" json:"poi_id"`
	Coverage string         `gorm:"type:varchar(12);not null;default:'uncovered'" json:"coverage"`
	// Which itinerary item satisfies it — the Coverage Board links to this.
	ItemID   *string `gorm:"type:char(36)" json:"item_id"`
	SortOrder int    `gorm:"not null;default:0" json:"sort_order"`
}

func (WishlistItem) TableName() string { return "wishlist_items" }

type WishlistStore interface {
	Create(ctx context.Context, w *WishlistItem) error
	// Get is trip-scoped on purpose: never fetch a row by id alone (§4.3).
	Get(ctx context.Context, tripID, wishID string) (*WishlistItem, error)
	ListByTrip(ctx context.Context, tripID string) ([]WishlistItem, error)
	Update(ctx context.Context, w *WishlistItem) error
	Delete(ctx context.Context, tripID, wishID string) error
	// SetCoverage writes the recomputed states in one round trip (A3.5).
	SetCoverage(ctx context.Context, tripID string, states map[string]CoverageWrite) error
}

// CoverageWrite is one recomputed row.
type CoverageWrite struct {
	Coverage string
	ItemID   *string
}
