package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// The evidence chain behind every point and every baht (Feedback #4 — F12,
// D-17 … D-20).
//
// A `value_sources` row is one real-world event that may have produced value:
// a trip published, a plan copied, a partner confirming a booking. Every ledger
// row (points, creator earnings) and every credit code points back at one. The
// rows are append-only — a mistake is corrected by a new row that reverses it —
// and each carries a snapshot of who, what and how much *at that moment*, so a
// trip that is archived or renamed later still reads the way it did.

const (
	SourcePublish          = "publish"
	SourceClone            = "clone"
	SourceBookingClick     = "booking_click"
	SourcePartnerConfirmed = "partner_confirmed"
	SourcePartnerCancelled = "partner_cancelled"
	SourcePartnerPaid      = "partner_paid"
	SourceReferralJoin     = "referral_join"
	SourceTripPassPurchase = "trip_pass_purchase"
	SourceTripPassRefund   = "trip_pass_refund"
	SourceBookerCredit     = "booker_credit"
	SourceRedeem           = "redeem"
	SourceAdminAdjustment  = "admin_adjustment"
	SourceEarningExpired   = "earning_expired"
	SourceLegacy           = "legacy"
)

// Subject types — what a source is about.
const (
	SubjectTrip         = "trip"
	SubjectBookingClick = "booking_click"
	SubjectUser         = "user"
	SubjectDiscountCode = "discount_code"
	SubjectPoints       = "points"
	SubjectEarning      = "earning"
	SubjectOrder        = "order"
)

type ValueSource struct {
	Base
	Kind     string  `gorm:"type:varchar(30);not null;index" json:"kind"`
	ParentID *string `gorm:"type:char(36);index" json:"parent_id"`
	// Who caused it — the person who copied, clicked, joined, or the admin.
	// Nil for a partner postback, which nobody inside the product caused.
	ActorUserID *string `gorm:"type:char(36);index" json:"actor_user_id"`
	SubjectType string  `gorm:"type:varchar(20);not null" json:"subject_type"`
	SubjectID   string  `gorm:"type:char(36);not null;index" json:"subject_id"`
	// The trips this event touches, both ends of it: a clone has a source and a
	// copy, a booking has the booker's trip and the plan it was copied from.
	// D-18 protects a trip whichever end it is on.
	TripID      *string `gorm:"type:char(36);index" json:"trip_id"`
	OtherTripID *string `gorm:"type:char(36);index" json:"other_trip_id"`
	BookingID   *string `gorm:"type:char(36);index" json:"booking_id"`

	Snapshot   datatypes.JSON `json:"snapshot"`
	OccurredAt time.Time      `gorm:"not null;index" json:"occurred_at"`
}

func (ValueSource) TableName() string { return "value_sources" }

// EarningEvent is one status change of a creator earning. The `status` column on
// the earning is kept current for fast queries; this row is the evidence.
type EarningEvent struct {
	Base
	EarningID  string    `gorm:"type:char(36);not null;index" json:"earning_id"`
	FromStatus string    `gorm:"type:varchar(12);not null" json:"from_status"`
	ToStatus   string    `gorm:"type:varchar(12);not null" json:"to_status"`
	ActorID    *string   `gorm:"type:char(36)" json:"actor_id"`
	Reason     string    `gorm:"type:varchar(255)" json:"reason"`
	Ref        string    `gorm:"type:varchar(120)" json:"ref"`
	OccurredAt time.Time `gorm:"not null" json:"occurred_at"`
}

func (EarningEvent) TableName() string { return "earning_events" }

