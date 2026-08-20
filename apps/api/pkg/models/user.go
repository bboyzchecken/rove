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
	CharacterID  *int16  `gorm:"index" json:"character_id"`
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
}

func (User) TableName() string { return "users" }

// UserStore is the contract handlers depend on. The GORM implementation lives
// in pkg/store/user — handlers must never import it directly.
type UserStore interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByProvider(ctx context.Context, provider, providerUID string) (*User, error)
	GetByHandle(ctx context.Context, handle string) (*User, error)
	// ListByIDs backs member lists, comment authors and activity feeds without
	// an N+1 query per row.
	ListByIDs(ctx context.Context, ids []string) ([]User, error)
	Update(ctx context.Context, u *User) error
	SetCharacter(ctx context.Context, userID string, characterID int16) error
	Count(ctx context.Context) (int64, error)
}

// PublicUser is the only user shape that ever leaves the API. Email, provider
// ids and password never appear in a response.
type PublicUser struct {
	ID          string  `json:"id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   string  `json:"avatar_url"`
	Handle      *string `json:"handle"`
	CharacterID *int16  `json:"character_id"`
	IsCreator   bool    `json:"is_creator"`
}

func (u User) Public() PublicUser {
	return PublicUser{
		ID:          u.ID,
		DisplayName: u.DisplayName,
		AvatarURL:   u.AvatarURL,
		Handle:      u.Handle,
		CharacterID: u.CharacterID,
		IsCreator:   u.IsCreator,
	}
}
