package poi

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.POIStore { return &store{db: db} }

var Module = fx.Module("store.poi", fx.Provide(New))

func (s *store) Create(ctx context.Context, p *models.POI) error {
	return s.db.WithContext(ctx).Create(p).Error
}

func (s *store) GetByID(ctx context.Context, id string) (*models.POI, error) {
	var p models.POI
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// Search uses the FULLTEXT index in NATURAL LANGUAGE mode so a Thai, English or
// Japanese name all resolve to the same POI.
func (s *store) Search(ctx context.Context, q, city, area string, limit int) ([]models.POI, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	tx := s.db.WithContext(ctx).Model(&models.POI{}).Where("is_active = ?", true)
	if q != "" {
		tx = tx.Where("MATCH(name_th, name_en, name_ja) AGAINST (? IN NATURAL LANGUAGE MODE)", q)
	}
	if city != "" {
		tx = tx.Where("city = ?", city)
	}
	if area != "" {
		tx = tx.Where("area = ?", area)
	}

	var pois []models.POI
	err := tx.Order("quality_score DESC").Limit(limit).Find(&pois).Error
	return pois, err
}

// Upsert is what the CSV seeder (D0.2) and the Google Places enrichment (D0.4)
// both call, keyed on google_place_id when present.
func (s *store) Upsert(ctx context.Context, p *models.POI) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(p).Error
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.POI{}).Count(&n).Error
	return n, err
}

func (s *store) ListByIDs(ctx context.Context, ids []string) ([]models.POI, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var pois []models.POI
	err := s.db.WithContext(ctx).Where("id IN ?", ids).Find(&pois).Error
	return pois, err
}

func (s *store) GetByPlaceID(ctx context.Context, placeID string) (*models.POI, error) {
	var p models.POI
	err := s.db.WithContext(ctx).Where("google_place_id = ?", placeID).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) List(ctx context.Context, city, category string, limit, offset int) ([]models.POI, int64, error) {
	q := s.db.WithContext(ctx).Model(&models.POI{})
	if city != "" {
		q = q.Where("city = ?", city)
	}
	if category != "" {
		q = q.Where("category = ?", category)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var pois []models.POI
	err := q.Order("quality_score DESC, name_th ASC").Limit(limit).Offset(offset).Find(&pois).Error
	return pois, total, err
}

func (s *store) Update(ctx context.Context, p *models.POI) error {
	return s.db.WithContext(ctx).Save(p).Error
}
