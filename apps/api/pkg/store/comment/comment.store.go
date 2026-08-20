package comment

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

type commentStore struct{ db *gorm.DB }

func New(db *gorm.DB) models.CommentStore { return &commentStore{db: db} }

type voteStore struct{ db *gorm.DB }

func NewVotes(db *gorm.DB) models.VoteStore { return &voteStore{db: db} }

var Module = fx.Module("store.comment", fx.Provide(New, NewVotes))

func (s *commentStore) List(ctx context.Context, tripID, targetType, targetID string) ([]models.Comment, error) {
	var cs []models.Comment
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND target_type = ? AND target_id = ?", tripID, targetType, targetID).
		Order("created_at ASC").Find(&cs).Error
	return cs, err
}

// ListByTrip backs the Discussion tab, which shows every thread in the trip.
func (s *commentStore) ListByTrip(ctx context.Context, tripID, cursor string, limit int) ([]models.Comment, error) {
	var cs []models.Comment
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Scopes(store.CursorPaginate("created_at", cursor, limit)).
		Find(&cs).Error
	return cs, err
}

func (s *commentStore) Create(ctx context.Context, c *models.Comment) error {
	return s.db.WithContext(ctx).Create(c).Error
}

func (s *commentStore) Get(ctx context.Context, tripID, id string) (*models.Comment, error) {
	var c models.Comment
	err := s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", id, tripID).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *commentStore) TripID(ctx context.Context, id string) (string, error) {
	var tripID string
	err := s.db.WithContext(ctx).Model(&models.Comment{}).
		Where("id = ?", id).Pluck("trip_id", &tripID).Error
	if err != nil {
		return "", err
	}
	if tripID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return tripID, nil
}

// Delete removes the comment and its replies — a thread is one level deep, so
// one extra statement covers the whole subtree.
func (s *commentStore) Delete(ctx context.Context, tripID, id string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Where("parent_id = ? AND trip_id = ?", id, tripID).
			Delete(&models.Comment{}).Error; err != nil {
			return err
		}
		return db.Where("id = ? AND trip_id = ?", id, tripID).
			Delete(&models.Comment{}).Error
	})
}

// Upsert makes voting idempotent: changing your mind updates the existing row
// rather than stacking a second vote (unique index on target+user).
func (s *voteStore) Upsert(ctx context.Context, v *models.Vote) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "target_type"}, {Name: "target_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"choice", "reason", "updated_at"}),
	}).Create(v).Error
}

func (s *voteStore) List(ctx context.Context, tripID, targetType, targetID string) ([]models.Vote, error) {
	var vs []models.Vote
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND target_type = ? AND target_id = ?", tripID, targetType, targetID).
		Find(&vs).Error
	return vs, err
}
