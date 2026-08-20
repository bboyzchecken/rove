package plan

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PlanStore { return &store{db: db} }

var Module = fx.Module("store.plan", fx.Provide(New))

func (s *store) ListByTrip(ctx context.Context, tripID string) ([]models.Plan, error) {
	var ps []models.Plan
	err := s.db.WithContext(ctx).Where("trip_id = ?", tripID).
		Order("is_final DESC, created_at DESC").Find(&ps).Error
	return ps, err
}

func (s *store) Create(ctx context.Context, p *models.Plan) error {
	return s.db.WithContext(ctx).Create(p).Error
}

func (s *store) Get(ctx context.Context, tripID, planID string) (*models.Plan, error) {
	var p models.Plan
	err := s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", planID, tripID).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetTripID is the bridge for the /plans/:planId routes: the handler resolves
// the trip first, then runs the same membership check a trip-scoped route gets.
// It returns ONLY the id — never plan content — so it cannot leak anything.
func (s *store) GetTripID(ctx context.Context, planID string) (string, error) {
	var tripID string
	err := s.db.WithContext(ctx).Model(&models.Plan{}).
		Where("id = ?", planID).
		Pluck("trip_id", &tripID).Error
	if err != nil {
		return "", err
	}
	if tripID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return tripID, nil
}

func (s *store) Update(ctx context.Context, p *models.Plan) error {
	return s.db.WithContext(ctx).
		Where("id = ? AND trip_id = ?", p.ID, p.TripID).
		Save(p).Error
}

// Delete removes the plan and everything hanging off it in one transaction —
// there is no soft delete anywhere in this schema (§4.1).
func (s *store) Delete(ctx context.Context, tripID, planID string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var p models.Plan
		if err := db.Where("id = ? AND trip_id = ?", planID, tripID).First(&p).Error; err != nil {
			return err
		}
		if err := db.Where("plan_id = ?", planID).Delete(&models.ItemVersion{}).Error; err != nil {
			return err
		}
		if err := db.Where("plan_id = ?", planID).Delete(&models.Item{}).Error; err != nil {
			return err
		}
		if err := db.Where("plan_id = ?", planID).Delete(&models.Day{}).Error; err != nil {
			return err
		}
		if err := db.Where("plan_id = ?", planID).Delete(&models.Rationale{}).Error; err != nil {
			return err
		}
		return db.Where("id = ?", planID).Delete(&models.Plan{}).Error
	})
}

// Freeze marks one plan final and clears the flag on every sibling, so a trip
// always has at most one frozen plan.
func (s *store) Freeze(ctx context.Context, tripID, planID string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Model(&models.Plan{}).
			Where("trip_id = ?", tripID).
			Update("is_final", false).Error; err != nil {
			return err
		}
		if err := db.Model(&models.Plan{}).
			Where("id = ? AND trip_id = ?", planID, tripID).
			Update("is_final", true).Error; err != nil {
			return err
		}
		return db.Model(&models.Trip{}).
			Where("id = ?", tripID).
			Updates(map[string]any{"final_plan_id": planID, "status": models.TripStatusFinal}).Error
	})
}

func (s *store) Days(ctx context.Context, planID string) ([]models.Day, error) {
	var ds []models.Day
	err := s.db.WithContext(ctx).Where("plan_id = ?", planID).
		Order("day_index ASC, sort_order ASC").Find(&ds).Error
	return ds, err
}

func (s *store) CreateDay(ctx context.Context, d *models.Day) error {
	return s.db.WithContext(ctx).Create(d).Error
}

func (s *store) Items(ctx context.Context, planID string) ([]models.Item, error) {
	var is []models.Item
	err := s.db.WithContext(ctx).Where("plan_id = ?", planID).
		Order("sort_order ASC").Find(&is).Error
	return is, err
}

func (s *store) Rationales(ctx context.Context, planID string) ([]models.Rationale, error) {
	var rs []models.Rationale
	err := s.db.WithContext(ctx).Where("plan_id = ?", planID).
		Order("created_at ASC").Find(&rs).Error
	return rs, err
}

func (s *store) CountByTrip(ctx context.Context, tripID string) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.Plan{}).
		Where("trip_id = ?", tripID).Count(&n).Error
	return n, err
}
