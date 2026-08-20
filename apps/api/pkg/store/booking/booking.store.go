// Package booking holds the GORM implementation of bookings and the affiliate
// click trail (M12 — A12.2, A12.4).
package booking

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.BookingStore { return &store{db: db} }

var Module = fx.Module("store.booking", fx.Provide(New))

func (s *store) Create(ctx context.Context, b *models.Booking) error {
	return s.db.WithContext(ctx).Create(b).Error
}

func (s *store) Get(ctx context.Context, tripID, bookingID string) (*models.Booking, error) {
	var b models.Booking
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, bookingID).First(&b).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.Booking, error) {
	var out []models.Booking
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *store) Update(ctx context.Context, b *models.Booking) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", b.TripID, b.ID).Save(b).Error
}

func (s *store) Delete(ctx context.Context, tripID, bookingID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, bookingID).
		Delete(&models.Booking{}).Error
}

/* ---------------------------------------------------------------- clicks -- */

// AddClick is written before the redirect, not after: if the log fails we would
// rather know than silently lose the attribution the business model runs on.
func (s *store) AddClick(ctx context.Context, click *models.BookingClick) error {
	if click.ClickedAt.IsZero() {
		click.ClickedAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(click).Error
}

// GetClick is looked up by id alone on purpose — /go/:id is a public redirect
// and the id is the unguessable capability.
func (s *store) GetClick(ctx context.Context, clickID string) (*models.BookingClick, error) {
	var c models.BookingClick
	if err := s.db.WithContext(ctx).Where("id = ?", clickID).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *store) ConfirmClick(ctx context.Context, clickID string, at time.Time) error {
	return s.db.WithContext(ctx).Model(&models.BookingClick{}).
		Where("id = ?", clickID).
		Update("confirmed_at", at).Error
}

func (s *store) CountClicks(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.BookingClick{}).
		Where("clicked_at >= ?", since).
		Count(&n).Error
	return n, err
}
