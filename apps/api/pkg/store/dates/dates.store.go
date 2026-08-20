// Package dates holds the GORM implementation of date coordination (M2.5).
//
// Every method is scoped by tripID — availability is the most personal thing
// in the product and must never leak across rooms (§4.3).
package dates

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.DateStore { return &store{db: db} }

var Module = fx.Module("store.dates", fx.Provide(New))

// Replace is one transaction: clear this member's marks for exactly those
// dates, then write the new ones. Painting a week must not leave half of it
// applied if the connection drops in the middle.
func (s *store) Replace(ctx context.Context, tripID, userID string, dates []time.Time, mark *string) error {
	if len(dates) == 0 {
		return nil
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trip_id = ? AND user_id = ? AND date IN ?", tripID, userID, dates).
			Delete(&models.Availability{}).Error; err != nil {
			return err
		}
		if mark == nil {
			return nil
		}

		rows := make([]models.Availability, 0, len(dates))
		for _, d := range dates {
			rows = append(rows, models.Availability{
				TripID: tripID,
				UserID: userID,
				Date:   d,
				Mark:   *mark,
			})
		}
		return tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&rows).Error
	})
}

func (s *store) List(ctx context.Context, tripID string) ([]models.Availability, error) {
	var out []models.Availability
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("date ASC").
		Find(&out).Error
	return out, err
}

func (s *store) Months(ctx context.Context, tripID string) ([]time.Time, error) {
	var raw []time.Time
	err := s.db.WithContext(ctx).
		Model(&models.Availability{}).
		Where("trip_id = ?", tripID).
		Distinct().
		Order("month ASC").
		Pluck("DATE_FORMAT(date, '%Y-%m-01') AS month", &raw).Error
	return raw, err
}

func (s *store) Submit(ctx context.Context, tripID, userID string) error {
	row := models.AvailabilitySubmission{
		TripID:      tripID,
		UserID:      userID,
		SubmittedAt: time.Now().UTC(),
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(&row).Error
}

func (s *store) Submissions(ctx context.Context, tripID string) ([]models.AvailabilitySubmission, error) {
	var out []models.AvailabilitySubmission
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&out).Error
	return out, err
}

// ClearMember runs when someone leaves the room: their days should stop
// counting towards the overlap immediately.
func (s *store) ClearMember(ctx context.Context, tripID, userID string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trip_id = ? AND user_id = ?", tripID, userID).
			Delete(&models.Availability{}).Error; err != nil {
			return err
		}
		return tx.Where("trip_id = ? AND user_id = ?", tripID, userID).
			Delete(&models.AvailabilitySubmission{}).Error
	})
}
