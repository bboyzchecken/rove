package models

import "context"

// DreamItem is a personal bucket-list entry, unrelated to any trip (M15).
type DreamItem struct {
	Base
	UserID             string `gorm:"type:char(36);not null;index:idx_dream_user_sort,priority:1" json:"user_id"`
	Title              string `gorm:"type:varchar(200);not null" json:"title"`
	DestinationCountry string `gorm:"type:varchar(80)" json:"destination_country"`
	DestinationCity    string `gorm:"type:varchar(80)" json:"destination_city"`
	URL                string `gorm:"type:varchar(500)" json:"url"`
	ImageURL           string `gorm:"type:varchar(500)" json:"image_url"`
	Notes              string `gorm:"type:text" json:"notes"`
	SortOrder          int    `gorm:"not null;default:0;index:idx_dream_user_sort,priority:2" json:"sort_order"`
}

func (DreamItem) TableName() string { return "dream_items" }

// Every method takes userID: a dream item is owned by exactly one user and is
// never readable by anyone else (the §4.3 rule applied outside trips).
type DreamStore interface {
	List(ctx context.Context, userID string, limit, offset int) ([]DreamItem, int64, error)
	Create(ctx context.Context, d *DreamItem) error
	Get(ctx context.Context, userID, id string) (*DreamItem, error)
	Update(ctx context.Context, d *DreamItem) error
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID string, ids []string) error
	NextSortOrder(ctx context.Context, userID string) (int, error)
}
