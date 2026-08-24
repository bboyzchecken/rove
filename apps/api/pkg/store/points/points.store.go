// Package points holds the GORM implementation of the ROVE points ledger
// (§6.5). A balance is always a SUM, never a column.
package points

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PointsStore { return &store{db: db} }

var Module = fx.Module("store.points", fx.Provide(New))

func (s *store) Add(ctx context.Context, entry *models.UserPoints) error {
	if entry.OccurredAt.IsZero() {
		entry.OccurredAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(entry).Error
}

func (s *store) Balance(ctx context.Context, userID string) (int, error) {
	var total *int
	err := s.db.WithContext(ctx).
		Model(&models.UserPoints{}).
		Where("user_id = ?", userID).
		Select("SUM(delta)").
		Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

func (s *store) List(ctx context.Context, userID string, limit int) ([]models.UserPoints, error) {
	if limit <= 0 {
		limit = 20
	}
	var out []models.UserPoints
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

var _ = gorm.ErrRecordNotFound

// Earned sums the positive rows only (W11.2): what a creator has earned,
// regardless of what they have since spent.
func (s *store) Earned(ctx context.Context, userID string) (int, error) {
	var sum *int
	err := s.db.WithContext(ctx).
		Model(&models.UserPoints{}).
		Where("user_id = ? AND delta > 0", userID).
		Select("SUM(delta)").
		Scan(&sum).Error
	if err != nil || sum == nil {
		return 0, err
	}
	return *sum, nil
}
