package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Base carries the conventions from DEV_SPEC §4.1:
//   - primary key is a UUID v4 stored as CHAR(36) so ids are unguessable and
//     survive clone/share across trips
//   - created_at / updated_at are managed by GORM and stored in UTC
//   - NO soft delete anywhere — use a status/flag column instead
type Base struct {
	ID        string    `gorm:"type:char(36);primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (b *Base) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.NewString()
	}
	return nil
}
