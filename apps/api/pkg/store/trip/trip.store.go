package trip

import (
	"context"
	"time"

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

// GetByShareToken and GetBySlug are the two public entry points. They are not
// scoped by member on purpose — the token/slug IS the grant — so the handler
// must still check visibility before returning anything.
func (s *store) GetByShareToken(ctx context.Context, token string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("share_token = ?", token).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) GetBySlug(ctx context.Context, slug string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("slug = ?", slug).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) IncrementView(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ?", tripID).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

func (s *store) IncrementClone(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ?", tripID).
		UpdateColumn("clone_count", gorm.Expr("clone_count + 1")).Error
}

func (s *store) ListForStats(ctx context.Context, userID string) ([]models.Trip, error) {
	var trips []models.Trip
	err := s.db.WithContext(ctx).
		Joins("JOIN trip_members tm ON tm.trip_id = trips.id").
		Where("tm.user_id = ?", userID).
		Order("trips.start_date ASC").
		Find(&trips).Error
	return trips, err
}

// Upcoming powers the home calendar: trips that have not ended yet, soonest first.
func (s *store) Upcoming(ctx context.Context, userID string, from time.Time, limit int) ([]models.Trip, error) {
	if limit <= 0 {
		limit = 10
	}
	var trips []models.Trip
	err := s.db.WithContext(ctx).
		Joins("JOIN trip_members tm ON tm.trip_id = trips.id").
		Where("tm.user_id = ? AND (trips.end_date IS NULL OR trips.end_date >= ?)", userID, from).
		Order("trips.start_date IS NULL, trips.start_date ASC").
		Limit(limit).
		Find(&trips).Error
	return trips, err
}

func (s *store) CountSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("created_at >= ?", since).Count(&n).Error
	return n, err
}
