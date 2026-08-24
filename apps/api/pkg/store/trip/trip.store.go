package trip

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TripStore { return &store{db: db} }

var Module = fx.Module("store.trip", fx.Provide(New))

func (s *store) Create(ctx context.Context, t *models.Trip) error {
	return s.db.WithContext(ctx).Create(t).Error
}

func (s *store) GetByID(ctx context.Context, tripID string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("id = ?", tripID).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// ListForUser only returns trips the user is actually a member of.
func (s *store) ListForUser(ctx context.Context, userID string, limit, offset int) ([]models.Trip, int64, error) {
	q := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Joins("JOIN trip_members tm ON tm.trip_id = trips.id").
		Where("tm.user_id = ?", userID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var trips []models.Trip
	err := q.Order("trips.updated_at DESC").Limit(limit).Offset(offset).Find(&trips).Error
	return trips, total, err
}

func (s *store) Update(ctx context.Context, t *models.Trip) error {
	return s.db.WithContext(ctx).Save(t).Error
}

func (s *store) Delete(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Where("id = ?", tripID).Delete(&models.Trip{}).Error
}

func (s *store) GetBySlug(ctx context.Context, slug string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("slug = ?", slug).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) GetByShareToken(ctx context.Context, token string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("share_token = ?", token).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// BumpViewCount increments in SQL rather than read-modify-write: two people
// opening a shared link at the same moment must not lose a view.
func (s *store) BumpViewCount(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ?", tripID).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

func (s *store) BumpCloneCount(ctx context.Context, tripID string) error {
	return s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ?", tripID).
		UpdateColumn("clone_count", gorm.Expr("clone_count + 1")).Error
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Trip{}).Count(&n).Error
	return n, err
}

/* ------------------------------------------------- public explore (M11) -- */

// ListPublic returns only trips their owners chose to publish. Sorting is a
// column sort, not a ranked feed — the points-weighted feed is a later story.
func (s *store) ListPublic(ctx context.Context, f models.ExploreFilter) ([]models.Trip, int64, error) {
	limit := f.Limit
	if limit <= 0 || limit > 50 {
		limit = 12
	}

	q := s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("visibility = ?", models.VisibilityPublic)

	if f.Country != "" {
		q = q.Where("destination_country = ?", f.Country)
	}
	if f.Query != "" {
		like := "%" + f.Query + "%"
		// destination_cities is a JSON array; LIKE over its text form is crude
		// but works identically on MySQL and the SQLite the tests run on.
		q = q.Where("title LIKE ? OR destination_cities LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	switch f.Sort {
	case "new":
		q = q.Order("updated_at DESC")
	default: // popular
		q = q.Order("(view_count + clone_count * 5) DESC").Order("updated_at DESC")
	}

	var out []models.Trip
	err := q.Limit(limit).Offset(f.Offset).Find(&out).Error
	return out, total, err
}

func (s *store) ListPublicByOwner(ctx context.Context, ownerID string) ([]models.Trip, error) {
	var out []models.Trip
	err := s.db.WithContext(ctx).
		Where("owner_id = ? AND visibility = ?", ownerID, models.VisibilityPublic).
		Order("updated_at DESC").
		Find(&out).Error
	return out, err
}
