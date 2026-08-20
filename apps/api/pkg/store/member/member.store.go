package member

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TripMemberStore { return &store{db: db} }

var Module = fx.Module("store.member", fx.Provide(New))

func (s *store) Add(ctx context.Context, m *models.TripMember) error {
	if m.JoinedAt.IsZero() {
		m.JoinedAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(m).Error
}

// Get powers TripRoleMiddleware — it is on the hot path of every trip request.
func (s *store) Get(ctx context.Context, tripID, userID string) (*models.TripMember, error) {
	var m models.TripMember
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		First(&m).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripMember, error) {
	var ms []models.TripMember
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&ms).Error
	return ms, err
}

func (s *store) UpdateRole(ctx context.Context, tripID, userID, role string) error {
	return s.db.WithContext(ctx).
		Model(&models.TripMember{}).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Update("role", role).Error
}

func (s *store) Remove(ctx context.Context, tripID, userID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Delete(&models.TripMember{}).Error
}

func (s *store) CountByTrip(ctx context.Context, tripID string) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.TripMember{}).
		Where("trip_id = ?", tripID).
		Count(&n).Error
	return n, err
}
