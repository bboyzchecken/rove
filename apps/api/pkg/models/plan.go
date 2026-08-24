package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Itinerary item types.
const (
	ItemPOI       = "poi"
	ItemMeal      = "meal"
	ItemTransport = "transport"
	ItemStay      = "stay"
	ItemFree      = "free"
	ItemFlight    = "flight"
)

// Plan is one version of an itinerary. Phase 1 keeps exactly one plan per trip;
// the table carries `is_final` and `label` so Phase 2 variants (M6) can land
// without a migration that rewrites data.
type Plan struct {
	Base
	TripID     string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	Label      string         `gorm:"type:varchar(120);not null;default:'แพลนหลัก'" json:"label"`
	IsFinal    bool           `gorm:"not null;default:true" json:"is_final"`
	Rationales datatypes.JSON `gorm:"type:json" json:"rationales"`
	OpenQs     datatypes.JSON `gorm:"type:json;column:open_questions" json:"open_questions"`
	CreatedBy  string         `gorm:"type:char(36)" json:"created_by"`
}

func (Plan) TableName() string { return "plans" }

type PlanDay struct {
	Base
	PlanID       string    `gorm:"type:char(36);not null;index" json:"plan_id"`
	TripID       string    `gorm:"type:char(36);not null;index" json:"trip_id"`
	DayIndex     int       `gorm:"not null" json:"day_index"`
	Date         time.Time `gorm:"type:date;not null" json:"date"`
	Label        string    `gorm:"type:varchar(80)" json:"label"`
	City         string    `gorm:"type:varchar(80)" json:"city"`
	WeatherIcon  string    `gorm:"type:varchar(16)" json:"weather_icon"`
	WeatherHigh  *float64  `gorm:"type:decimal(5,2)" json:"weather_high"`
	WeatherLow   *float64  `gorm:"type:decimal(5,2)" json:"weather_low"`
	WeatherText  string    `gorm:"type:varchar(120)" json:"weather_text"`
	WeatherAt    *time.Time `json:"weather_at"`
}

func (PlanDay) TableName() string { return "plan_days" }

// PlanItem is one stop. Times are "HH:mm" strings in the destination's local
// time: the editor thinks in Asia/Tokyo, and storing a UTC instant would make
// "09:00 at the shrine" depend on which server rendered it.
type PlanItem struct {
	Base
	DayID     string         `gorm:"type:char(36);not null;index" json:"day_id"`
	TripID    string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	SortOrder int            `gorm:"not null;default:0" json:"sort_order"`
	Type      string         `gorm:"type:varchar(20);not null;default:'poi'" json:"type"`
	StartTime string         `gorm:"type:varchar(5);not null;default:'09:00'" json:"start_time"`
	EndTime   string         `gorm:"type:varchar(5)" json:"end_time"`
	Title     string         `gorm:"type:varchar(200);not null" json:"title"`
	Area      string         `gorm:"type:varchar(120)" json:"area"`
	POIID     *string        `gorm:"type:char(36);index" json:"poi_id"`
	CostJPY   *float64       `gorm:"type:decimal(12,2)" json:"cost_jpy"`
	TravelMin *int           `json:"travel_minutes"`
	TravelMode string        `gorm:"type:varchar(10)" json:"travel_mode"`
	TravelLine string        `gorm:"type:varchar(80)" json:"travel_line"`
	OpenHours string         `gorm:"type:varchar(80)" json:"open_hours"`
	ForUsers  datatypes.JSON `gorm:"type:json" json:"for_user_ids"`
	Bookable  bool           `gorm:"not null;default:false" json:"bookable"`
	Booked    bool           `gorm:"not null;default:false" json:"booked"`
	Warning   string         `gorm:"type:varchar(255)" json:"warning"`
	Note      string         `gorm:"type:text" json:"note"`
}

func (PlanItem) TableName() string { return "plan_items" }

