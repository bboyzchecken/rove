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

// SetCoverage writes every recomputed row in ONE statement. Coverage is derived
// from the plan, so it is rewritten wholesale after each plan change rather
// than patched item by item.
//
// It used to be a transaction with one UPDATE per wish, which meant a trip with
// thirty wishes cost thirty round trips every time anyone touched the plan. A
// CASE over the id collapses that into a single trip to the server; the
// expression form is portable, so the SQLite the handler tests run on takes it
// unchanged.
func (s *store) SetCoverage(ctx context.Context, tripID string, states map[string]models.CoverageWrite) error {
	if len(states) == 0 {
		return nil
	}

	ids := make([]string, 0, len(states))
	coverageCase := "CASE id"
	itemCase := "CASE id"
	args := make([]any, 0, len(states)*4)
	itemArgs := make([]any, 0, len(states)*2)

	for wishID, state := range states {
		ids = append(ids, wishID)
		coverageCase += " WHEN ? THEN ?"
		args = append(args, wishID, state.Coverage)
		itemCase += " WHEN ? THEN ?"
		itemArgs = append(itemArgs, wishID, state.ItemID)
	}
	coverageCase += " END"
	itemCase += " END"

	return s.db.WithContext(ctx).
		Model(&models.WishlistItem{}).
		Where("trip_id = ? AND id IN ?", tripID, ids).
		UpdateColumns(map[string]any{
			"coverage": gorm.Expr(coverageCase, args...),
			"item_id":  gorm.Expr(itemCase, itemArgs...),
		}).Error
}
