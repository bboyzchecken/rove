package member

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TripMemberStore { return &store{db: db} }

var Module = fx.Module("store.member", fx.Provide(New))

func (s *store) Add(ctx context.Context, m *models.TripMember) error {
	if m.JoinedAt.IsZero() {
		m.JoinedAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(m).Error
}

// Get powers TripRoleMiddleware — it is on the hot path of every trip request.
func (s *store) Get(ctx context.Context, tripID, userID string) (*models.TripMember, error) {
	var m models.TripMember
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		First(&m).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.TripMember, error) {
	var ms []models.TripMember
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&ms).Error
	return ms, err
}

// ListByTrips is the roster for a whole page of trips in one query. The trip
// list renders an avatar stack per row, and doing that a trip at a time is how
// twenty trips became sixty queries.
func (s *store) ListByTrips(ctx context.Context, tripIDs []string) ([]models.TripMember, error) {
	if len(tripIDs) == 0 {
		return nil, nil
	}
	var ms []models.TripMember
	err := s.db.WithContext(ctx).Where("trip_id IN ?", tripIDs).Find(&ms).Error
	return ms, err
}

func (s *store) UpdateRole(ctx context.Context, tripID, userID, role string) error {
	return s.db.WithContext(ctx).
		Model(&models.TripMember{}).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Update("role", role).Error
}

func (s *store) Remove(ctx context.Context, tripID, userID string) error {
	if err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Delete(&models.TripMember{}).Error; err != nil {
		return err
	}
	// The profile is the membership's opinion about this trip; it goes with it.
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		Delete(&models.MemberProfile{}).Error
}

/* -------------------------------------------------- member profiles (A3.1) */

func (s *store) GetProfile(ctx context.Context, tripID, userID string) (*models.MemberProfile, error) {
	var p models.MemberProfile
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", tripID, userID).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// UpsertProfile writes the whole row: the form always submits every field, so
// a partial update path would only add a second way to be wrong.
func (s *store) UpsertProfile(ctx context.Context, p *models.MemberProfile) error {
	var existing models.MemberProfile
	err := s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", p.TripID, p.UserID).
		First(&existing).Error
	if err != nil {
		return s.db.WithContext(ctx).Create(p).Error
	}
	p.CreatedAt = existing.CreatedAt
	return s.db.WithContext(ctx).
		Where("trip_id = ? AND user_id = ?", p.TripID, p.UserID).
		Save(p).Error
}

func (s *store) ListProfiles(ctx context.Context, tripID string) ([]models.MemberProfile, error) {
	var out []models.MemberProfile
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).Find(&out).Error
	return out, err
}
