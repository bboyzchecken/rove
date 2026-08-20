package item

import (
	"context"
	"encoding/json"

	"go.uber.org/fx"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.ItemStore { return &store{db: db} }

var Module = fx.Module("store.item", fx.Provide(New))

// Sort order is a dense 0..n-1 sequence per day, renumbered on every move.
// A plan day holds ~10 items, so renumbering costs nothing and removes the
// whole class of "fractional index ran out of precision" bugs.
const sortStep = 1

func snapshot(db *gorm.DB, it *models.Item, actorID, source string) error {
	raw, err := json.Marshal(it)
	if err != nil {
		return err
	}
	return db.Create(&models.ItemVersion{
		ItemID:       it.ID,
		PlanID:       it.PlanID,
		Snapshot:     datatypes.JSON(raw),
		ChangedBy:    actorID,
		ChangeSource: source,
	}).Error
}

func (s *store) Create(ctx context.Context, planID string, it *models.Item) error {
	it.PlanID = planID
	return s.db.WithContext(ctx).Create(it).Error
}

func (s *store) Get(ctx context.Context, planID, itemID string) (*models.Item, error) {
	var it models.Item
	err := s.db.WithContext(ctx).
		Where("id = ? AND plan_id = ?", itemID, planID).
		First(&it).Error
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// PlanID resolves the owning plan for an /items/:itemId route. Like
// PlanStore.GetTripID it returns only the id, never content.
func (s *store) PlanID(ctx context.Context, itemID string) (string, error) {
	var planID string
	err := s.db.WithContext(ctx).Model(&models.Item{}).
		Where("id = ?", itemID).
		Pluck("plan_id", &planID).Error
	if err != nil {
		return "", err
	}
	if planID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return planID, nil
}

// Update snapshots the row as it was BEFORE the change, so Undo restores the
// previous state rather than the state being written.
func (s *store) Update(ctx context.Context, planID string, it *models.Item, actorID, source string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var before models.Item
		if err := db.Where("id = ? AND plan_id = ?", it.ID, planID).First(&before).Error; err != nil {
			return err
		}
		if err := snapshot(db, &before, actorID, source); err != nil {
			return err
		}
		it.PlanID = planID
		return db.Where("id = ? AND plan_id = ?", it.ID, planID).Save(it).Error
	})
}

// Move relocates an item within or across days and renumbers both days.
func (s *store) Move(ctx context.Context, planID, itemID, dayID string, position int, actorID string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var it models.Item
		if err := db.Where("id = ? AND plan_id = ?", itemID, planID).First(&it).Error; err != nil {
			return err
		}
		if err := snapshot(db, &it, actorID, models.CreatedByUser); err != nil {
			return err
		}

		// The target day must belong to the same plan — this is what stops a
		// move from smuggling an item into another trip's plan.
		var dayCount int64
		if err := db.Model(&models.Day{}).
			Where("id = ? AND plan_id = ?", dayID, planID).
			Count(&dayCount).Error; err != nil {
			return err
		}
		if dayCount == 0 {
			return gorm.ErrRecordNotFound
		}

		fromDay := it.DayID
		if err := db.Model(&models.Item{}).
			Where("id = ? AND plan_id = ?", itemID, planID).
			Updates(map[string]any{"day_id": dayID, "sort_order": -1}).Error; err != nil {
			return err
		}

		if err := renumber(db, planID, dayID, itemID, position); err != nil {
			return err
		}
		if fromDay != dayID {
			return renumber(db, planID, fromDay, "", -1)
		}
		return nil
	})
}

// renumber rewrites sort_order for one day as a dense sequence, inserting
// moved (if given) at position.
func renumber(db *gorm.DB, planID, dayID, moved string, position int) error {
	var items []models.Item
	err := db.Where("plan_id = ? AND day_id = ?", planID, dayID).
		Order("sort_order ASC, created_at ASC").
		Find(&items).Error
	if err != nil {
		return err
	}

	ordered := make([]string, 0, len(items))
	for _, it := range items {
		if it.ID != moved {
			ordered = append(ordered, it.ID)
		}
	}
	if moved != "" {
		if position < 0 || position > len(ordered) {
			position = len(ordered)
		}
		ordered = append(ordered[:position], append([]string{moved}, ordered[position:]...)...)
	}

	for i, id := range ordered {
		if err := db.Model(&models.Item{}).
			Where("id = ? AND plan_id = ?", id, planID).
			Update("sort_order", i*sortStep).Error; err != nil {
			return err
		}
	}
	return nil
}

// Delete snapshots first so Undo can bring the item back.
func (s *store) Delete(ctx context.Context, planID, itemID, actorID string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var it models.Item
		if err := db.Where("id = ? AND plan_id = ?", itemID, planID).First(&it).Error; err != nil {
			return err
		}
		if err := snapshot(db, &it, actorID, models.CreatedByUser); err != nil {
			return err
		}
		if err := db.Where("id = ? AND plan_id = ?", itemID, planID).
			Delete(&models.Item{}).Error; err != nil {
			return err
		}
		return renumber(db, planID, it.DayID, "", -1)
	})
}

// Undo pops the most recent snapshot and writes it back, re-creating the row if
// it was deleted. Consuming the snapshot makes repeated undos walk backwards.
func (s *store) Undo(ctx context.Context, planID, itemID, actorID string) (*models.Item, error) {
	var restored models.Item
	err := s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var v models.ItemVersion
		err := db.Where("item_id = ? AND plan_id = ?", itemID, planID).
			Order("created_at DESC").First(&v).Error
		if err != nil {
			return err
		}
		if err := json.Unmarshal(v.Snapshot, &restored); err != nil {
			return err
		}
		restored.PlanID = planID

		// Save() inserts when the row is gone and updates when it is not, which
		// covers undo-of-delete and undo-of-edit with one path.
		if err := db.Save(&restored).Error; err != nil {
			return err
		}
		if err := db.Where("id = ?", v.ID).Delete(&models.ItemVersion{}).Error; err != nil {
			return err
		}
		return renumber(db, planID, restored.DayID, restored.ID, restored.SortOrder)
	})
	if err != nil {
		return nil, err
	}
	return &restored, nil
}

func (s *store) NextSortOrder(ctx context.Context, dayID string) (int, error) {
	var max *int
	err := s.db.WithContext(ctx).Model(&models.Item{}).
		Where("day_id = ?", dayID).
		Select("MAX(sort_order)").Scan(&max).Error
	if err != nil || max == nil {
		return 0, err
	}
	return *max + sortStep, nil
}

// SnapshotPlan versions every item at once — the "save a checkpoint" button
// (W5.7), separate from the automatic per-edit snapshots.
func (s *store) SnapshotPlan(ctx context.Context, planID, actorID string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var items []models.Item
		if err := db.Where("plan_id = ?", planID).Find(&items).Error; err != nil {
			return err
		}
		for i := range items {
			if err := snapshot(db, &items[i], actorID, models.CreatedByUser); err != nil {
				return err
			}
		}
		return nil
	})
}
