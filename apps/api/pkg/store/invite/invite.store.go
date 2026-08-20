// Package invite holds the GORM implementation of invite links (A2.2) and the
// private dream list (M15 — A15.2), both of which are single-table stores.
package invite

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.InviteStore { return &store{db: db} }

var Module = fx.Module("store.invite", fx.Provide(New))

func (s *store) Create(ctx context.Context, i *models.Invite) error {
	return s.db.WithContext(ctx).Create(i).Error
}

// GetByToken is looked up by token alone: the token *is* the capability, and
// the caller is by definition not yet a member of the trip.
func (s *store) GetByToken(ctx context.Context, token string) (*models.Invite, error) {
	var i models.Invite
	if err := s.db.WithContext(ctx).Where("token = ?", token).First(&i).Error; err != nil {
		return nil, err
	}
	return &i, nil
}

func (s *store) MarkUsed(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Model(&models.Invite{}).
		Where("id = ?", id).
		UpdateColumn("used_count", gorm.Expr("used_count + 1")).Error
}

func (s *store) Revoke(ctx context.Context, tripID, id string) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.Invite{}).
		Where("trip_id = ? AND id = ?", tripID, id).
		Update("revoked_at", now).Error
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.Invite, error) {
	var out []models.Invite
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Find(&out).Error
	return out, err
}

/* ---------------------------------------------------------------- dreams -- */

type dreamStore struct{ db *gorm.DB }

func NewDreamStore(db *gorm.DB) models.DreamStore { return &dreamStore{db: db} }

var DreamModule = fx.Module("store.dream", fx.Provide(NewDreamStore))

func (s *dreamStore) Create(ctx context.Context, d *models.DreamItem) error {
	return s.db.WithContext(ctx).Create(d).Error
}

func (s *dreamStore) ListByUser(ctx context.Context, userID string) ([]models.DreamItem, error) {
	var out []models.DreamItem
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("sort_order ASC, created_at DESC").
		Find(&out).Error
	return out, err
}

func (s *dreamStore) Update(ctx context.Context, d *models.DreamItem) error {
	return s.db.WithContext(ctx).Where("user_id = ? AND id = ?", d.UserID, d.ID).Save(d).Error
}

func (s *dreamStore) Delete(ctx context.Context, userID, dreamID string) error {
	return s.db.WithContext(ctx).
		Where("user_id = ? AND id = ?", userID, dreamID).
		Delete(&models.DreamItem{}).Error
}
