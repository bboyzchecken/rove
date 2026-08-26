// Package review holds the GORM implementation of trip reviews (A11.5) — what
// people say after the trip, and what it actually cost them.
package review

import (
	"context"
	"math"
	"time"

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

/* --------------------------------------------- platform social proof (M24) */

// Platform is the whole catalogue in one row (A24.1). No filter by visibility:
// the number being reported is "how many people reviewed a trip they took",
// and a private trip's review is still that.
func (s *store) Platform(ctx context.Context) (models.PlatformReviews, error) {
	var row struct {
		Count     int64
		RatingSum int64
	}
	err := s.db.WithContext(ctx).
		Model(&models.TripReview{}).
		Select("COUNT(*) AS count", "COALESCE(SUM(rating), 0) AS rating_sum").
		Scan(&row).Error
	if err != nil {
		return models.PlatformReviews{}, err
	}

	out := models.PlatformReviews{Count: row.Count}
	if row.Count > 0 {
		out.AverageRating = math.Round(float64(row.RatingSum)/float64(row.Count)*10) / 10
	}
	return out, nil
}

// ListRecentPublic joins the three tables a quotable review needs (A24.2).
//
// Two filters carry the whole rule: the trip must be published, and the review
// must actually say something. A five-star rating with an empty body is a
// number the summary already counts — printing it as a testimonial would be
// putting words in somebody's mouth.
func (s *store) ListRecentPublic(ctx context.Context, limit int) ([]models.PublicReview, error) {
	if limit <= 0 || limit > 50 {
		limit = 12
	}

	var rows []struct {
		TripID                string
		TripTitle             string
		TripSlug              *string
		Country               string
		Rating                int
		Body                  string
		ActualBudgetPerPerson float64
		Name                  string
		CharacterID           *string
		CreatedAt             time.Time
	}

	err := s.db.WithContext(ctx).
		Model(&models.TripReview{}).
		Select(
			"trip_reviews.trip_id AS trip_id",
			"trips.title AS trip_title",
			"trips.slug AS trip_slug",
			"trips.destination_country AS country",
			"trip_reviews.rating AS rating",
			"trip_reviews.body AS body",
			"trip_reviews.actual_budget_per_person AS actual_budget_per_person",
			"users.display_name AS name",
			"users.character_id AS character_id",
			"trip_reviews.created_at AS created_at",
		).
		Joins("JOIN trips ON trips.id = trip_reviews.trip_id").
		Joins("JOIN users ON users.id = trip_reviews.user_id").
		Where("trips.visibility = ?", models.VisibilityPublic).
		Where("trip_reviews.body <> ''").
		Where("users.status = ?", models.UserStatusActive).
		Order("trip_reviews.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]models.PublicReview, 0, len(rows))
	for _, row := range rows {
		review := models.PublicReview{
			TripID:                row.TripID,
			TripTitle:             row.TripTitle,
			Country:               row.Country,
			Rating:                row.Rating,
			Body:                  row.Body,
			ActualBudgetPerPerson: row.ActualBudgetPerPerson,
			Name:                  row.Name,
			CharacterID:           "shiba",
			CreatedAt:             row.CreatedAt.UTC().Format(time.RFC3339),
		}
		if row.TripSlug != nil {
			review.TripSlug = *row.TripSlug
		}
		if row.CharacterID != nil && *row.CharacterID != "" {
			review.CharacterID = *row.CharacterID
		}
		out = append(out, review)
	}
	return out, nil
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
