// Package lead holds the GORM implementation of the agent handoff (A12.12).
package lead

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.LeadStore { return &store{db: db} }

var Module = fx.Module("store.lead", fx.Provide(New))

func (s *store) Create(ctx context.Context, lead *models.AgentLead) error {
	return s.db.WithContext(ctx).Create(lead).Error
}

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.AgentLead, error) {
	var out []models.AgentLead
	err := s.db.WithContext(ctx).
		Where("trip_id = ?", tripID).
		Order("created_at DESC").
		Find(&out).Error
	return out, err
}

// List is the ops queue. Not trip-scoped because it is not a trip view — it is
// reachable only from the admin group, which is guarded separately (§4.3).
func (s *store) List(ctx context.Context, status string, limit int) ([]models.AgentLead, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := s.db.WithContext(ctx).Model(&models.AgentLead{})
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var out []models.AgentLead
	err := q.Order("created_at DESC").Limit(limit).Find(&out).Error
	return out, err
}

func (s *store) Get(ctx context.Context, leadID string) (*models.AgentLead, error) {
	var out models.AgentLead
	if err := s.db.WithContext(ctx).Where("id = ?", leadID).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) Update(ctx context.Context, lead *models.AgentLead) error {
	return s.db.WithContext(ctx).Save(lead).Error
}
