package models

import (
	"context"

	"gorm.io/datatypes"
)

// Wishlist kinds.
const (
	WishMust  = "must"
	WishNice  = "nice"
	WishAvoid = "avoid"
)

// Coverage status mirrors domain.CoverageStatus; the column stores the string.
const (
	CoverageCovered   = "covered"
	CoveragePartial   = "partial"
	CoverageUncovered = "uncovered"
	CoverageNA        = "na"
)

// WishlistItem is one member's wish for one trip. Only its author may edit it —
// except the trip owner, who can tidy up (A3.2).
type WishlistItem struct {
	Base
	TripID           string         `gorm:"type:char(36);not null;index:idx_wish_trip_sort,priority:1" json:"trip_id"`
	MemberID         string         `gorm:"type:char(36);not null;index" json:"member_id"`
	Kind             string         `gorm:"type:varchar(10);not null;default:'nice'" json:"kind"`
	Text             string         `gorm:"type:varchar(500);not null" json:"text"`
	Tags             datatypes.JSON `gorm:"type:json" json:"tags"`
	POIID            *string        `gorm:"type:char(36);index" json:"poi_id"`
	Coverage         string         `gorm:"type:varchar(20);not null;default:'uncovered'" json:"coverage"`
	CoveredByItemIDs datatypes.JSON `gorm:"type:json" json:"covered_by_item_ids"`
	CoverageNote     string         `gorm:"type:varchar(500)" json:"coverage_note"`
	SortOrder        int            `gorm:"not null;default:0;index:idx_wish_trip_sort,priority:2" json:"sort_order"`
}

func (WishlistItem) TableName() string { return "wishlist_items" }

type WishlistStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]WishlistItem, error)
	Create(ctx context.Context, w *WishlistItem) error
	Get(ctx context.Context, tripID, id string) (*WishlistItem, error)
	Update(ctx context.Context, w *WishlistItem) error
	Delete(ctx context.Context, tripID, id string) error
	// SaveCoverage writes back the result of domain.ComputeCoverage.
	SaveCoverage(ctx context.Context, tripID string, updates []WishlistItem) error
	NextSortOrder(ctx context.Context, tripID, memberID string) (int, error)
	CountByTrip(ctx context.Context, tripID string) (int64, error)
	MembersWithItems(ctx context.Context, tripID string) ([]string, error)
}
