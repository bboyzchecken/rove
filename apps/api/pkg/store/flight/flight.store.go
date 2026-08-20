// Package flight holds the GORM implementation of the trip route (M1 — A1.3).
package flight

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.FlightStore { return &store{db: db} }

var Module = fx.Module("store.flight", fx.Provide(New))

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripFlight, error) {
	var out []models.TripFlight
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("seq ASC, dep_date ASC, created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *store) Get(ctx context.Context, tripID, flightID string) (*models.TripFlight, error) {
	var f models.TripFlight
	if err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, flightID).
		First(&f).Error; err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *store) Create(ctx context.Context, f *models.TripFlight) error {
	return s.db.WithContext(ctx).Create(f).Error
}

func (s *store) Update(ctx context.Context, f *models.TripFlight) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", f.TripID, f.ID).Save(f).Error
}

func (s *store) Delete(ctx context.Context, tripID, flightID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, flightID).
		Delete(&models.TripFlight{}).Error
}

// ReplaceAll is one transaction because a half-written route is worse than the
// old one: the trip frame (dates, destinations) is derived from these rows.
func (s *store) ReplaceAll(ctx context.Context, tripID string, flights []models.TripFlight) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trip_id = ?", tripID).Delete(&models.TripFlight{}).Error; err != nil {
			return err
		}
		if len(flights) == 0 {
			return nil
		}
		for i := range flights {
			flights[i].ID = ""
			flights[i].TripID = tripID
			flights[i].Seq = i
		}
		return tx.Create(&flights).Error
	})
}
