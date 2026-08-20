package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Booking confirmation status.
const (
	ConfirmPending   = "pending"
	ConfirmConfirmed = "confirmed"
	ConfirmCancelled = "cancelled"
)

// BookingClick records the redirect through /go/:trackingId.
//
// SourceTripID / SourceCreatorID are what make the public-trip incentive work:
// if this trip was cloned from someone else's public trip, their id rides along
// so a later confirmation can award them points (DEV_SPEC §1, §6.5).
type BookingClick struct {
	Base
	TripID          string     `gorm:"type:char(36);index" json:"trip_id"`
	PlanID          *string    `gorm:"type:char(36)" json:"plan_id"`
	ItemID          *string    `gorm:"type:char(36);index" json:"item_id"`
	UserID          string     `gorm:"type:char(36)" json:"user_id"`
	Partner         string     `gorm:"type:varchar(40);not null" json:"partner"`
	TrackingID      string     `gorm:"type:varchar(64);uniqueIndex;not null" json:"tracking_id"`
	TargetURL       string     `gorm:"type:varchar(1000);not null" json:"target_url"`
	ClickedAt       *time.Time `json:"clicked_at"`
	UA              string     `gorm:"type:varchar(400)" json:"ua"`
	Referrer        string     `gorm:"type:varchar(500)" json:"referrer"`
	SourceTripID    *string    `gorm:"type:char(36)" json:"source_trip_id"`
	SourceCreatorID *string    `gorm:"type:char(36);index" json:"source_creator_id"`
}

func (BookingClick) TableName() string { return "booking_clicks" }

type BookingConfirmation struct {
	Base
	TrackingID    string         `gorm:"type:varchar(64);not null;index" json:"tracking_id"`
	Partner       string         `gorm:"type:varchar(40);not null" json:"partner"`
	PartnerRef    string         `gorm:"type:varchar(120)" json:"partner_ref"`
	Amount        float64        `gorm:"type:decimal(12,2);not null;default:0" json:"amount"`
	Currency      string         `gorm:"type:varchar(3);not null;default:'THB'" json:"currency"`
	Commission    float64        `gorm:"type:decimal(12,2);not null;default:0" json:"commission"`
	PointsAwarded int            `gorm:"not null;default:0" json:"points_awarded"`
	Status        string         `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ConfirmedAt   *time.Time     `json:"confirmed_at"`
	Raw           datatypes.JSON `gorm:"type:json" json:"raw"`
}

func (BookingConfirmation) TableName() string { return "booking_confirmations" }

// AffiliatePartner lives in the DB, not in code, so commission changes and new
// partners do not need a deploy (M12 risk note).
type AffiliatePartner struct {
	Key              string         `gorm:"type:varchar(40);primaryKey" json:"key"`
	Name             string         `gorm:"type:varchar(80);not null" json:"name"`
	ItemTypes        datatypes.JSON `gorm:"type:json" json:"item_types"`
	DeeplinkTemplate string         `gorm:"type:varchar(1000);not null" json:"deeplink_template"`
	SubIDParam       string         `gorm:"type:varchar(40)" json:"subid_param"`
	Enabled          bool           `gorm:"not null;default:true" json:"enabled"`
	Priority         int            `gorm:"not null;default:0" json:"priority"`
	Notes            string         `gorm:"type:varchar(500)" json:"notes"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

func (AffiliatePartner) TableName() string { return "affiliate_partners" }

// PlanClone records "who copied whose trip" — the edge the points system walks.
type PlanClone struct {
	Base
	SourceTripID string `gorm:"type:char(36);not null;index" json:"source_trip_id"`
	NewTripID    string `gorm:"type:char(36);not null;index" json:"new_trip_id"`
	UserID       string `gorm:"type:char(36);not null" json:"user_id"`
}

func (PlanClone) TableName() string { return "plan_clones" }

type BookingStore interface {
	CreateClick(ctx context.Context, c *BookingClick) error
	GetClickByTracking(ctx context.Context, trackingID string) (*BookingClick, error)
	MarkClicked(ctx context.Context, trackingID, ua, referrer string) error
	ListByTrip(ctx context.Context, tripID string) ([]BookingClick, error)
	CreateConfirmation(ctx context.Context, c *BookingConfirmation) error
	GetConfirmationByRef(ctx context.Context, partner, partnerRef string) (*BookingConfirmation, error)
	ListPartners(ctx context.Context) ([]AffiliatePartner, error)
	UpsertPartner(ctx context.Context, p *AffiliatePartner) error
	RecordClone(ctx context.Context, c *PlanClone) error
	CountClicksSince(ctx context.Context, since time.Time) (int64, error)
	CountConfirmationsSince(ctx context.Context, since time.Time) (int64, error)
}
