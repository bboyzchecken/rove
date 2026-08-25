// Package plan holds the GORM implementation of the itinerary aggregate:
// plans, days, items and the version trail (A4.8 / A5.1).
package plan

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PlanStore { return &store{db: db} }

var Module = fx.Module("store.plan", fx.Provide(New))

/* ------------------------------------------------------------------ plan -- */

// EnsurePlan is idempotent: every trip has exactly one plan in Phase 1, and
// the first thing that needs it creates it.
func (s *store) EnsurePlan(ctx context.Context, tripID, userID string) (*models.Plan, error) {
	existing, err := s.GetPlan(ctx, tripID)
	if err == nil {
		return existing, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	p := &models.Plan{TripID: tripID, Label: "แพลนหลัก", IsFinal: true, CreatedBy: userID}
	if err := s.db.WithContext(ctx).Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func (s *store) GetPlan(ctx context.Context, tripID string) (*models.Plan, error) {
	var p models.Plan
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("is_final DESC, created_at ASC").
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) UpdatePlan(ctx context.Context, p *models.Plan) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", p.TripID, p.ID).Save(p).Error
}

// ReplaceDays swaps a whole itinerary atomically — an AI draft either lands
// completely or not at all (A4.8).
func (s *store) ReplaceDays(
	ctx context.Context,
	tripID string,
	days []models.PlanDay,
	items map[string][]models.PlanItem,
) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trip_id = ?", tripID).Delete(&models.PlanItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("trip_id = ?", tripID).Delete(&models.PlanDay{}).Error; err != nil {
			return err
		}
		if len(days) == 0 {
			return nil
		}
		if err := tx.Create(&days).Error; err != nil {
			return err
		}

		all := make([]models.PlanItem, 0)
		for _, day := range days {
			for i, item := range items[day.ID] {
				item.DayID = day.ID
				item.TripID = tripID
				item.SortOrder = i
				all = append(all, item)
			}
		}
		if len(all) == 0 {
			return nil
		}
		return tx.Create(&all).Error
	})
}

/* ------------------------------------------------------------------ days -- */

func (s *store) ListDays(ctx context.Context, tripID string) ([]models.PlanDay, error) {
	var out []models.PlanDay
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("day_index ASC").
		Find(&out).Error
	return out, err
}

func (s *store) GetDay(ctx context.Context, tripID, dayID string) (*models.PlanDay, error) {
	var d models.PlanDay
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, dayID).First(&d).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *store) UpdateDay(ctx context.Context, d *models.PlanDay) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", d.TripID, d.ID).Save(d).Error
}

/* ----------------------------------------------------------------- items -- */

func (s *store) ListItems(ctx context.Context, tripID string) ([]models.PlanItem, error) {
	var out []models.PlanItem
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("sort_order ASC, start_time ASC").
		Find(&out).Error
	return out, err
}

// CreateItem opens a gap at `index` and drops the item into it, so sort_order
// stays a dense sequence the editor can reason about.
func (s *store) CreateItem(ctx context.Context, item *models.PlanItem, index int) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if index < 0 {
			var count int64
			if err := tx.Model(&models.PlanItem{}).Where("day_id = ?", item.DayID).Count(&count).Error; err != nil {
				return err
			}
			index = int(count)
		}
		err := tx.Model(&models.PlanItem{}).
			Where("day_id = ? AND sort_order >= ?", item.DayID, index).
			UpdateColumn("sort_order", gorm.Expr("sort_order + 1")).Error
		if err != nil {
			return err
		}
		item.SortOrder = index
		return tx.Create(item).Error
	})
}

func (s *store) GetItem(ctx context.Context, tripID, itemID string) (*models.PlanItem, error) {
	var item models.PlanItem
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, itemID).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *store) UpdateItem(ctx context.Context, item *models.PlanItem) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", item.TripID, item.ID).
		Save(item).Error
}

// MoveItem closes the gap in the old day and opens one in the new day. Both
// halves are in the same transaction: a card that vanished from one day and
// never arrived in the other is the worst possible outcome of a drag.
func (s *store) MoveItem(ctx context.Context, tripID, itemID, toDayID string, toIndex int) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item models.PlanItem
		if err := tx.Where("trip_id = ? AND id = ?", tripID, itemID).First(&item).Error; err != nil {
			return err
		}

		if err := tx.Model(&models.PlanItem{}).
			Where("day_id = ? AND sort_order > ?", item.DayID, item.SortOrder).
			UpdateColumn("sort_order", gorm.Expr("sort_order - 1")).Error; err != nil {
			return err
		}

		if toIndex < 0 {
			toIndex = 0
		}
		if err := tx.Model(&models.PlanItem{}).
			Where("day_id = ? AND sort_order >= ?", toDayID, toIndex).
			UpdateColumn("sort_order", gorm.Expr("sort_order + 1")).Error; err != nil {
			return err
		}

		return tx.Model(&models.PlanItem{}).
			Where("trip_id = ? AND id = ?", tripID, itemID).
			Updates(map[string]any{"day_id": toDayID, "sort_order": toIndex}).Error
	})
}

