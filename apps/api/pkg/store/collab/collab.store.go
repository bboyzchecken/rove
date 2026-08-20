// Package collab holds the GORM implementation of comments, votes and the
// activity feed (M9 — A9.1, A2.4).
package collab

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

type collabStore struct{ db *gorm.DB }

func New(db *gorm.DB) models.CollabStore { return &collabStore{db: db} }

var Module = fx.Module("store.collab", fx.Provide(New))

/* -------------------------------------------------------------- comments -- */

func (s *collabStore) CreateComment(ctx context.Context, c *models.Comment) error {
	return s.db.WithContext(ctx).Create(c).Error
}

func (s *collabStore) GetComment(ctx context.Context, tripID, commentID string) (*models.Comment, error) {
	var c models.Comment
	err := s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", tripID, commentID).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *collabStore) ListComments(ctx context.Context, tripID, targetType, targetID string) ([]models.Comment, error) {
	var out []models.Comment
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND target_type = ? AND target_id = ?", tripID, targetType, targetID).
		Order("created_at ASC").
		Find(&out).Error
	return out, err
}

// ListTripComments powers the Discussion tab's unread badge and the item cards'
// comment counts in one query.
func (s *collabStore) ListTripComments(ctx context.Context, tripID string) ([]models.Comment, error) {
	var out []models.Comment
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at ASC").
		Find(&out).Error
	return out, err
}

func (s *collabStore) UpdateComment(ctx context.Context, c *models.Comment) error {
	return s.db.WithContext(ctx).Where("trip_id = ? AND id = ?", c.TripID, c.ID).Save(c).Error
}

func (s *collabStore) DeleteComment(ctx context.Context, tripID, commentID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, commentID).
		Delete(&models.Comment{}).Error
}

/* ----------------------------------------------------------------- votes -- */

// SetVote replaces this member's vote rather than stacking a second one.
func (s *collabStore) SetVote(ctx context.Context, v *models.Vote) error {
	if v.VotedAt.IsZero() {
		v.VotedAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(v).Error
}

func (s *collabStore) ListVotes(ctx context.Context, tripID, targetType, targetID string) ([]models.Vote, error) {
	var out []models.Vote
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND target_type = ? AND target_id = ?", tripID, targetType, targetID).
		Find(&out).Error
	return out, err
}

func (s *collabStore) ListTripVotes(ctx context.Context, tripID string) ([]models.Vote, error) {
	var out []models.Vote
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("voted_at ASC").
		Find(&out).Error
	return out, err
}

/* -------------------------------------------------------------- activity -- */

func (s *collabStore) Log(ctx context.Context, a *models.Activity) error {
	return s.db.WithContext(ctx).Create(a).Error
}

// ListActivity is keyset-paginated on created_at: the feed grows at the top
// while someone is scrolling it, and offsets would duplicate rows.
func (s *collabStore) ListActivity(ctx context.Context, tripID, cursor string, limit int) ([]models.Activity, error) {
	var out []models.Activity
	q := s.db.WithContext(ctx).Where("trip_id = ?", tripID)
	err := q.Scopes(store.CursorPaginate("created_at", cursor, limit)).Find(&out).Error
	return out, err
}
