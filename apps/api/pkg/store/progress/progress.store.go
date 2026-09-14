// Package progress holds the GORM implementation of trip step overrides
// (Feedback #2 — D-11 / D-12): the one checklist status a room cannot derive
// from its own tables, a deliberate "ไม่จำเป็น".
package progress

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TripStepStore { return &store{db: db} }

var Module = fx.Module("store.progress", fx.Provide(New))

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripStepOverride, error) {
	var out []models.TripStepOverride
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&out).Error
	return out, err
}

// Set upserts: skipping a step twice is one skip, not a conflict.
func (s *store) Set(ctx context.Context, o *models.TripStepOverride) error {
	if o.CreatedAt.IsZero() {
		o.CreatedAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "trip_id"}, {Name: "step"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "by_user_id", "created_at"}),
	}).Create(o).Error
}

func (s *store) Clear(ctx context.Context, tripID, step string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND step = ?", tripID, step).
		Delete(&models.TripStepOverride{}).Error
}