func (s *store) DeleteItem(ctx context.Context, tripID, itemID string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item models.PlanItem
		if err := tx.Where("trip_id = ? AND id = ?", tripID, itemID).First(&item).Error; err != nil {
			return err
		}
		if err := tx.Where("trip_id = ? AND id = ?", tripID, itemID).
			Delete(&models.PlanItem{}).Error; err != nil {
			return err
		}
		return tx.Model(&models.PlanItem{}).
			Where("day_id = ? AND sort_order > ?", item.DayID, item.SortOrder).
			UpdateColumn("sort_order", gorm.Expr("sort_order - 1")).Error
	})
}

// SetWarnings rewrites the whole trip's warnings after a validation pass; an
// item missing from the map is explicitly cleared.
func (s *store) SetWarnings(ctx context.Context, tripID string, warnings map[string]string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.PlanItem{}).
			Where("trip_id = ?", tripID).
			UpdateColumn("warning", "").Error; err != nil {
			return err
		}
		for itemID, warning := range warnings {
			if warning == "" {
				continue
			}
			if err := tx.Model(&models.PlanItem{}).
				Where("trip_id = ? AND id = ?", tripID, itemID).
				UpdateColumn("warning", warning).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

/* -------------------------------------------------------------- versions -- */

func (s *store) AddVersion(ctx context.Context, v *models.ItemVersion) error {
	return s.db.WithContext(ctx).Create(v).Error
}

func (s *store) LatestVersion(ctx context.Context, tripID, itemID string) (*models.ItemVersion, error) {
	var v models.ItemVersion
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND item_id = ?", tripID, itemID).
		Order("created_at DESC").
		First(&v).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *store) ListVersions(ctx context.Context, tripID string, limit int) ([]models.ItemVersion, error) {
	if limit <= 0 {
		limit = 20
	}
	var out []models.ItemVersion
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

func (s *store) DeleteVersion(ctx context.Context, tripID, versionID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, versionID).
		Delete(&models.ItemVersion{}).Error
}

/* ------------------------------------------------------ variants (M6) ---- */

func (s *store) CreateVariant(ctx context.Context, v *models.PlanVariant) error {
	return s.db.WithContext(ctx).Create(v).Error
}

func (s *store) GetVariant(ctx context.Context, tripID, variantID string) (*models.PlanVariant, error) {
	var v models.PlanVariant
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, variantID).
		First(&v).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *store) ListVariants(ctx context.Context, tripID string) ([]models.PlanVariant, error) {
	var out []models.PlanVariant
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *store) DeleteVariant(ctx context.Context, tripID, variantID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, variantID).
		Delete(&models.PlanVariant{}).Error
}

var _ = time.Now

/* -------------------------------------------------- match signals (A11.3) -- */

// TagSignals reads what a plan is *about* — where it goes and what kind of
// stops it makes — for every trip in one query.
//
// Only public plan content is used: areas, and the category and tags of the POI
// behind a stop. Wishlists are personal and stay out of it, even in aggregate.
func (s *store) TagSignals(ctx context.Context, tripIDs []string) (map[string][]string, error) {
	out := make(map[string][]string, len(tripIDs))
	if len(tripIDs) == 0 {
		return out, nil
	}

	var rows []struct {
		TripID   string
		Area     string
		Category string
		Tags     []byte
	}
	err := s.db.WithContext(ctx).
		Table("plan_items AS pi").
		Select("pi.trip_id AS trip_id, pi.area AS area, p.category AS category, p.tags AS tags").
		Joins("LEFT JOIN pois p ON p.id = pi.poi_id").
		Where("pi.trip_id IN ?", tripIDs).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	seen := map[string]map[string]bool{}
	add := func(tripID, tag string) {
		if tag = strings.TrimSpace(tag); tag == "" {
			return
		}
		if seen[tripID] == nil {
			seen[tripID] = map[string]bool{}
		}
		key := strings.ToLower(tag)
		if seen[tripID][key] {
			return
		}
		seen[tripID][key] = true
		out[tripID] = append(out[tripID], tag)
	}

	for _, row := range rows {
		add(row.TripID, row.Area)
		add(row.TripID, row.Category)

		var tags []string
		if len(row.Tags) > 0 && json.Unmarshal(row.Tags, &tags) == nil {
			for _, tag := range tags {
				add(row.TripID, tag)
			}
		}
	}

	return out, nil
}
