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

	// The group's own target, in their home currency. The Budget tab compares
	// its estimate against this line and nothing else.
	BudgetPerPersonTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"budget_per_person_thb"`

	// Date coordination (M2.5). A trip may exist with no dates at all: that is
	// the whole point of the date board. `DatesLockedAt` is what separates
	// "we agreed on these days" from "someone typed a guess into the frame".
	DatesLockedAt *time.Time `json:"dates_locked_at"`
	DatesLockedBy *string    `gorm:"type:char(36)" json:"dates_locked_by"`
	// Which suggestion the group picked, if they came through the date board.
	DestinationID string `gorm:"type:varchar(40)" json:"destination_id"`

	// When the owner first made it public (Feedback #2 — D-18): "มาใหม่" on
	// explore is ordered by this, not by updated_at, so a plan edited last
	// night does not jump to the top of "new".
	PublishedAt *time.Time `json:"published_at"`

	// The trip's own colour (Feedback #2 — D-3, brand spec §2.7): one of
	// domain.TripColors by name, picked at random on create and changed only by
	// the owner. Empty on rows older than the column; readers fall back to
	// domain.ColorFromID so a trip is never colourless on the wire.
	Color string `gorm:"type:varchar(16);not null;default:''" json:"color"`

	// What the group already had when they opened the room (Feedback #2 —
	// D-9): a JSON array of "dates" | "flights" | "stay" | "destination" |
	// "friends". The trip page orders its steps from this, so a group that
	// arrives with tickets sees the flight step first and the date step
	// already ticked.
	StartedWith datatypes.JSON `gorm:"type:json" json:"started_with"`
}

// Step statuses a member can set by hand (Feedback #2 — D-11/D-12; Feedback #4
// — D-26). The other two — "todo" and "done" — are derived from the room's own
// tables and never stored; "check" likewise, UNLESS a group manually confirms
// a step that has no way to reach 100% on its own (dates typed in but never
// locked through the calendar, a plan with a wish nobody ever covers) — that
// declaration is `StepConfirmed`, read back as `done`.
const (
	StepSkipped   = "skipped"
	StepConfirmed = "confirmed"
)

// TripStepOverride records that the group decided a step of the checklist does
// not apply to this trip ("ไม่จำเป็น"). Composite key: one opinion per step.
type TripStepOverride struct {
	TripID    string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	Step      string    `gorm:"type:varchar(20);primaryKey" json:"step"`
	Status    string    `gorm:"type:varchar(12);not null;default:'skipped'" json:"status"`
	ByUserID  string    `gorm:"type:char(36);not null" json:"by_user_id"`
	CreatedAt time.Time `json:"created_at"`
}

func (TripStepOverride) TableName() string { return "trip_step_overrides" }

type TripStepStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]TripStepOverride, error)
	// Set writes or replaces the override for one step.
	Set(ctx context.Context, o *TripStepOverride) error
	// Clear removes it, which puts the step back on its derived status.
	Clear(ctx context.Context, tripID, step string) error
}

// Nights is derived, never stored: two columns that must agree are one column
// too many.
func (t Trip) Nights() int {
	if t.StartDate == nil || t.EndDate == nil {
		return 0
	}
	d := int(t.EndDate.Sub(*t.StartDate).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}

func (Trip) TableName() string { return "trips" }

// ExploreFilter is what the public explore feed accepts (M11 — A11.2).
type ExploreFilter struct {
	// Free text against title and cities.
	Query   string
	Country string
	// Several at once (Feedback #2 — D-18): the filter sheet lets a person
	// tick Japan and Korea together. Empty means every country.
	Countries []string
	// "popular" (views + clones), "new" (latest published first) or
	// "trending" (views in the last seven days against the seven before).
	Sort   string
	Limit  int
	Offset int
}

// Sort names the feed accepts. Anything else is popular.
const (
	ExploreSortPopular  = "popular"
	ExploreSortNew      = "new"
	ExploreSortTrending = "trending"
)

// TripViewDaily is one day's views of one trip (Feedback #2 — D-18). The
// lifetime counter on the trip stays; this is the series "ติดเทรนด์" reads,
// and it is bumped in the same place. Rows older than a month are useless and
// may be pruned.
type TripViewDaily struct {
	TripID string    `gorm:"type:char(36);primaryKey" json:"trip_id"`
	Day    time.Time `gorm:"type:date;primaryKey" json:"day"`
	Views  int       `gorm:"not null;default:0" json:"views"`
}

func (TripViewDaily) TableName() string { return "trip_view_daily" }

// CountryCount is one row of the explore filter sheet: a country and how many
// public plans go there.
type CountryCount struct {
	Code  string `json:"code"`
	Count int64  `json:"count"`
}

type TripStore interface {
	Create(ctx context.Context, t *Trip) error
	// GetByID is scoped to a user via trip_members — see DEV_SPEC §4.3.
	GetByID(ctx context.Context, tripID string) (*Trip, error)
	ListForUser(ctx context.Context, userID string, limit, offset int) ([]Trip, int64, error)
	Update(ctx context.Context, t *Trip) error
	Delete(ctx context.Context, tripID string) error
	GetBySlug(ctx context.Context, slug string) (*Trip, error)
	GetByShareToken(ctx context.Context, token string) (*Trip, error)
	// Counters are bumped without reading the row first — two people opening a
	// shared link at once must not lose a view.
	BumpViewCount(ctx context.Context, tripID string) error
	BumpCloneCount(ctx context.Context, tripID string) error
	// BumpDailyView adds one to today's row for the trending feed (D-18).
	BumpDailyView(ctx context.Context, tripID string, day time.Time) error
	// HasViewsSince says whether the daily series has anything in it yet — the
	// trending chip falls back to popular until it does (fix-list §9).
	HasViewsSince(ctx context.Context, since time.Time) (bool, error)
	// PublicCountryCounts feeds the country filter: every country with at least
	// one public plan, most first.
	PublicCountryCounts(ctx context.Context) ([]CountryCount, error)
	Count(ctx context.Context) (int64, error)
	// ActiveOwnedIDs lists the trips this user owns that are not finished. It
	// answers the free tier's "one trip at a time" rule (M26 — A26.3), and
	// returns ids rather than a count because the caller has to subtract the
	// ones that already have a pass.
	ActiveOwnedIDs(ctx context.Context, userID string) ([]string, error)
	// TitlesByIDs resolves a set of trip ids to their titles in one query, so a
	// points ledger can name its rows instead of printing UUIDs (A23.1).
	TitlesByIDs(ctx context.Context, ids []string) (map[string]string, error)
	// LatestOwnedColor is the colour of the trip this user created most
	// recently, so the next one can avoid it (Feedback #2 — D-3). Empty when
	// they have none.
	LatestOwnedColor(ctx context.Context, userID string) (string, error)

	// --- platform totals (A24.1) --------------------------------------------
	// Four counts behind one cached endpoint. They are separate methods rather
	// than one struct because each is a different table's question, and the
	// caller caches the answer anyway.

	// CountPlanners counts people who have actually started a trip — the honest
	// reading of "คนที่วางแพลนกับ ROVE". Signing up is not planning.
	CountPlanners(ctx context.Context) (int64, error)
	// CountPublic counts published plans.
	CountPublic(ctx context.Context) (int64, error)
	// CountClones counts trips that were copied from somebody else's, which is
	// a row that exists rather than a counter that was bumped.
	CountClones(ctx context.Context) (int64, error)

	// ListPublic feeds /public/explore (A11.2): public trips only, no auth.
	ListPublic(ctx context.Context, f ExploreFilter) ([]Trip, int64, error)
	// ListPublicByOwner feeds the creator page (A11.2 / W11.2).
	ListPublicByOwner(ctx context.Context, ownerID string) ([]Trip, error)
}
