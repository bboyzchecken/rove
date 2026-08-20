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

func (s *store) List(ctx context.Context, activeOnly bool) ([]models.Character, error) {
	q := s.db.WithContext(ctx).Model(&models.Character{})
	if activeOnly {
		q = q.Where("is_active = ?", true)
	}
	var cs []models.Character
	err := q.Order("id ASC").Find(&cs).Error
	return cs, err
}

func (s *store) GetByID(ctx context.Context, id int16) (*models.Character, error) {
	var c models.Character
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// Upsert is what the seeder calls; re-running it updates names and art without
// orphaning users who already picked that id.
func (s *store) Upsert(ctx context.Context, c *models.Character) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"name", "emoji", "image_url", "is_active"}),
	}).Create(c).Error
}

func (s *store) Update(ctx context.Context, c *models.Character) error {
	return s.db.WithContext(ctx).Save(c).Error
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Character{}).Count(&n).Error
	return n, err
}
