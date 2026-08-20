package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Plan status.
const (
	PlanStatusGenerating = "generating"
	PlanStatusReady      = "ready"
	PlanStatusError      = "error"
)

// Plan authorship.
const (
	CreatedByAI   = "ai"
	CreatedByUser = "user"
)

// Item types.
const (
	ItemTypePlace     = "place"
	ItemTypeFood      = "food"
	ItemTypeStay      = "stay"
	ItemTypeTransport = "transport"
	ItemTypeFlight    = "flight"
	ItemTypeFree      = "free"
	ItemTypeNote      = "note"
)

// Cost basis / status.
const (
	CostBasisPerPerson = "per_person"
	CostBasisPerGroup  = "per_group"
	CostBasisPerNight  = "per_night"
	CostBasisPerUnit   = "per_unit"

	CostStatusEstimate = "estimate"
	CostStatusQuoted   = "quoted"
	CostStatusActual   = "actual"
	CostStatusPaid     = "paid"
)

// Booking status on an item.
const (
	BookingStatusNone    = "none"
	BookingStatusClicked = "clicked"
	BookingStatusBooked  = "booked"
	BookingStatusSkipped = "skipped"
)

// Verification: whether the POI behind an item exists in our catalogue.
const (
	VerifiedYes = "verified"
	VerifiedNo  = "unverified"
)

// Rationale kinds.
const (
	RationaleCut     = "cut"
	RationaleMoved   = "moved"
	RationaleChosen  = "chosen"
	RationaleAdded   = "added"
	RationaleWarning = "warning"
)

type Plan struct {
	Base
	TripID          string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	Name            string         `gorm:"type:varchar(200);not null" json:"name"`
	ParentPlanID    *string        `gorm:"type:char(36)" json:"parent_plan_id"`
	Version         int            `gorm:"not null;default:1" json:"version"`
	IsFinal         bool           `gorm:"not null;default:false" json:"is_final"`
	CreatedBy       string         `gorm:"type:varchar(10);not null;default:'user'" json:"created_by"`
	CreatedByUserID *string        `gorm:"type:char(36)" json:"created_by_user_id"`
	Summary         string         `gorm:"type:text" json:"summary"`
	Pros            datatypes.JSON `gorm:"type:json" json:"pros"`
	Cons            datatypes.JSON `gorm:"type:json" json:"cons"`
	KeyDecision     string         `gorm:"type:varchar(255)" json:"key_decision"`
	Status          string         `gorm:"type:varchar(20);not null;default:'ready'" json:"status"`
	GenerationJobID *string        `gorm:"type:char(36)" json:"generation_job_id"`
}

func (Plan) TableName() string { return "plans" }

type Day struct {
	Base
	PlanID    string    `gorm:"type:char(36);not null;index" json:"plan_id"`
	Date      time.Time `gorm:"type:date;not null" json:"date"`
	DayIndex  int       `gorm:"not null" json:"day_index"`
	Title     string    `gorm:"type:varchar(200)" json:"title"`
	Theme     string    `gorm:"type:varchar(120)" json:"theme"`
	SortOrder int       `gorm:"not null;default:0" json:"sort_order"`
}

func (Day) TableName() string { return "days" }

