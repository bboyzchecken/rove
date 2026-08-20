package profile

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.ProfileStore { return &store{db: db} }

var Module = fx.Module("store.profile", fx.Provide(New))

// Get returns an empty profile with sensible defaults rather than an error:
// "not filled in yet" is the normal state for most members.
func (s *store) Get(ctx context.Context, tripID, userID string) (*models.MemberProfile, error) {
	var p models.MemberProfile
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		First(&p).Error
	if err == gorm.ErrRecordNotFound {
		return &models.MemberProfile{
			TripID: tripID, UserID: userID,
			Pace: models.PaceNormal, WalkLevel: 3,
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.MemberProfile, error) {
	var ps []models.MemberProfile
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&ps).Error
	return ps, err
}

func (s *store) Upsert(ctx context.Context, p *models.MemberProfile) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "trip_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"visited_before", "pace", "walk_level", "can_drive", "has_idp",
			"budget_min", "budget_max", "dietary", "traveling_with", "notes",
		}),
	}).Create(p).Error
}
