package models

import "context"

// Character is one of the twenty fixed avatars (DEV_SPEC M14 — A14.1).
//
// The id is the slug, not a UUID: it is seeded from data/characters.json, the
// web app ships the same list as static assets, and both sides have to agree
// on "shiba" without a lookup.
type Character struct {
	ID        string `gorm:"type:varchar(40);primaryKey" json:"id"`
	NameTH    string `gorm:"type:varchar(80);not null" json:"name_th"`
	ImageURL  string `gorm:"type:varchar(500);not null" json:"image_url"`
	Accent    string `gorm:"type:varchar(20);not null;default:'primary'" json:"accent"`
	SortOrder int    `gorm:"not null;default:0" json:"sort_order"`
	IsActive  bool   `gorm:"not null;default:true" json:"is_active"`
}

func (Character) TableName() string { return "characters" }

type CharacterStore interface {
	List(ctx context.Context) ([]Character, error)
	Upsert(ctx context.Context, c *Character) error
	Count(ctx context.Context) (int64, error)
}
