package models

import "context"

// Character is the cute widget avatar a user picks instead of an OAuth photo
// (DEV_SPEC M14). Seed data — 20 rows loaded from data/characters.json.
type Character struct {
	ID       int16  `gorm:"primaryKey;autoIncrement" json:"id"`
	Name     string `gorm:"type:varchar(60);not null" json:"name"`
	Emoji    string `gorm:"type:varchar(16);not null" json:"emoji"`
	ImageURL string `gorm:"type:varchar(500)" json:"image_url"`
	IsActive bool   `gorm:"not null;default:true" json:"is_active"`
}

func (Character) TableName() string { return "characters" }

type CharacterStore interface {
	List(ctx context.Context, activeOnly bool) ([]Character, error)
	GetByID(ctx context.Context, id int16) (*Character, error)
	Upsert(ctx context.Context, c *Character) error
	Update(ctx context.Context, c *Character) error
	Count(ctx context.Context) (int64, error)
}