type Item struct {
	Base
	DayID     string `gorm:"type:char(36);not null;index:idx_item_plan_day,priority:2" json:"day_id"`
	PlanID    string `gorm:"type:char(36);not null;index:idx_item_plan_day,priority:1" json:"plan_id"`
	SortOrder int    `gorm:"not null;default:0;index:idx_item_plan_day,priority:3" json:"sort_order"`
	Type      string `gorm:"type:varchar(20);not null;default:'place'" json:"type"`

	POIID *string `gorm:"type:char(36);index" json:"poi_id"`
	Title string  `gorm:"type:varchar(200);not null" json:"title"`
	Notes string  `gorm:"type:text" json:"notes"`

	StartTime   string `gorm:"type:varchar(5)" json:"start_time"` // "09:30", Asia/Tokyo
	EndTime     string `gorm:"type:varchar(5)" json:"end_time"`
	DurationMin int    `gorm:"not null;default:0" json:"duration_min"`

	TravelMode string `gorm:"type:varchar(20)" json:"travel_mode"`
	TravelMin  int    `gorm:"not null;default:0" json:"travel_min"`
	TravelNote string `gorm:"type:varchar(255)" json:"travel_note"`

	CostAmount   *float64 `gorm:"type:decimal(12,2)" json:"cost_amount"`
	CostCurrency string   `gorm:"type:varchar(3);not null;default:'JPY'" json:"cost_currency"`
	CostBasis    string   `gorm:"type:varchar(20);not null;default:'per_person'" json:"cost_basis"`
	CostStatus   string   `gorm:"type:varchar(20);not null;default:'estimate'" json:"cost_status"`
	CostNote     string   `gorm:"type:varchar(255)" json:"cost_note"`
	IsPrepaid    bool     `gorm:"not null;default:false" json:"is_prepaid"`

	BookingPartner string `gorm:"type:varchar(40)" json:"booking_partner"`
	BookingURL     string `gorm:"type:varchar(1000)" json:"booking_url"`
	BookingStatus  string `gorm:"type:varchar(20);not null;default:'none'" json:"booking_status"`

	Verified string   `gorm:"type:varchar(20);not null;default:'unverified'" json:"verified"`
	Lat      *float64 `gorm:"type:decimal(10,7)" json:"lat"`
	Lng      *float64 `gorm:"type:decimal(10,7)" json:"lng"`
}

func (Item) TableName() string { return "items" }

// ItemVersion is the undo tape: every mutation snapshots the previous row.
type ItemVersion struct {
	Base
	ItemID       string         `gorm:"type:char(36);not null;index" json:"item_id"`
	PlanID       string         `gorm:"type:char(36);not null;index" json:"plan_id"`
	Snapshot     datatypes.JSON `gorm:"type:json" json:"snapshot"`
	ChangedBy    string         `gorm:"type:char(36)" json:"changed_by"`
	ChangeSource string         `gorm:"type:varchar(10);not null;default:'user'" json:"change_source"`
}

func (ItemVersion) TableName() string { return "item_versions" }

// Rationale is the "why" the AI attaches to a decision — the feature that makes
// the plan arguable instead of magic (DEV_SPEC §1).
type Rationale struct {
	Base
	PlanID         string  `gorm:"type:char(36);not null;index" json:"plan_id"`
	ItemID         *string `gorm:"type:char(36)" json:"item_id"`
	WishlistItemID *string `gorm:"type:char(36)" json:"wishlist_item_id"`
	Kind           string  `gorm:"type:varchar(20);not null" json:"kind"`
	Text           string  `gorm:"type:text;not null" json:"text"`
	CreatedByKind  string  `gorm:"type:varchar(10);not null;default:'ai'" json:"created_by"`
}

func (Rationale) TableName() string { return "rationales" }

type PlanStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]Plan, error)
	Create(ctx context.Context, p *Plan) error
	Get(ctx context.Context, tripID, planID string) (*Plan, error)
	// GetTripID resolves the owning trip for a /plans/:planId route so the
	// handler can run the same role check as a trip-scoped route.
	GetTripID(ctx context.Context, planID string) (string, error)
	Update(ctx context.Context, p *Plan) error
	Delete(ctx context.Context, tripID, planID string) error
	Freeze(ctx context.Context, tripID, planID string) error

	Days(ctx context.Context, planID string) ([]Day, error)
	CreateDay(ctx context.Context, d *Day) error
	Items(ctx context.Context, planID string) ([]Item, error)
	Rationales(ctx context.Context, planID string) ([]Rationale, error)
	CountByTrip(ctx context.Context, tripID string) (int64, error)
}

type ItemStore interface {
	Create(ctx context.Context, planID string, it *Item) error
	Get(ctx context.Context, planID, itemID string) (*Item, error)
	// PlanID resolves the owning plan for an /items/:itemId route. It falls
	// back to item_versions when the row is gone, so undo-of-delete can still
	// be authorized against the plan the item belonged to.
	PlanID(ctx context.Context, itemID string) (string, error)
	Update(ctx context.Context, planID string, it *Item, actorID, source string) error
	Move(ctx context.Context, planID, itemID, dayID string, position int, actorID string) error
	Delete(ctx context.Context, planID, itemID, actorID string) error
	// Undo restores the most recent snapshot, re-creating a deleted item.
	Undo(ctx context.Context, planID, itemID, actorID string) (*Item, error)
	NextSortOrder(ctx context.Context, dayID string) (int, error)
	SnapshotPlan(ctx context.Context, planID, actorID string) error
}