// LedgerFlag is something a person has to look at: a booking cancelled after
// the money already left, or a credit code spent before its booking was undone
// (D-36). Resolving it never edits the ledger; an adjustment does that.
type LedgerFlag struct {
	Base
	SourceID    string     `gorm:"type:char(36);not null;index" json:"source_id"`
	SubjectType string     `gorm:"type:varchar(20);not null" json:"subject_type"`
	SubjectID   string     `gorm:"type:char(36);not null;index" json:"subject_id"`
	Reason      string     `gorm:"type:varchar(255);not null" json:"reason"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	ResolvedBy  *string    `gorm:"type:char(36)" json:"resolved_by"`
	Resolution  string     `gorm:"type:varchar(255)" json:"resolution"`
}

func (LedgerFlag) TableName() string { return "ledger_flags" }

// AdminAuditLog records every admin action that touches money or identity.
type AdminAuditLog struct {
	Base
	ActorID    string         `gorm:"type:char(36);not null;index" json:"actor_id"`
	Action     string         `gorm:"type:varchar(60);not null;index" json:"action"`
	TargetType string         `gorm:"type:varchar(30);not null" json:"target_type"`
	TargetID   string         `gorm:"type:varchar(60);not null;index" json:"target_id"`
	Reason     string         `gorm:"type:varchar(255)" json:"reason"`
	Before     datatypes.JSON `json:"before"`
	After      datatypes.JSON `json:"after"`
	IP         string         `gorm:"type:varchar(64)" json:"ip"`
	OccurredAt time.Time      `gorm:"not null;index" json:"occurred_at"`
}

func (AdminAuditLog) TableName() string { return "admin_audit_logs" }

// AppSetting is one admin-tunable number (D-30).
type AppSetting struct {
	Key       string    `gorm:"type:varchar(60);primaryKey" json:"key"`
	Value     string    `gorm:"type:varchar(255);not null" json:"value"`
	UpdatedBy *string   `gorm:"type:char(36)" json:"updated_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (AppSetting) TableName() string { return "app_settings" }

// LedgerEntry is one event and everything it paid out, written together.
type LedgerEntry struct {
	Source   *ValueSource
	Points   []UserPoints
	Earnings []CreatorEarning
}

type LedgerStore interface {
	// Record writes the source, then every points and earning row with its
	// source_id set, in one transaction. Half an evidence chain is worse than
	// none: it reads as complete.
	Record(ctx context.Context, entry *LedgerEntry) error

	GetSource(ctx context.Context, id string) (*ValueSource, error)
	SourcesByIDs(ctx context.Context, ids []string) ([]ValueSource, error)
	ChildSources(ctx context.Context, parentIDs []string) ([]ValueSource, error)
	// LatestSource finds the newest source of a kind about a subject.
	LatestSource(ctx context.Context, kind, subjectID string) (*ValueSource, error)
	// CloneSourceForCopy finds the clone event that produced this trip.
	CloneSourceForCopy(ctx context.Context, copyTripID string) (*ValueSource, error)
	SourcesForTrip(ctx context.Context, tripID string, limit int) ([]ValueSource, error)
	SourcesForBooking(ctx context.Context, bookingID string) ([]ValueSource, error)
	SourcesForSubject(ctx context.Context, subjectID string) ([]ValueSource, error)
	SourcesForActor(ctx context.Context, userID string, limit int) ([]ValueSource, error)
	TripTied(ctx context.Context, tripID string) (bool, error)
	// TiedBookingIDs answers D-18 for a whole list at once.
	TiedBookingIDs(ctx context.Context, bookingIDs []string) (map[string]bool, error)

	PointsBySources(ctx context.Context, sourceIDs []string) ([]UserPoints, error)
	EarningsBySources(ctx context.Context, sourceIDs []string) ([]CreatorEarning, error)
	GetPoints(ctx context.Context, id string) (*UserPoints, error)
	GetEarning(ctx context.Context, id string) (*CreatorEarning, error)
	PointsForUser(ctx context.Context, userID string, limit int) ([]UserPoints, error)
	EarningsForUser(ctx context.Context, userID string, limit int) ([]CreatorEarning, error)

	// TransitionEarning moves an earning from one of `from` to `to` and writes
	// the event in the same transaction. False when the earning was not in an
	// allowed state — somebody else moved it first.
	TransitionEarning(ctx context.Context, earningID string, from []string, to string, actorID *string, reason, ref string) (bool, error)
	EarningEvents(ctx context.Context, earningIDs []string) ([]EarningEvent, error)

	// MoveEarningsToPayout puts payable earnings into a payout (in_payout) and
	// writes an event for each, all or nothing. Returns how many moved.
	MoveEarningsToPayout(ctx context.Context, earningIDs []string, payoutID string, actorID *string) (int, error)
	EarningsByStatus(ctx context.Context, status, partner string, limit int) ([]CreatorEarning, error)
	EarningsForPayout(ctx context.Context, payoutID string) ([]CreatorEarning, error)
	// HeldEarnings is money owed to people who have not verified (D-35),
	// optionally for one user, optionally only what occurred before `before`.
	HeldEarnings(ctx context.Context, userID string, before *time.Time) ([]CreatorEarning, error)

	AddFlag(ctx context.Context, flag *LedgerFlag) error
	ResolveFlag(ctx context.Context, flagID, actorID, resolution string, at time.Time) (bool, error)
	ListFlags(ctx context.Context, openOnly bool, limit int) ([]LedgerFlag, error)
	FlagsBySources(ctx context.Context, sourceIDs []string) ([]LedgerFlag, error)
}

type SettingsStore interface {
	All(ctx context.Context) (map[string]string, error)
	Set(ctx context.Context, key, value string, actorID *string) error
}

type AuditStore interface {
	Log(ctx context.Context, entry *AdminAuditLog) error
	List(ctx context.Context, targetType, targetID string, limit int) ([]AdminAuditLog, error)
}
