package prep

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PrepStore { return &store{db: db} }

var Module = fx.Module("store.prep", fx.Provide(New))

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.PrepBlock, error) {
	var bs []models.PrepBlock
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("sort_order ASC, created_at ASC").Find(&bs).Error
	return bs, err
}

func (s *store) Create(ctx context.Context, b *models.PrepBlock) error {
	return s.db.WithContext(ctx).Create(b).Error
}

func (s *store) Get(ctx context.Context, tripID, id string) (*models.PrepBlock, error) {
	var b models.PrepBlock
	err := s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).First(&b).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *store) TripID(ctx context.Context, id string) (string, error) {
	var tripID string
	err := s.db.WithContext(ctx).Model(&models.PrepBlock{}).
		Where("id = ?", id).Pluck("trip_id", &tripID).Error
	if err != nil {
		return "", err
	}
	if tripID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return tripID, nil
}

func (s *store) Update(ctx context.Context, b *models.PrepBlock) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", b.ID, b.TripID).Save(b).Error
}

func (s *store) Delete(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).
		Delete(&models.PrepBlock{}).Error
}

// ReplaceGenerated swaps every system-generated block and leaves custom ones
// alone — regenerating the weather must never delete a note someone wrote.
func (s *store) ReplaceGenerated(ctx context.Context, tripID string, blocks []models.PrepBlock) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Where("trip_id = ? AND generated_by <> ?", tripID, models.CreatedByUser).
			Delete(&models.PrepBlock{}).Error; err != nil {
			return err
		}
		if len(blocks) == 0 {
			return nil
		}
		for i := range blocks {
			blocks[i].TripID = tripID
			blocks[i].ID = ""
		}
		return db.Create(&blocks).Error
	})
}
