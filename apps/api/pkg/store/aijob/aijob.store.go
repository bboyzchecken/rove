// Package aijob holds the GORM implementation of AI jobs and the per-trip
// draft meter (M4 — A4.9, §16).
package aijob

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.AIJobStore { return &store{db: db} }

var Module = fx.Module("store.aijob", fx.Provide(New))

func (s *store) Create(ctx context.Context, j *models.AIJob) error {
	return s.db.WithContext(ctx).Create(j).Error
}

func (s *store) Get(ctx context.Context, tripID, jobID string) (*models.AIJob, error) {
	var j models.AIJob
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, jobID).First(&j).Error
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *store) Update(ctx context.Context, j *models.AIJob) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", j.TripID, j.ID).Save(j).Error
}

func (s *store) ListByTrip(ctx context.Context, tripID string, limit int) ([]models.AIJob, error) {
	if limit <= 0 {
		limit = 10
	}
	var out []models.AIJob
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// CostSince backs the daily spend cap (A4.11). A model that can be asked to
// think for a minute needs a ceiling that is checked before the call, not
// discovered on the invoice.
func (s *store) CostSince(ctx context.Context, since time.Time) (float64, error) {
	var total *float64
	err := s.db.WithContext(ctx).
		Model(&models.AIJob{}).
		Where("created_at >= ?", since).
		Select("SUM(cost_usd)").
		Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

/* --------------------------------------------------------------- credits -- */

// Credits is create-on-read: every trip is entitled to its included drafts,
// and the row appearing is not a business event worth its own migration.
func (s *store) Credits(ctx context.Context, tripID string) (*models.AICredit, error) {
	var c models.AICredit
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).First(&c).Error
	if err == nil {
		return &c, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	c = models.AICredit{TripID: tripID, Included: models.DefaultIncludedDrafts}
	if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *store) SaveCredits(ctx context.Context, c *models.AICredit) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(c).Error
}
