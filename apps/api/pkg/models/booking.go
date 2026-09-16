package models

import (
	"context"
	"time"
)

// Booking kinds and statuses (DEV_SPEC M12).
const (
	BookingStay      = "stay"
	BookingActivity  = "activity"
	BookingTransport = "transport"
	BookingFlight    = "flight"
	BookingESIM      = "esim"
	BookingInsurance = "insurance"
)

const (
	BookingIdea      = "idea"
	BookingBooked    = "booked"
	BookingCancelled = "cancelled"
)

// Booking is what the group decided about one bookable thing.
//
// ROVE never takes the payment: the URL goes to a partner and the status comes
// back by hand (or later by CSV import), which is why `confirmation_code` is a
// plain string rather than anything the app pretends to verify.
type Booking struct {
	Base
	TripID            string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	ItemID            *string    `gorm:"type:char(36);index" json:"item_id"`
	Kind              string     `gorm:"type:varchar(20);not null;default:'stay'" json:"kind"`
	Title             string     `gorm:"type:varchar(200);not null" json:"title"`
	Partner           string     `gorm:"type:varchar(60);not null" json:"partner"`
	URL               string     `gorm:"type:varchar(1000)" json:"url"`
	Status            string     `gorm:"type:varchar(12);not null;default:'idea'" json:"status"`
	PricePerPersonTHB *float64   `gorm:"type:decimal(12,2)" json:"price_per_person_thb"`
	CheckIn           *time.Time `gorm:"type:date" json:"check_in"`
	CheckOut          *time.Time `gorm:"type:date" json:"check_out"`
	BookedBy          *string    `gorm:"type:char(36)" json:"booked_by"`
	ConfirmationCode  string     `gorm:"type:varchar(80)" json:"confirmation_code"`
	Note              string     `gorm:"type:varchar(255)" json:"note"`
	// A booking a partner confirmed cannot be deleted, only put away (D-41).
	ArchivedAt *time.Time `gorm:"index" json:"archived_at"`
	ArchivedBy *string    `gorm:"type:char(36)" json:"archived_by"`
}

func (Booking) TableName() string { return "bookings" }

// BookingClick is the affiliate trail (A12.2). /go/:id logs one of these and
// then redirects — the id is what a partner postback can be matched against.
type BookingClick struct {
	Base
	TripID          string    `gorm:"type:char(36);index" json:"trip_id"`
	UserID          string    `gorm:"type:char(36);index" json:"user_id"`
	Partner         string    `gorm:"type:varchar(60);not null" json:"partner"`
	TargetURL       string    `gorm:"type:varchar(1000);not null" json:"target_url"`
	ItemID          *string   `gorm:"type:char(36)" json:"item_id"`
	// The booking row the link was minted from, so a partner confirmation can
	// protect the booking it belongs to (D-18). Nil on clicks from before F12.
	BookingID *string `gorm:"type:char(36);index" json:"booking_id"`
	// Set when the click came from a public trip someone else published, so the
	// points can be awarded to its creator (§6.5).
	SourceCreatorID *string   `gorm:"type:char(36)" json:"source_creator_id"`
	ClickedAt       time.Time `gorm:"not null" json:"clicked_at"`
	ConfirmedAt     *time.Time `json:"confirmed_at"`
	CancelledAt *time.Time `json:"cancelled_at"`
}

func (BookingClick) TableName() string { return "booking_clicks" }

type BookingStore interface {
	Create(ctx context.Context, b *Booking) error
	Get(ctx context.Context, tripID, bookingID string) (*Booking, error)
	// ListByTrip leaves out archived bookings; ListArchived is the other half.
	ListByTrip(ctx context.Context, tripID string) ([]Booking, error)
	ListArchived(ctx context.Context, tripID string) ([]Booking, error)
	SetArchived(ctx context.Context, tripID, bookingID string, at *time.Time, by *string) error
	Update(ctx context.Context, b *Booking) error
	Delete(ctx context.Context, tripID, bookingID string) error

	AddClick(ctx context.Context, click *BookingClick) error
	GetClick(ctx context.Context, clickID string) (*BookingClick, error)
	// ConfirmClick and CancelClick only move a click that has not already made
	// that move, and report whether this call was the one that did — partners
	// retry webhooks, sometimes two at once.
	ConfirmClick(ctx context.Context, clickID string, at time.Time) (bool, error)
	CancelClick(ctx context.Context, clickID string, at time.Time) (bool, error)
	CountClicks(ctx context.Context, since time.Time) (int64, error)
}
