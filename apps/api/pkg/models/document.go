package models

import "context"

// Document categories (M19).
const (
	DocTicket    = "ticket"
	DocHotel     = "hotel"
	DocTransport = "transport"
	DocInsurance = "insurance"
	DocOther     = "other"
)

// TripDocument is one file the group needs on the road — tickets, vouchers,
// insurance papers (M19 — A19.1). Same key-not-URL rule as photos.
type TripDocument struct {
	Base
	TripID      string `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID      string `gorm:"type:char(36);not null" json:"user_id"`
	Name        string `gorm:"type:varchar(200);not null" json:"name"`
	Category    string `gorm:"type:varchar(20);not null;default:'other'" json:"category"`
	StorageKey  string `gorm:"type:varchar(255);not null" json:"storage_key"`
	ContentType string `gorm:"type:varchar(80);not null" json:"content_type"`
	SizeBytes   int64  `gorm:"not null;default:0" json:"size_bytes"`
}

func (TripDocument) TableName() string { return "trip_documents" }

type DocumentStore interface {
	Create(ctx context.Context, d *TripDocument) error
	Get(ctx context.Context, tripID, docID string) (*TripDocument, error)
	ListByTrip(ctx context.Context, tripID string) ([]TripDocument, error)
	Delete(ctx context.Context, tripID, docID string) error
}
