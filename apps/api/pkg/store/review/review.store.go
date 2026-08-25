// Package review holds the GORM implementation of trip reviews (A11.5) — what
// people say after the trip, and what it actually cost them.
package review

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.ReviewStore { return &store{db: db} }

var Module = fx.Module("store.review", fx.Provide(New))

// Upsert replaces this member's review rather than adding a second one — the
// unique index on (trip_id, user_id) is what makes that a single round trip.
func (s *store) Upsert(ctx context.Context, r *models.TripReview) error {
	return s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "trip_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"rating", "actual_budget_per_person", "body", "updated_at"}),
		}).
		Create(r).Error
}

func (s *store) Get(ctx context.Context, tripID, userID string) (*models.TripReview, error) {
	var out models.TripReview
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		First(&out).Error
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripReview, error) {
	var out []models.TripReview
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Find(&out).Error
	return out, err
}

func (s *store) Delete(ctx context.Context, tripID, userID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Delete(&models.TripReview{}).Error
}

// SummaryByTrips rolls up a whole page of explore cards in one query.
//
// The budget average counts only the people who gave a number: averaging over
// everyone would quietly report a cheaper trip than anyone had.
func (s *store) SummaryByTrips(ctx context.Context, tripIDs []string) (map[string]models.ReviewSummary, error) {
	out := make(map[string]models.ReviewSummary, len(tripIDs))
	if len(tripIDs) == 0 {
		return out, nil
	}

	var rows []struct {
		TripID     string
		Count      int
		RatingSum  int
		BudgetSum  float64
		BudgetSaid int
	}
	err := s.db.WithContext(ctx).
		Model(&models.TripReview{}).
		Select(
			"trip_id AS trip_id",
			"COUNT(*) AS count",
			"SUM(rating) AS rating_sum",
			"SUM(actual_budget_per_person) AS budget_sum",
			"SUM(CASE WHEN actual_budget_per_person > 0 THEN 1 ELSE 0 END) AS budget_said",
		).
		Where("trip_id IN ?", tripIDs).
		Group("trip_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		summary := models.ReviewSummary{Count: row.Count, BudgetSaid: row.BudgetSaid}
		if row.Count > 0 {
			summary.AverageRating = float64(row.RatingSum) / float64(row.Count)
		}
		if row.BudgetSaid > 0 {
			summary.ActualBudgetPerPerson = row.BudgetSum / float64(row.BudgetSaid)
		}
		out[row.TripID] = summary
	}
	return out, nil
}
