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

func (s *store) query(ctx context.Context, tripID string, f models.ExpenseFilter) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&models.ExpenseEntry{}).Where("trip_id = ?", tripID)
	if f.DayID != "" {
		q = q.Where("day_id = ?", f.DayID)
	}
	if f.UserID != "" {
		q = q.Where("paid_by_user_id = ?", f.UserID)
	}
	if f.Split != "" {
		q = q.Where("split_type = ?", f.Split)
	}
	return q
}

func (s *store) ListByTrip(ctx context.Context, tripID string, f models.ExpenseFilter, limit, offset int) ([]models.ExpenseEntry, int64, error) {
	q := s.query(ctx, tripID, f)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var es []models.ExpenseEntry
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&es).Error
	return es, total, err
}

// AllByTrip feeds domain.ComputeExpenseSummary, which needs every row to work
// out who owes whom.
func (s *store) AllByTrip(ctx context.Context, tripID string) ([]models.ExpenseEntry, error) {
	var es []models.ExpenseEntry
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("created_at ASC").Find(&es).Error
	return es, err
}

func (s *store) Create(ctx context.Context, e *models.ExpenseEntry) error {
	return s.db.WithContext(ctx).Create(e).Error
}

func (s *store) Get(ctx context.Context, tripID, id string) (*models.ExpenseEntry, error) {
	var e models.ExpenseEntry
	err := s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).First(&e).Error
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *store) TripID(ctx context.Context, id string) (string, error) {
	var tripID string
	err := s.db.WithContext(ctx).Model(&models.ExpenseEntry{}).
		Where("id = ?", id).Pluck("trip_id", &tripID).Error
	if err != nil {
		return "", err
	}
	if tripID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return tripID, nil
}

func (s *store) Update(ctx context.Context, e *models.ExpenseEntry) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", e.ID, e.TripID).Save(e).Error
}

func (s *store) Delete(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		Delete(&models.ExpenseEntry{}).Error
}

// TotalHomeForUser sums what this user personally paid, converted with the FX
// rate that was snapshotted on each row — never a rate fetched today, or the
// number would drift every time the page is opened (A17.1).
func (s *store) TotalHomeForUser(ctx context.Context, userID string) (float64, error) {
	var total *float64
	err := s.db.WithContext(ctx).Model(&models.ExpenseEntry{}).
		Where("paid_by_user_id = ?", userID).
		Select("SUM(amount * COALESCE(fx_rate_snapshot, 1))").
		Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}
