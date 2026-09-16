package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// Getting paid (Feedback #4 — F11, D-21 … D-23, D-35 … D-40).
//
// A creator earns from day one, but money only leaves once they are a verified
// person with a verified account. Identity numbers and account numbers are
// stored sealed (AES-GCM) with a keyed hash beside them, so "is this ID card
// already used by another account" is an equality lookup that never decrypts.

/* ------------------------------------------------------- payout cycles --- */

const (
	CycleOpen   = "open"
	CycleClosed = "closed"
)

// PayoutCycle is one fortnight (D-21): closes on a Tuesday, pays within three
// working days. An admin may pull a cutoff earlier, never push it later.
type PayoutCycle struct {
	Base
	CutoffDate     time.Time  `gorm:"type:date;not null;uniqueIndex" json:"cutoff_date"`
	OriginalCutoff time.Time  `gorm:"type:date;not null" json:"original_cutoff"`
	DueDate        time.Time  `gorm:"type:date;not null" json:"due_date"`
	MovedBy        *string    `gorm:"type:char(36)" json:"moved_by"`
	MovedReason    string     `gorm:"type:varchar(255)" json:"moved_reason"`
	Status         string     `gorm:"type:varchar(12);not null;default:'open'" json:"status"`
	ClosedAt       *time.Time `json:"closed_at"`
	ClosedBy       *string    `gorm:"type:char(36)" json:"closed_by"`
}

func (PayoutCycle) TableName() string { return "payout_cycles" }

type PayoutCycleStore interface {
	List(ctx context.Context) ([]PayoutCycle, error)
	Get(ctx context.Context, id string) (*PayoutCycle, error)
	Create(ctx context.Context, cycle *PayoutCycle) error
	Update(ctx context.Context, cycle *PayoutCycle) error
	// NextOpen is the earliest cycle still open.
	NextOpen(ctx context.Context) (*PayoutCycle, error)

	CreatePayout(ctx context.Context, payout *Payout) error
	GetPayout(ctx context.Context, id string) (*Payout, error)
	UpdatePayout(ctx context.Context, payout *Payout) error
	PayoutsForCycle(ctx context.Context, cycleID string) ([]Payout, error)
}

/* -------------------------------------------------------- verification --- */

const (
	KYCDraft     = "draft"
	KYCSubmitted = "submitted"
	KYCApproved  = "approved"
	KYCRejected  = "rejected"
	KYCRevoked   = "revoked"

	LegalIndividual = "individual"
	LegalJuristic   = "juristic"

	// The four steps of "เปิดรับรายได้" (D-37). A rejection names the ones to
	// redo (D-39).
	KYCStepBasic     = "basic"
	KYCStepIdentity  = "identity"
	KYCStepDocuments = "documents"
	KYCStepAccount   = "account"

	KYCProviderManual = "manual"
)

var KYCSteps = []string{KYCStepBasic, KYCStepIdentity, KYCStepDocuments, KYCStepAccount}

type CreatorVerification struct {
	Base
	UserID    string `gorm:"type:char(36);not null;uniqueIndex" json:"user_id"`
	Status    string `gorm:"type:varchar(12);not null;default:'draft'" json:"status"`
	LegalType string `gorm:"type:varchar(12);not null;default:'individual'" json:"legal_type"`
	LegalName string `gorm:"type:varchar(200)" json:"legal_name"`

	Phone           string     `gorm:"type:varchar(20)" json:"phone"`
	PhoneVerifiedAt *time.Time `json:"phone_verified_at"`
	Email           string     `gorm:"type:varchar(255)" json:"email"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`

	// Sealed national ID / tax ID; the hash is what uniqueness is checked on.
	IDNumberSealed string  `gorm:"type:text" json:"-"`
	IDNumberHash   *string `gorm:"type:char(64);index" json:"-"`
	IDNumberLast4  string  `gorm:"type:varchar(4)" json:"id_number_last4"`

	IDCardKey string `gorm:"type:varchar(255)" json:"-"`
	SelfieKey string `gorm:"type:varchar(255)" json:"-"`

	// Swappable for an e-KYC provider later (D-23).
	Provider    string `gorm:"type:varchar(30);not null;default:'manual'" json:"provider"`
	ProviderRef string `gorm:"type:varchar(120)" json:"provider_ref"`

	RejectedSteps datatypes.JSON `json:"rejected_steps"`
	RejectReason  string         `gorm:"type:varchar(500)" json:"reject_reason"`
	SubmittedAt   *time.Time     `json:"submitted_at"`
	ReviewedAt    *time.Time     `json:"reviewed_at"`
	ReviewedBy    *string        `gorm:"type:char(36)" json:"reviewed_by"`
}

