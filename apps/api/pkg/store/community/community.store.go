// Package community holds the GORM implementations behind the inbox (A9.2)
// and polls (A9.3) — the two things that make a trip room feel like a group
// rather than a document.
package community

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

/* --------------------------------------------------------- notifications -- */

type notificationStore struct{ db *gorm.DB }

func NewNotificationStore(db *gorm.DB) models.NotificationStore {
	return &notificationStore{db: db}
}

func (s *notificationStore) Create(ctx context.Context, n *models.Notification) error {
	return s.db.WithContext(ctx).Create(n).Error
}

func (s *notificationStore) CreateMany(ctx context.Context, notifications []models.Notification) error {
	if len(notifications) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Create(&notifications).Error
}

func (s *notificationStore) ListForUser(ctx context.Context, userID string, limit int) ([]models.Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	var out []models.Notification
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

func (s *notificationStore) CountUnread(ctx context.Context, userID string) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).
		Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&n).Error
	return n, err
}

// MarkRead is scoped by user as well as id: an inbox row is the most personal
// thing in the product, and "by id alone" is how you read someone else's.
func (s *notificationStore) MarkRead(ctx context.Context, userID, notificationID string) error {
	return s.db.WithContext(ctx).
		Model(&models.Notification{}).
		Where("user_id = ? AND id = ? AND read_at IS NULL", userID, notificationID).
		Update("read_at", time.Now().UTC()).Error
}

func (s *notificationStore) MarkAllRead(ctx context.Context, userID string) error {
	return s.db.WithContext(ctx).
		Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", time.Now().UTC()).Error
}

/* ------------------------------------------------------------------ polls -- */

type pollStore struct{ db *gorm.DB }

func NewPollStore(db *gorm.DB) models.PollStore { return &pollStore{db: db} }

func (s *pollStore) Create(ctx context.Context, p *models.Poll) error {
	return s.db.WithContext(ctx).Create(p).Error
}

func (s *pollStore) Get(ctx context.Context, tripID, pollID string) (*models.Poll, error) {
	var p models.Poll
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, pollID).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *pollStore) ListByTrip(ctx context.Context, tripID string) ([]models.Poll, error) {
	var out []models.Poll
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("closed ASC, created_at DESC").
		Find(&out).Error
	return out, err
}

func (s *pollStore) Update(ctx context.Context, p *models.Poll) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", p.TripID, p.ID).
		Save(p).Error
}

func (s *pollStore) Delete(ctx context.Context, tripID, pollID string) error {
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND id = ?", tripID, pollID).
		Delete(&models.Poll{}).Error
}

var Module = fx.Module("store.community", fx.Provide(NewNotificationStore, NewPollStore))
