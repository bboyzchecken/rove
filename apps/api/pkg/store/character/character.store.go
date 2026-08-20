// Package character holds the GORM implementation of the character catalogue
// (M14 — A14.1). The list is tiny and read on almost every screen, so it is
// deliberately a plain table with no joins.
package character

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.CharacterStore { return &store{db: db} }

var Module = fx.Module("store.character", fx.Provide(New))

func (s *store) List(ctx context.Context) ([]models.Character, error) {
	var out []models.Character
	err := s.db.WithContext(ctx).
		Where("is_active = ?", true).
		Order("sort_order ASC").
		Find(&out).Error
	return out, err
}

// Upsert keeps `go run . seed:characters` re-runnable.
func (s *store) Upsert(ctx context.Context, c *models.Character) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"name_th", "image_url", "accent", "sort_order", "is_active"}),
	}).Create(c).Error
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Character{}).Count(&n).Error
	return n, err
}
