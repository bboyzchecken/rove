package booking

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.BookingStore { return &store{db: db} }

var Module = fx.Module("store.booking", fx.Provide(New))

func (s *store) CreateClick(ctx context.Context, c *models.BookingClick) error {
	return s.db.WithContext(ctx).Create(c).Error
}

// GetClickByTracking is keyed on the random tracking id, which is what the
// unauthenticated /go/:trackingId redirect has to work with.
func (s *store) GetClickByTracking(ctx context.Context, trackingID string) (*models.BookingClick, error) {
	var c models.BookingClick
	err := s.db.WithContext(ctx).Where("tracking_id = ?", trackingID).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *store) MarkClicked(ctx context.Context, trackingID, ua, referrer string) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.BookingClick{}).
		Where("tracking_id = ?", trackingID).
		Updates(map[string]any{"clicked_at": now, "ua": ua, "referrer": referrer}).Error
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.BookingClick, error) {
	var cs []models.BookingClick
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("created_at DESC").Find(&cs).Error
	return cs, err
}

func (s *store) CreateConfirmation(ctx context.Context, c *models.BookingConfirmation) error {
	return s.db.WithContext(ctx).Create(c).Error
}

// GetConfirmationByRef makes the importer and the webhook idempotent: the same
// partner reference must never award points twice.
func (s *store) GetConfirmationByRef(ctx context.Context, partner, partnerRef string) (*models.BookingConfirmation, error) {
	var c models.BookingConfirmation
	err := s.db.WithContext(ctx).
		Where("partner = ? AND partner_ref = ?", partner, partnerRef).
		First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *store) ListPartners(ctx context.Context) ([]models.AffiliatePartner, error) {
	var ps []models.AffiliatePartner
	err := s.db.WithContext(ctx).Order("priority DESC").Find(&ps).Error
	return ps, err
}

func (s *store) UpsertPartner(ctx context.Context, p *models.AffiliatePartner) error {
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"name", "item_types", "deeplink_template", "subid_param",
			"enabled", "priority", "notes", "updated_at",
		}),
	}).Create(p).Error
}

func (s *store) RecordClone(ctx context.Context, c *models.PlanClone) error {
	return s.db.WithContext(ctx).Create(c).Error
}

func (s *store) CountClicksSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.BookingClick{}).
		Where("created_at >= ?", since).Count(&n).Error
	return n, err
}

func (s *store) CountConfirmationsSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.BookingConfirmation{}).
		Where("created_at >= ?", since).Count(&n).Error
	return n, err
}
