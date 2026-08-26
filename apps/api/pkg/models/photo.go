package models

import (
	"context"
	"time"
)

// TripPhoto is one picture taken on the trip (M18 — A18.1).
//
// The row stores the storage KEY, never a URL: URLs are minted per read by the
// storage service, which is what lets the backend move from local disk to R2
// without touching a single row.
type TripPhoto struct {
	Base
	TripID string  `gorm:"type:char(36);not null;index" json:"trip_id"`
	DayID  *string `gorm:"type:char(36);index" json:"day_id"`
	ItemID *string `gorm:"type:char(36);index" json:"item_id"`
	POIID  *string `gorm:"type:char(36);index" json:"poi_id"`
	// Who pressed the shutter — deletion is theirs (or the trip owner's).
	UserID      string     `gorm:"type:char(36);not null;index" json:"user_id"`
	StorageKey  string     `gorm:"type:varchar(255);not null" json:"storage_key"`
	ContentType string     `gorm:"type:varchar(60);not null;default:'image/webp'" json:"content_type"`
	SizeBytes   int64      `gorm:"not null;default:0" json:"size_bytes"`
	Caption     string     `gorm:"type:varchar(255)" json:"caption"`
	TakenAt     *time.Time `json:"taken_at"`
	SortOrder   int        `gorm:"not null;default:0" json:"sort_order"`
}

func (TripPhoto) TableName() string { return "trip_photos" }

// PhotoFilter narrows a trip's photo list — the tab filters by day, member,
// or the item card asks for its own strip (A18.3).
type PhotoFilter struct {
	DayID  string
	ItemID string
	UserID string
}

type PhotoStore interface {
	Create(ctx context.Context, p *TripPhoto) error
	Get(ctx context.Context, tripID, photoID string) (*TripPhoto, error)
	ListByTrip(ctx context.Context, tripID string, f PhotoFilter) ([]TripPhoto, error)
	Delete(ctx context.Context, tripID, photoID string) error
	CountByTrip(ctx context.Context, tripID string) (int64, error)
}
