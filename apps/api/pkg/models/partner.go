package models

import (
	"context"
	"time"
)

// The three tables the partner economy needs (DEV_SPEC A12.10–A12.12):
// what points can be turned into, what a creator has earned, and the people
// who asked an agent for help.

/* ------------------------------------------------- discount codes (A12.10) */

// Discount code scopes. `ai_credits` is the only thing ROVE charges for today;
// `booking` exists so the day a partner supports codes is a deploy and not a
// migration on a table people already hold codes in.
const (
	DiscountScopeAICredits = "ai_credits"
	DiscountScopeBooking   = "booking"
)

// DiscountCode is points turned into money off (A12.10).
//
// Issuing one burns the points immediately: a code that exists is already paid
// for, so a balance can never be spent twice by holding two codes. Refusing a
// code is therefore the only failure mode, and it is a cheap one.
type DiscountCode struct {
	Base
	UserID string `gorm:"type:char(36);not null;index" json:"user_id"`
	// Human-typable: uppercase letters and digits, no I/O/0/1.
	Code        string  `gorm:"type:varchar(16);not null;uniqueIndex" json:"code"`
	Scope       string  `gorm:"type:varchar(20);not null;default:'ai_credits'" json:"scope"`
	AmountTHB   float64 `gorm:"type:decimal(12,2);not null" json:"amount_thb"`
	PointsSpent int     `gorm:"not null" json:"points_spent"`
	ExpiresAt   time.Time `gorm:"not null" json:"expires_at"`
	// Set the moment it is applied to an order; a code is single-use.
	UsedAt    *time.Time `json:"used_at"`
	UsedOrder *string    `gorm:"type:char(36)" json:"used_order_id"`
}

func (DiscountCode) TableName() string { return "discount_codes" }

func (d DiscountCode) Usable(at time.Time) bool {
	return d.UsedAt == nil && at.Before(d.ExpiresAt)
}

/* ------------------------------------------- creator revenue share (A12.11) */

// Earning statuses. `pending` is a booking a partner has confirmed but not yet
// paid us for; `payable` is money we have and owe on; `paid` is settled.
const (
	EarningPending = "pending"
	EarningPayable = "payable"
	EarningPaid    = "paid"
)

