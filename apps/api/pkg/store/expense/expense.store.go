// Package expense holds the GORM implementation of real spending (M16 — A16.3).
package expense

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.ExpenseStore { return &store{db: db} }

var Module = fx.Module("store.expense", fx.Provide(New))

func (s *store) Create(ctx context.Context, e *models.ExpenseEntry) error {
	return s.db.WithContext(ctx).Create(e).Error
}

func (s *store) Get(ctx context.Context, tripID, expenseID string) (*models.ExpenseEntry, error) {
	var e models.ExpenseEntry
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, expenseID).First(&e).Error
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.ExpenseEntry, error) {
	var out []models.ExpenseEntry
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("date DESC, created_at DESC").
		Find(&out).Error
	return out, err
}

func (s *store) Update(ctx context.Context, e *models.ExpenseEntry) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", e.TripID, e.ID).Save(e).Error
}

func (s *store) Delete(ctx context.Context, tripID, expenseID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, expenseID).
		Delete(&models.ExpenseEntry{}).Error
}

func (s *store) AddSettlement(ctx context.Context, st *models.Settlement) error {
	return s.db.WithContext(ctx).Create(st).Error
}

func (s *store) ListSettlements(ctx context.Context, tripID string) ([]models.Settlement, error) {
	var out []models.Settlement
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&out).Error
	return out, err
}
