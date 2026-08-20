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
	var fs []models.TripFlight
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("dep_at ASC").Find(&fs).Error
	return fs, err
}

// ReplaceAll is how the flights form saves: a trip has at most a handful of
// legs, and replacing them wholesale avoids diffing rows the user reordered.
func (s *store) ReplaceAll(ctx context.Context, tripID string, flights []models.TripFlight) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Where("trip_id = ?", tripID).Delete(&models.TripFlight{}).Error; err != nil {
			return err
		}
		if len(flights) == 0 {
			return nil
		}
		for i := range flights {
			flights[i].TripID = tripID
			flights[i].ID = ""
		}
		return db.Create(&flights).Error
	})
}

func (s *store) Delete(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		Delete(&models.TripFlight{}).Error
}
