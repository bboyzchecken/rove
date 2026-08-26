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

// ListPage is List with a cursor (A23.1).
//
// Ordering is (occurred_at, id) descending on both the ORDER BY and the WHERE,
// so the page boundary and the sort agree. `(a, b) < (x, y)` is written out
// rather than as a row-value comparison because SQLite — which the tests run
// on — does not optimise the tuple form the way MySQL does.
func (s *store) ListPage(
	ctx context.Context,
	userID string,
	before *models.PointsCursor,
	limit int,
) ([]models.UserPoints, bool, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	q := s.db.WithContext(ctx).Where("user_id = ?", userID)
	if before != nil {
		q = q.Where(
			"(occurred_at < ?) OR (occurred_at = ? AND id < ?)",
			before.OccurredAt, before.OccurredAt, before.ID,
		)
	}

	var rows []models.UserPoints
	// One row past the page: enough to answer "is there more" without counting
	// a table that only ever grows.
	err := q.Order("occurred_at DESC").Order("id DESC").Limit(limit + 1).Find(&rows).Error
	if err != nil {
		return nil, false, err
	}

	if len(rows) > limit {
		return rows[:limit], true, nil
	}
	return rows, false, nil
}

var _ = gorm.ErrRecordNotFound

// EarnedByTrip groups one reason's awards by the trip that caused them
// (A23.2). Rows with no trip are dropped rather than bucketed under "": the
// question this answers is "which of my plans earned this", and a row with no
// plan has no answer.
func (s *store) EarnedByTrip(ctx context.Context, userID, reason string) (map[string]models.PointsByTrip, error) {
	var rows []struct {
		TripID string
		Count  int
		Points int
	}
	err := s.db.WithContext(ctx).
		Model(&models.UserPoints{}).
		Select("trip_id AS trip_id", "COUNT(*) AS count", "SUM(delta) AS points").
		Where("user_id = ? AND reason = ? AND trip_id IS NOT NULL", userID, reason).
		Group("trip_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make(map[string]models.PointsByTrip, len(rows))
	for _, row := range rows {
		out[row.TripID] = models.PointsByTrip{Count: row.Count, Points: row.Points}
	}
	return out, nil
}

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
