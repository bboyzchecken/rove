package aijob

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.AIJobStore { return &store{db: db} }

var Module = fx.Module("store.aijob", fx.Provide(New))

func (s *store) Create(ctx context.Context, j *models.AIJob) error {
	return s.db.WithContext(ctx).Create(j).Error
}

// Get is not scoped by trip because the worker looks jobs up by id alone; the
// HTTP handler checks trip membership against the returned job.TripID before
// returning anything.
func (s *store) Get(ctx context.Context, id string) (*models.AIJob, error) {
	var j models.AIJob
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&j).Error; err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *store) Update(ctx context.Context, j *models.AIJob) error {
	return s.db.WithContext(ctx).Save(j).Error
}

func (s *store) SetStep(ctx context.Context, id, step string) error {
	return s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("id = ?", id).
		Updates(map[string]any{"step": step, "status": models.JobRunning}).Error
}

func (s *store) Fail(ctx context.Context, id, message string) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":      models.JobError,
			"error":       message,
			"finished_at": now,
		}).Error
}

// CostSince is read before every generate to enforce the per-trip daily cap
// (A4.11) — the guard that stops one runaway trip burning the AI budget.
func (s *store) CostSince(ctx context.Context, tripID string, since time.Time) (float64, error) {
	var total *float64
	err := s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("trip_id = ? AND created_at >= ?", tripID, since).
		Select("SUM(cost_usd)").Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

func (s *store) CountSince(ctx context.Context, tripID string, since time.Time) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("trip_id = ? AND created_at >= ?", tripID, since).Count(&n).Error
	return n, err
}

func (s *store) TotalCostSince(ctx context.Context, since time.Time) (float64, error) {
	var total *float64
	err := s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("created_at >= ?", since).
		Select("SUM(cost_usd)").Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}
