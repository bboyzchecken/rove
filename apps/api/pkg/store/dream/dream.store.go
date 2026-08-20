package dream

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.DreamStore { return &store{db: db} }

var Module = fx.Module("store.dream", fx.Provide(New))

// Every query below is scoped by user_id. A dream item id alone is never enough
// to read or write a row — the same rule §4.3 applies to trips.
func (s *store) List(ctx context.Context, userID string, limit, offset int) ([]models.DreamItem, int64, error) {
	q := s.db.WithContext(ctx).Model(&models.DreamItem{}).Where("user_id = ?", userID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []models.DreamItem
	err := q.Order("sort_order ASC, created_at ASC").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

func (s *store) Create(ctx context.Context, d *models.DreamItem) error {
	return s.db.WithContext(ctx).Create(d).Error
}

func (s *store) Get(ctx context.Context, userID, id string) (*models.DreamItem, error) {
	var d models.DreamItem
	err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&d).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *store) Update(ctx context.Context, d *models.DreamItem) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", d.ID, d.UserID).
		Save(d).Error
}

func (s *store) Delete(ctx context.Context, userID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&models.DreamItem{}).Error
}

// Reorder rewrites sort_order to match the given id order, ignoring any id the
// user does not own.
func (s *store) Reorder(ctx context.Context, userID string, ids []string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		for i, id := range ids {
			err := db.Model(&models.DreamItem{}).
				Where("id = ? AND user_id = ?", id, userID).
				Update("sort_order", i).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *store) NextSortOrder(ctx context.Context, userID string) (int, error) {
	var max *int
	err := s.db.WithContext(ctx).Model(&models.DreamItem{}).
		Where("user_id = ?", userID).
		Select("MAX(sort_order)").Scan(&max).Error
	if err != nil || max == nil {
		return 0, err
	}
	return *max + 1, nil
}
