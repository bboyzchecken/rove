// Package wishlist holds the GORM implementation of the wishlist (A3.2) and
// the coverage write-back (A3.5).
package wishlist

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.WishlistStore { return &store{db: db} }

var Module = fx.Module("store.wishlist", fx.Provide(New))

func (s *store) Create(ctx context.Context, w *models.WishlistItem) error {
	return s.db.WithContext(ctx).Create(w).Error
}

func (s *store) Get(ctx context.Context, tripID, wishID string) (*models.WishlistItem, error) {
	var w models.WishlistItem
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, wishID).
		First(&w).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.WishlistItem, error) {
	var out []models.WishlistItem
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("sort_order ASC, created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *store) Update(ctx context.Context, w *models.WishlistItem) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", w.TripID, w.ID).
		Save(w).Error
}

func (s *store) Delete(ctx context.Context, tripID, wishID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, wishID).
		Delete(&models.WishlistItem{}).Error
}

// SetCoverage writes every recomputed row in one transaction. Coverage is
// derived from the plan, so it is rewritten wholesale after each plan change
// rather than patched item by item.
func (s *store) SetCoverage(ctx context.Context, tripID string, states map[string]models.CoverageWrite) error {
	if len(states) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for wishID, state := range states {
			err := tx.Model(&models.WishlistItem{}).
				Where("trip_id = ? AND id = ?", tripID, wishID).
				Updates(map[string]any{"coverage": state.Coverage, "item_id": state.ItemID}).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
}
