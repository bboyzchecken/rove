// Package media holds the GORM implementations behind the Photos tab (M18)
// and the Documents tab (M19). One package, two stores: they are the same
// kind of thing — rows that point at bytes in a bucket.
package media

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

/* ---------------------------------------------------------------- photos -- */

type photoStore struct{ db *gorm.DB }

func NewPhotoStore(db *gorm.DB) models.PhotoStore { return &photoStore{db: db} }

func (s *photoStore) Create(ctx context.Context, p *models.TripPhoto) error {
	return s.db.WithContext(ctx).Create(p).Error
}

func (s *photoStore) Get(ctx context.Context, tripID, photoID string) (*models.TripPhoto, error) {
	var p models.TripPhoto
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, photoID).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *photoStore) ListByTrip(ctx context.Context, tripID string, f models.PhotoFilter) ([]models.TripPhoto, error) {
	q := s.db.WithContext(ctx).Where("trip_id = ?", tripID)
	if f.DayID != "" {
		q = q.Where("day_id = ?", f.DayID)
	}
	if f.ItemID != "" {
		q = q.Where("item_id = ?", f.ItemID)
	}
	if f.UserID != "" {
		q = q.Where("user_id = ?", f.UserID)
	}
	var out []models.TripPhoto
	err := q.Order("sort_order ASC, created_at ASC").Find(&out).Error
	return out, err
}

func (s *photoStore) Delete(ctx context.Context, tripID, photoID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, photoID).
		Delete(&models.TripPhoto{}).Error
}

func (s *photoStore) CountByTrip(ctx context.Context, tripID string) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.TripPhoto{}).
		Where("trip_id = ?", tripID).
		Count(&n).Error
	return n, err
}

/* ------------------------------------------------------------- documents -- */

type documentStore struct{ db *gorm.DB }

func NewDocumentStore(db *gorm.DB) models.DocumentStore { return &documentStore{db: db} }

func (s *documentStore) Create(ctx context.Context, d *models.TripDocument) error {
	return s.db.WithContext(ctx).Create(d).Error
}

func (s *documentStore) Get(ctx context.Context, tripID, docID string) (*models.TripDocument, error) {
	var d models.TripDocument
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, docID).
		First(&d).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *documentStore) ListByTrip(ctx context.Context, tripID string) ([]models.TripDocument, error) {
	var out []models.TripDocument
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Find(&out).Error
	return out, err
}

func (s *documentStore) Delete(ctx context.Context, tripID, docID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, docID).
		Delete(&models.TripDocument{}).Error
}

var Module = fx.Module("store.media", fx.Provide(NewPhotoStore, NewDocumentStore))
