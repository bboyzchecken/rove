package trip

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
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
		Where("tm.user_id = ? AND trips.archived_at IS NULL", userID)

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
	if err := s.db.WithContext(ctx).Where("slug = ? AND archived_at IS NULL", slug).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) GetByShareToken(ctx context.Context, token string) (*models.Trip, error) {
	var t models.Trip
	if err := s.db.WithContext(ctx).Where("share_token = ? AND archived_at IS NULL", token).First(&t).Error; err != nil {
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

// BumpDailyView upserts today's row — the same "never read first" rule as the
// lifetime counter, with the day as part of the key.
func (s *store) BumpDailyView(ctx context.Context, tripID string, day time.Time) error {
	row := models.TripViewDaily{TripID: tripID, Day: domain.Day(day), Views: 1}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "trip_id"}, {Name: "day"}},
		DoUpdates: clause.Assignments(map[string]any{"views": gorm.Expr("views + 1")}),
	}).Create(&row).Error
}

func (s *store) HasViewsSince(ctx context.Context, since time.Time) (bool, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.TripViewDaily{}).
		Where("day >= ?", domain.Day(since)).
		Limit(1).
		Count(&n).Error
	return n > 0, err
}

func (s *store) PublicCountryCounts(ctx context.Context) ([]models.CountryCount, error) {
	var out []models.CountryCount
	err := s.db.WithContext(ctx).Model(&models.Trip{}).
		Select("destination_country AS code, COUNT(*) AS count").
		Where("visibility = ? AND destination_country <> ''", models.VisibilityPublic).
		Group("destination_country").
		Order("count DESC").
		Scan(&out).Error
	return out, err
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Trip{}).Count(&n).Error
	return n, err
}

// TitlesByIDs hydrates a ledger page's trip names in one query (A23.1). Only
// two columns leave the database: this is called on rows the caller has no
// membership check for, and a title is the most a ledger line needs.
func (s *store) TitlesByIDs(ctx context.Context, ids []string) (map[string]string, error) {
	out := make(map[string]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	var rows []struct {
		ID    string
		Title string
	}
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Select("id", "title").
		Where("id IN ?", ids).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = row.Title
	}
	return out, nil
}

func (s *store) LatestOwnedColor(ctx context.Context, userID string) (string, error) {
	var colors []string
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Where("owner_id = ?", userID).
		Order("created_at DESC").
		Limit(1).
		Pluck("color", &colors).Error
	if err != nil || len(colors) == 0 {
		return "", err
	}
	return colors[0], nil
}

/* ---------------------------------------------- platform totals (A24.1) -- */

func (s *store) CountPlanners(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Distinct("owner_id").
		Count(&n).Error
	return n, err
}

func (s *store) CountPublic(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Where("visibility = ?", models.VisibilityPublic).
		Count(&n).Error
	return n, err
}

// CountClones counts the copies themselves rather than summing `clone_count`.
// The counter is a display number that a deleted copy never gives back; a row
// with a source is a copy that still exists.
func (s *store) CountClones(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		Where("source_trip_id IS NOT NULL").
		Count(&n).Error
	return n, err
}

/* ------------------------------------------------- public explore (M11) -- */

