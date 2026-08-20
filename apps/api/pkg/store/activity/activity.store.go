package activity

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

type activityStore struct{ db *gorm.DB }

func New(db *gorm.DB) models.ActivityStore { return &activityStore{db: db} }

var Module = fx.Module("store.activity", fx.Provide(New))

func (s *activityStore) Log(ctx context.Context, a *models.ActivityLog) error {
	return s.db.WithContext(ctx).Create(a).Error
}

func (s *activityStore) List(ctx context.Context, tripID, cursor string, limit int) ([]models.ActivityLog, error) {
	var as []models.ActivityLog
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Scopes(store.CursorPaginate("created_at", cursor, limit)).
		Find(&as).Error
	return as, err
}
