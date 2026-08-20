package models

import (
	"context"
	"time"
)

// Prep categories (DEV_SPEC M8).
const (
	PrepDocument = "document"
	PrepPacking  = "packing"
	PrepBooking  = "booking"
	PrepMoney    = "money"
	PrepHealth   = "health"
	PrepOther    = "other"
)

// PrepTask is one line of the shared "before we fly" checklist. Four people
// tick this list at once, so it is deliberately flat: no sub-tasks, no owner
// hierarchy, just an optional assignee.
type PrepTask struct {
	Base
	TripID       string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	Title        string     `gorm:"type:varchar(200);not null" json:"title"`
	Category     string     `gorm:"type:varchar(20);not null;default:'other'" json:"category"`
	AssigneeID   *string    `gorm:"type:char(36)" json:"assignee_id"`
	DueDate      *time.Time `gorm:"type:date" json:"due_date"`
	Done         bool       `gorm:"not null;default:false" json:"done"`
	DoneBy       *string    `gorm:"type:char(36)" json:"done_by"`
	Note         string     `gorm:"type:text" json:"note"`
	FromTemplate bool       `gorm:"not null;default:false" json:"from_template"`
	SortOrder    int        `gorm:"not null;default:0" json:"sort_order"`
}

func (PrepTask) TableName() string { return "prep_tasks" }

// PrepNote is the free-form markdown block a trip keeps alongside the
// checklist (W8.2) — packing notes, addresses, whatever the group pastes in.
type PrepNote struct {
	Base
	TripID string `gorm:"type:char(36);not null;uniqueIndex" json:"trip_id"`
	Body   string `gorm:"type:text" json:"body"`
	Author string `gorm:"type:char(36)" json:"author"`
}

func (PrepNote) TableName() string { return "prep_notes" }

type PrepStore interface {
	Create(ctx context.Context, t *PrepTask) error
	Get(ctx context.Context, tripID, taskID string) (*PrepTask, error)
	ListByTrip(ctx context.Context, tripID string) ([]PrepTask, error)
	Update(ctx context.Context, t *PrepTask) error
	Delete(ctx context.Context, tripID, taskID string) error
	// CreateMany seeds the country template, skipping titles already present.
	CreateMany(ctx context.Context, tasks []PrepTask) error

	GetNote(ctx context.Context, tripID string) (*PrepNote, error)
	SaveNote(ctx context.Context, n *PrepNote) error
}
