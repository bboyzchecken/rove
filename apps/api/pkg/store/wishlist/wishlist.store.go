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

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.WishlistItem, error) {
	var ws []models.WishlistItem
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("member_id ASC, sort_order ASC").Find(&ws).Error
	return ws, err
}

func (s *store) Create(ctx context.Context, w *models.WishlistItem) error {
	return s.db.WithContext(ctx).Create(w).Error
}

func (s *store) Get(ctx context.Context, tripID, id string) (*models.WishlistItem, error) {
	var w models.WishlistItem
	err := s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		First(&w).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *store) Update(ctx context.Context, w *models.WishlistItem) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", w.ID, w.TripID).
		Save(w).Error
}

func (s *store) Delete(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		Delete(&models.WishlistItem{}).Error
}

// SaveCoverage writes only the four coverage columns, so a concurrent text edit
// by the wish's author is not clobbered by a recompute.
func (s *store) SaveCoverage(ctx context.Context, tripID string, updates []models.WishlistItem) error {
	if len(updates) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		for _, w := range updates {
			err := db.Model(&models.WishlistItem{}).
				Where("id = ? AND trip_id = ?", w.ID, tripID).
				Updates(map[string]any{
					"coverage":            w.Coverage,
					"covered_by_item_ids": w.CoveredByItemIDs,
					"coverage_note":       w.CoverageNote,
				}).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *store) NextSortOrder(ctx context.Context, tripID, memberID string) (int, error) {
	var max *int
	err := s.db.WithContext(ctx).Model(&models.WishlistItem{}).
		Where("trip_id = ? AND member_id = ?", tripID, memberID).
		Select("MAX(sort_order)").Scan(&max).Error
	if err != nil || max == nil {
		return 0, err
	}
	return *max + 1, nil
}

func (s *store) CountByTrip(ctx context.Context, tripID string) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.WishlistItem{}).
		Where("trip_id = ?", tripID).Count(&n).Error
	return n, err
}

// MembersWithItems answers "who still has not added a wish?" on the Overview
// tab (W3.4) with one query instead of one per member.
func (s *store) MembersWithItems(ctx context.Context, tripID string) ([]string, error) {
	var ids []string
	err := s.db.WithContext(ctx).Model(&models.WishlistItem{}).
		Where("trip_id = ?", tripID).
		Distinct().Pluck("member_id", &ids).Error
	return ids, err
}
