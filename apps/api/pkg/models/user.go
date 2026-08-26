package models

import "context"

// Auth providers.
const (
	ProviderLine     = "line"
	ProviderGoogle   = "google"
	ProviderPassword = "password"
)

// Roles.
const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

// Account status.
const (
	UserStatusActive      = "active"
	UserStatusDeactivated = "deactivated"
)

type User struct {
	Base
	DisplayName  string  `gorm:"type:varchar(120);not null" json:"display_name"`
	AvatarURL    string  `gorm:"type:varchar(500)" json:"avatar_url"`
	Handle       *string `gorm:"type:varchar(60);uniqueIndex" json:"handle"`
	Email        *string `gorm:"type:varchar(255);uniqueIndex" json:"email"`
	Password     string  `gorm:"type:varchar(255)" json:"-"`
	Provider     string  `gorm:"type:varchar(20);not null;default:'password'" json:"provider"`
	ProviderUID  string  `gorm:"type:varchar(120);index" json:"provider_uid"`
	Role         string  `gorm:"type:varchar(20);not null;default:'user'" json:"role"`
	Status       string  `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
	IsCreator    bool    `gorm:"not null;default:false" json:"is_creator"`
	Locale       string  `gorm:"type:varchar(10);not null;default:'th'" json:"locale"`
	HomeCurrency string  `gorm:"type:varchar(3);not null;default:'THB'" json:"home_currency"`
	// The little animal that stands in for this person everywhere in the app
	// (M14 — A14.3). Nullable: a brand-new account has not picked one yet.
	CharacterID *string `gorm:"type:varchar(40);index" json:"character_id"`
	// Who invited them, so a referral can be paid out once they join a trip.
	ReferredBy  *string `gorm:"type:char(36)" json:"referred_by"`
}

func (User) TableName() string { return "users" }

// UserStore is the contract handlers depend on. The GORM implementation lives
// in pkg/store/user — handlers must never import it directly.
type UserStore interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByProvider(ctx context.Context, provider, providerUID string) (*User, error)
	Update(ctx context.Context, u *User) error
	// ListByIDs hydrates a member list in one query instead of N.
	ListByIDs(ctx context.Context, ids []string) ([]User, error)
	GetByHandle(ctx context.Context, handle string) (*User, error)
	Count(ctx context.Context) (int64, error)
	// CountAdmins answers "does this install have anyone who can open the admin
	// screens yet" — see findOrCreateUser.
	CountAdmins(ctx context.Context) (int64, error)
}
