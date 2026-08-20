package models

import (
	"context"

	"gorm.io/datatypes"
)

// Prep block types.
const (
	PrepWeather = "weather"
	PrepPacking = "packing"
	PrepRule    = "rule"
	PrepDocs    = "docs"
	PrepCustom  = "custom"
)

// PrepBlock is one card in the Prep tab. Weather/packing/docs blocks are
// regenerated from rules; custom blocks are hand-written markdown and are never
// overwritten by a regenerate (A8.3).
type PrepBlock struct {
	Base
	TripID      string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	Type        string         `gorm:"type:varchar(20);not null" json:"type"`
	Trigger     string         `gorm:"type:varchar(120)" json:"trigger"`
	Title       string         `gorm:"type:varchar(200);not null" json:"title"`
	ContentMD   string         `gorm:"type:text" json:"content_md"`
	Checklist   datatypes.JSON `gorm:"type:json" json:"checklist"`
	SortOrder   int            `gorm:"not null;default:0" json:"sort_order"`
	GeneratedBy string         `gorm:"type:varchar(10);not null;default:'system'" json:"generated_by"`
}

func (PrepBlock) TableName() string { return "prep_blocks" }

// ChecklistEntry is the shape stored inside PrepBlock.Checklist.
type ChecklistEntry struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Done   bool   `json:"done"`
	DoneBy string `json:"done_by,omitempty"`
}

type PrepStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]PrepBlock, error)
	Create(ctx context.Context, b *PrepBlock) error
	Get(ctx context.Context, tripID, id string) (*PrepBlock, error)
	TripID(ctx context.Context, id string) (string, error)
	Update(ctx context.Context, b *PrepBlock) error
	Delete(ctx context.Context, tripID, id string) error
	// ReplaceGenerated swaps every system-generated block, leaving custom ones.
	ReplaceGenerated(ctx context.Context, tripID string, blocks []PrepBlock) error
}
