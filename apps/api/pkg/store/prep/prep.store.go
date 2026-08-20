// Package prep holds the GORM implementation of the shared checklist (M8).
package prep

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PrepStore { return &store{db: db} }

var Module = fx.Module("store.prep", fx.Provide(New))

func (s *store) Create(ctx context.Context, t *models.PrepTask) error {
	return s.db.WithContext(ctx).Create(t).Error
}

func (s *store) Get(ctx context.Context, tripID, taskID string) (*models.PrepTask, error) {
	var t models.PrepTask
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, taskID).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.PrepTask, error) {
	var out []models.PrepTask
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("done ASC, sort_order ASC, created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *store) Update(ctx context.Context, t *models.PrepTask) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", t.TripID, t.ID).Save(t).Error
}

func (s *store) Delete(ctx context.Context, tripID, taskID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, taskID).
		Delete(&models.PrepTask{}).Error
}

// CreateMany seeds the country template. Titles already on the list are
// skipped, so pressing "เติมรายการมาตรฐาน" twice is harmless.
func (s *store) CreateMany(ctx context.Context, tasks []models.PrepTask) error {
	if len(tasks) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tripID := tasks[0].TripID

		var existing []string
		if err := tx.Model(&models.PrepTask{}).
			Where("trip_id = ?", tripID).
			Pluck("title", &existing).Error; err != nil {
			return err
		}
		seen := make(map[string]bool, len(existing))
		for _, title := range existing {
			seen[title] = true
		}

		fresh := make([]models.PrepTask, 0, len(tasks))
		for _, task := range tasks {
			if seen[task.Title] {
				continue
			}
			fresh = append(fresh, task)
		}
		if len(fresh) == 0 {
			return nil
		}
		return tx.Create(&fresh).Error
	})
}

func (s *store) GetNote(ctx context.Context, tripID string) (*models.PrepNote, error) {
	var n models.PrepNote
	if err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).First(&n).Error; err != nil {
		return nil, err
	}
	return &n, nil
}

func (s *store) SaveNote(ctx context.Context, n *models.PrepNote) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "trip_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"body", "author", "updated_at"}),
	}).Create(n).Error
}