// ItemVersion is the undo trail (A5.1 / W5.7). One row per mutation, holding
// the item as it looked *before* the change.
type ItemVersion struct {
	Base
	TripID   string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	ItemID   string         `gorm:"type:char(36);not null;index" json:"item_id"`
	Action   string         `gorm:"type:varchar(20);not null" json:"action"` // update | move | delete
	Snapshot datatypes.JSON `gorm:"type:json;not null" json:"snapshot"`
	ActorID  string         `gorm:"type:char(36)" json:"actor_id"`
}

func (ItemVersion) TableName() string { return "item_versions" }

// Variant sources (M6).
const (
	VariantSourceAI   = "ai"
	VariantSourceFork = "fork"
)

// PlanVariant is one candidate itinerary, stored whole as a snapshot (M6).
//
// A variant is read-only by design: it exists to be compared, voted on and
// adopted — not edited in parallel with the live plan. Adopting one replaces
// the live days via the same path an AI draft takes, after which it is editable
// like anything else. Keeping candidates out of plan_days means every existing
// trip-scoped query stays exactly as it is (Decision Log 24 ส.ค.).
type PlanVariant struct {
	Base
	TripID      string `gorm:"type:char(36);not null;index" json:"trip_id"`
	Label       string `gorm:"type:varchar(120);not null" json:"label"`
	KeyDecision string `gorm:"type:varchar(255)" json:"key_decision"`
	Summary     string `gorm:"type:text" json:"summary"`
	Source      string `gorm:"type:varchar(10);not null;default:'ai'" json:"source"`
	CreatedBy   string `gorm:"type:char(36)" json:"created_by"`
	// Which day the fork's key decision splits from (0 = whole plan differs).
	FromDayIndex int `gorm:"not null;default:0" json:"from_day_index"`
	// []ai.DraftDay — the same shape an AI draft carries, so adopting a variant
	// and applying a draft are one code path.
	Days datatypes.JSON `gorm:"type:json" json:"days"`
	Pros datatypes.JSON `gorm:"type:json" json:"pros"`
	Cons datatypes.JSON `gorm:"type:json" json:"cons"`
}

func (PlanVariant) TableName() string { return "plan_variants" }

// PlanStore covers the whole itinerary aggregate. Everything is trip-scoped.
type PlanStore interface {
	EnsurePlan(ctx context.Context, tripID, userID string) (*Plan, error)
	GetPlan(ctx context.Context, tripID string) (*Plan, error)
	UpdatePlan(ctx context.Context, p *Plan) error
	// ReplaceDays swaps the entire itinerary in one transaction (A4.8).
	ReplaceDays(ctx context.Context, tripID string, days []PlanDay, items map[string][]PlanItem) error

	ListDays(ctx context.Context, tripID string) ([]PlanDay, error)
	ListItems(ctx context.Context, tripID string) ([]PlanItem, error)
	GetDay(ctx context.Context, tripID, dayID string) (*PlanDay, error)
	UpdateDay(ctx context.Context, d *PlanDay) error

	CreateItem(ctx context.Context, item *PlanItem, index int) error
	GetItem(ctx context.Context, tripID, itemID string) (*PlanItem, error)
	UpdateItem(ctx context.Context, item *PlanItem) error
	MoveItem(ctx context.Context, tripID, itemID, toDayID string, toIndex int) error
	DeleteItem(ctx context.Context, tripID, itemID string) error
	SetWarnings(ctx context.Context, tripID string, warnings map[string]string) error

	AddVersion(ctx context.Context, v *ItemVersion) error
	LatestVersion(ctx context.Context, tripID, itemID string) (*ItemVersion, error)
	ListVersions(ctx context.Context, tripID string, limit int) ([]ItemVersion, error)
	DeleteVersion(ctx context.Context, tripID, versionID string) error

	// Plan variants (M6).
	CreateVariant(ctx context.Context, v *PlanVariant) error
	GetVariant(ctx context.Context, tripID, variantID string) (*PlanVariant, error)
	ListVariants(ctx context.Context, tripID string) ([]PlanVariant, error)
	DeleteVariant(ctx context.Context, tripID, variantID string) error
}