// CreatorEarning is one line of what a published plan earned its creator.
//
// Separate from `user_points` on purpose: points are a loyalty currency this
// product mints, and this is money somebody else owes. Mixing them would make
// "what do we owe creators this month" a question about a game score.
type CreatorEarning struct {
	Base
	UserID  string  `gorm:"type:char(36);not null;index" json:"user_id"`
	TripID  string  `gorm:"type:char(36);index" json:"trip_id"`
	ClickID *string `gorm:"type:char(36);uniqueIndex" json:"click_id"`
	Partner string  `gorm:"type:varchar(60);not null" json:"partner"`

	BookingValueTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"booking_value_thb"`
	CommissionTHB   float64 `gorm:"type:decimal(12,2);not null;default:0" json:"commission_thb"`
	SharePercent    int     `gorm:"not null" json:"share_percent"`
	AmountTHB       float64 `gorm:"type:decimal(12,2);not null" json:"amount_thb"`
	// True when the commission was derived from a rate table rather than
	// reported by the partner. The payout report shows this, because paying
	// out on an estimate is a decision, not an accident.
	Estimated bool `gorm:"not null;default:false" json:"estimated"`

	Status     string    `gorm:"type:varchar(12);not null;default:'pending'" json:"status"`
	OccurredAt time.Time `gorm:"not null;index" json:"occurred_at"`
	PayoutID   *string   `gorm:"type:char(36);index" json:"payout_id"`
}

func (CreatorEarning) TableName() string { return "creator_earnings" }

// Payout statuses.
const (
	PayoutDraft = "draft"
	PayoutPaid  = "paid"
)

// Payout is one transfer to one creator for one period.
type Payout struct {
	Base
	UserID       string     `gorm:"type:char(36);not null;index" json:"user_id"`
	PeriodStart  time.Time  `gorm:"type:date;not null" json:"period_start"`
	PeriodEnd    time.Time  `gorm:"type:date;not null" json:"period_end"`
	AmountTHB    float64    `gorm:"type:decimal(12,2);not null" json:"amount_thb"`
	EarningCount int        `gorm:"not null" json:"earning_count"`
	Status       string     `gorm:"type:varchar(12);not null;default:'draft'" json:"status"`
	Note         string     `gorm:"type:varchar(255)" json:"note"`
	PaidAt       *time.Time `json:"paid_at"`
}

func (Payout) TableName() string { return "payouts" }

// EarningTotals is the creator-facing summary.
type EarningTotals struct {
	PendingTHB float64 `json:"pending_thb"`
	PayableTHB float64 `json:"payable_thb"`
	PaidTHB    float64 `json:"paid_thb"`
	Count      int     `json:"count"`
}

/* ---------------------------------------------- agent lead handoff (A12.12) */

// Lead statuses.
const (
	LeadNew       = "new"
	LeadSent      = "sent"
	LeadContacted = "contacted"
	LeadWon       = "won"
	LeadLost      = "lost"
)

// AgentLead is a group asking a human to take it from here (A12.12).
//
// Some trips do not want a planner, they want somebody to book the thing. This
// is the row that hands the trip to a partner agent and keeps the group able to
// see what happened to their request — a lead nobody can follow up on is a
// contact form, not a handoff.
type AgentLead struct {
	Base
	TripID  string `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID  string `gorm:"type:char(36);not null;index" json:"user_id"`
	Partner string `gorm:"type:varchar(60);not null" json:"partner"`

	ContactName  string `gorm:"type:varchar(120);not null" json:"contact_name"`
	ContactPhone string `gorm:"type:varchar(40)" json:"contact_phone"`
	ContactLine  string `gorm:"type:varchar(80)" json:"contact_line"`
	Note         string `gorm:"type:text" json:"note"`

	// A snapshot of the trip as it was when the lead was sent: the agent quotes
	// against what they were told, and the room keeps editing afterwards.
	PartySize    int        `gorm:"not null;default:1" json:"party_size"`
	StartDate    *time.Time `gorm:"type:date" json:"start_date"`
	EndDate      *time.Time `gorm:"type:date" json:"end_date"`
	Destination  string     `gorm:"type:varchar(200)" json:"destination"`
	BudgetPerPersonTHB float64 `gorm:"type:decimal(12,2);not null;default:0" json:"budget_per_person_thb"`

	Status string     `gorm:"type:varchar(12);not null;default:'new'" json:"status"`
	SentAt *time.Time `json:"sent_at"`
	// Whatever the ops team needs to remember about this one.
	AdminNote string `gorm:"type:varchar(255)" json:"admin_note"`
}

func (AgentLead) TableName() string { return "agent_leads" }

/* ---------------------------------------------------------------- stores -- */

type DiscountStore interface {
	Create(ctx context.Context, code *DiscountCode) error
	GetByCode(ctx context.Context, code string) (*DiscountCode, error)
	ListForUser(ctx context.Context, userID string) ([]DiscountCode, error)

	// Claim is the single-use guard. It only writes a row that is still
	// unused and reports whether it won, so two concurrent checkouts cannot
	// both spend one code. The receipt is linked afterwards with Attach,
	// because the order number is assigned as the order is written and there
	// is no id to point at yet.
	Claim(ctx context.Context, codeID string, at time.Time) (bool, error)
	Attach(ctx context.Context, codeID, orderID string) error
	// Release puts a claimed code back when the purchase it was claimed for
	// failed to write. A code somebody paid points for must not evaporate
	// because of a database error.
	Release(ctx context.Context, codeID string) error
}

type EarningStore interface {
	Create(ctx context.Context, earning *CreatorEarning) error
	ListForUser(ctx context.Context, userID string, limit int) ([]CreatorEarning, error)
	TotalsForUser(ctx context.Context, userID string) (EarningTotals, error)
	// ListPayable feeds the payout report: everything owed in a period,
	// grouped by creator by the caller.
	ListPayable(ctx context.Context, from, to time.Time) ([]CreatorEarning, error)
	// AttachToPayout marks the given earnings paid in one transaction.
	AttachToPayout(ctx context.Context, payoutID string, earningIDs []string, at time.Time) error
}

type PayoutStore interface {
	Create(ctx context.Context, payout *Payout) error
	ListForUser(ctx context.Context, userID string) ([]Payout, error)
	List(ctx context.Context, from, to time.Time) ([]Payout, error)
}

type LeadStore interface {
	Create(ctx context.Context, lead *AgentLead) error
	ListByTrip(ctx context.Context, tripID string) ([]AgentLead, error)
	List(ctx context.Context, status string, limit int) ([]AgentLead, error)
	Get(ctx context.Context, leadID string) (*AgentLead, error)
	Update(ctx context.Context, lead *AgentLead) error
}
