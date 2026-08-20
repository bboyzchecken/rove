package invite

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.InviteStore { return &store{db: db} }

var Module = fx.Module("store.invite", fx.Provide(New))

func (s *store) Create(ctx context.Context, i *models.TripInvite) error {
	return s.db.WithContext(ctx).Create(i).Error
}

// GetByToken is the deliberate exception to the tripID-scoping rule: the caller
// is not a member yet, and the random token is the capability.
func (s *store) GetByToken(ctx context.Context, token string) (*models.TripInvite, error) {
	var i models.TripInvite
	if err := s.db.WithContext(ctx).Where("token = ?", token).First(&i).Error; err != nil {
		return nil, err
	}
	return &i, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripInvite, error) {
	var is []models.TripInvite
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("created_at DESC").Find(&is).Error
	return is, err
}

func (s *store) MarkUsed(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Model(&models.TripInvite{}).
		Where("id = ?", id).
		UpdateColumn("used_count", gorm.Expr("used_count + 1")).Error
}

func (s *store) Revoke(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		Delete(&models.TripInvite{}).Error
}
