package trip

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TripStore { return &store{db: db} }

var Module = fx.Module("store.trip", fx.Provide(New))

func (s *store) Create(ctx context.Context, t *models.Trip) error {
	return s.db.WithContext(ctx).Create(t).Error
}

func (s *store) GetByID(ctx context.Context, tripID string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("id = ?", tripID).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// ListForUser only returns trips the user is actually a member of.
func (s *store) ListForUser(ctx context.Context, userID string, limit, offset int) ([]models.Trip, int64, error) {
	q := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Joins("JOIN trip_members tm ON tm.trip_id = trips.id").
		Where("tm.user_id = ?", userID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var trips []models.Trip
	err := q.Order("trips.updated_at DESC").Limit(limit).Offset(offset).Find(&trips).Error
	return trips, total, err
}

func (s *store) Update(ctx context.Context, t *models.Trip) error {
	return s.db.WithContext(ctx).Save(t).Error
}

func (s *store) Delete(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Where("id = ?", tripID).Delete(&models.Trip{}).Error
}