func (CreatorVerification) TableName() string { return "creator_verifications" }

const (
	AccountBank      = "bank"
	AccountPromptPay = "promptpay"

	AccountPending  = "pending"
	AccountVerified = "verified"
	AccountRejected = "rejected"
	// Replaced by a newer account; kept, because a past transfer names it.
	AccountReplaced = "replaced"
)

type PayoutAccount struct {
	Base
	UserID       string     `gorm:"type:char(36);not null;index" json:"user_id"`
	Kind         string     `gorm:"type:varchar(12);not null" json:"kind"`
	BankCode     string     `gorm:"type:varchar(20)" json:"bank_code"`
	NumberSealed string     `gorm:"type:text" json:"-"`
	NumberHash   string     `gorm:"type:char(64);not null;index" json:"-"`
	NumberLast4  string     `gorm:"type:varchar(4)" json:"number_last4"`
	AccountName  string     `gorm:"type:varchar(200);not null" json:"account_name"`
	Status       string     `gorm:"type:varchar(12);not null;default:'pending'" json:"status"`
	VerifiedAt   *time.Time `json:"verified_at"`
	VerifiedBy   *string    `gorm:"type:char(36)" json:"verified_by"`
	RejectReason string     `gorm:"type:varchar(255)" json:"reject_reason"`
}

func (PayoutAccount) TableName() string { return "payout_accounts" }

// OTPChallenge is one code sent to a phone or an email.
type OTPChallenge struct {
	Base
	UserID     string     `gorm:"type:char(36);not null;index" json:"user_id"`
	Channel    string     `gorm:"type:varchar(10);not null" json:"channel"`
	Target     string     `gorm:"type:varchar(255);not null" json:"target"`
	CodeHash   string     `gorm:"type:char(64);not null" json:"-"`
	ExpiresAt  time.Time  `gorm:"not null" json:"expires_at"`
	Attempts   int        `gorm:"not null;default:0" json:"attempts"`
	ConsumedAt *time.Time `json:"consumed_at"`
}

func (OTPChallenge) TableName() string { return "otp_challenges" }

// EarningNotice remembers that a person was already warned about an earning
// running out (D-35), so opening the app twice does not warn twice.
type EarningNotice struct {
	Base
	EarningID string `gorm:"type:char(36);not null;uniqueIndex" json:"earning_id"`
}

func (EarningNotice) TableName() string { return "earning_notices" }

type KYCStore interface {
	GetByUser(ctx context.Context, userID string) (*CreatorVerification, error)
	Get(ctx context.Context, id string) (*CreatorVerification, error)
	Save(ctx context.Context, v *CreatorVerification) error
	List(ctx context.Context, status string, limit int) ([]CreatorVerification, error)
	// IDHashTaken reports whether another user has already SUBMITTED this ID.
	// A draft does not count: otherwise anyone could type a stranger's ID into
	// their own draft and lock the real owner out.
	IDHashTaken(ctx context.Context, hash, exceptUserID string) (bool, error)

	CurrentAccount(ctx context.Context, userID string) (*PayoutAccount, error)
	GetAccount(ctx context.Context, id string) (*PayoutAccount, error)
	// ReplaceAccount retires the user's current account and writes the new one.
	ReplaceAccount(ctx context.Context, account *PayoutAccount) error
	SaveAccount(ctx context.Context, account *PayoutAccount) error
	// UsersSharingAccount lists other users whose account has this hash.
	UsersSharingAccount(ctx context.Context, hash, exceptUserID string) ([]string, error)
	PendingAccountChanges(ctx context.Context, limit int) ([]PayoutAccount, error)

	CreateOTP(ctx context.Context, otp *OTPChallenge) error
	LatestOTP(ctx context.Context, userID, channel string) (*OTPChallenge, error)
	SaveOTP(ctx context.Context, otp *OTPChallenge) error

	// MarkNotice returns false when the earning was already noticed.
	MarkNotice(ctx context.Context, earningID string) (bool, error)
}