// ListPublic returns only trips their owners chose to publish. Sorting is a
// column sort, not a ranked feed — the points-weighted feed is a later story.
func (s *store) ListPublic(ctx context.Context, f models.ExploreFilter) ([]models.Trip, int64, error) {
	// 200 is the match pool (A11.3), not a page size: ranking by match score
	// happens in Go, so the handler asks for a window and slices it itself.
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 12
	}

	q := s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("visibility = ? AND trips.archived_at IS NULL", models.VisibilityPublic)

	if f.Country != "" {
		q = q.Where("trips.destination_country = ?", f.Country)
	}
	if len(f.Countries) > 0 {
		q = q.Where("trips.destination_country IN ?", f.Countries)
	}
	if f.Query != "" {
		like := "%" + f.Query + "%"
		// destination_cities is a JSON array; LIKE over its text form is crude
		// but works identically on MySQL and the SQLite the tests run on.
		q = q.Where("(trips.title LIKE ? OR trips.destination_cities LIKE ?)", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	switch f.Sort {
	case models.ExploreSortNew:
		// Published first, and never edited-last-night first (D-18). Rows
		// published before the column existed fall back to updated_at.
		q = q.Order("COALESCE(trips.published_at, trips.updated_at) DESC")
	case models.ExploreSortTrending:
		// Views in the last seven days against the seven before them: a plan
		// that went from 2 views to 40 outranks one that has always had 40.
		// The +1 keeps a brand-new plan from dividing by zero and keeps a plan
		// with one view from scoring infinity.
		now := domain.Day(time.Now().UTC())
		recent := now.AddDate(0, 0, -7)
		prior := now.AddDate(0, 0, -14)
		q = q.Joins(
			"LEFT JOIN (SELECT trip_id, "+
				"SUM(CASE WHEN day >= ? THEN views ELSE 0 END) AS recent_views, "+
				"SUM(CASE WHEN day < ? THEN views ELSE 0 END) AS prior_views "+
				"FROM trip_view_daily WHERE day >= ? GROUP BY trip_id) v ON v.trip_id = trips.id",
			recent, recent, prior,
		).
			Order("(COALESCE(v.recent_views, 0) * 1.0 / (COALESCE(v.prior_views, 0) + 1)) DESC").
			Order("COALESCE(v.recent_views, 0) DESC").
			Order("(trips.view_count + trips.clone_count * 5) DESC")
	default: // popular
		q = q.Order("(trips.view_count + trips.clone_count * 5) DESC").Order("trips.updated_at DESC")
	}

	var out []models.Trip
	err := q.Limit(limit).Offset(f.Offset).Find(&out).Error
	return out, total, err
}

// MaxCreatorTrips caps the creator page. Unbounded, a prolific creator turned
// one public request into a scan of every trip they ever published — and the
// page only shows a grid, so the tail was never rendered anyway.
const MaxCreatorTrips = 48

func (s *store) ListPublicByOwner(ctx context.Context, ownerID string) ([]models.Trip, error) {
	var out []models.Trip
	err := s.db.WithContext(ctx).
		Where("owner_id = ? AND visibility = ? AND archived_at IS NULL", ownerID, models.VisibilityPublic).
		Order("updated_at DESC").
		Limit(MaxCreatorTrips).
		Find(&out).Error
	return out, err
}

// ActiveOwnedIDs lists trips this user owns that are not over (M26 — A26.3).
//
// Owned, not joined: being invited into somebody else's trip cannot use up the
// one slot a free account has, or a single popular friend could lock a person
// out of planning anything of their own.
func (s *store) ActiveOwnedIDs(ctx context.Context, userID string) ([]string, error) {
	var ids []string
	err := s.db.WithContext(ctx).
		Model(&models.Trip{}).
		// An archived trip frees its slot (D-34), the same as a finished one.
		Where("owner_id = ? AND status <> ? AND archived_at IS NULL", userID, models.TripStatusDone).
		Pluck("id", &ids).Error
	return ids, err
}

func (s *store) IsArchived(ctx context.Context, tripID string) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ? AND archived_at IS NOT NULL", tripID).
		Count(&count).Error
	return count > 0, err
}

func (s *store) ListArchivedOwned(ctx context.Context, userID string) ([]models.Trip, error) {
	var out []models.Trip
	err := s.db.WithContext(ctx).
		Where("owner_id = ? AND archived_at IS NOT NULL", userID).
		Order("archived_at DESC").
		Find(&out).Error
	return out, err
}

func (s *store) SetArchived(ctx context.Context, tripID string, at *time.Time, by *string) error {
	return s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("id = ?", tripID).
		Updates(map[string]any{"archived_at": at, "archived_by": by}).Error
}
