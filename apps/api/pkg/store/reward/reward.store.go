// Package reward holds the GORM implementations of what points turn into and
// what creators are owed: discount codes (A12.10), the revenue-share ledger and
// its payouts (A12.11).
package reward

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type discountStore struct{ db *gorm.DB }
type earningStore struct{ db *gorm.DB }
type payoutStore struct{ db *gorm.DB }

func NewDiscountStore(db *gorm.DB) models.DiscountStore { return &discountStore{db: db} }
func NewEarningStore(db *gorm.DB) models.EarningStore   { return &earningStore{db: db} }
func NewPayoutStore(db *gorm.DB) models.PayoutStore     { return &payoutStore{db: db} }

var Module = fx.Module("store.reward",
	fx.Provide(NewDiscountStore, NewEarningStore, NewPayoutStore),
)

/* --------------------------------------------------------- discounts ----- */

func (s *discountStore) Create(ctx context.Context, code *models.DiscountCode) error {
	return s.db.WithContext(ctx).Create(code).Error
}

func (s *discountStore) GetByCode(ctx context.Context, code string) (*models.DiscountCode, error) {
	var out models.DiscountCode
	if err := s.db.WithContext(ctx).Where("code = ?", code).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *discountStore) ListForUser(ctx context.Context, userID string) ([]models.DiscountCode, error) {
	var out []models.DiscountCode
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&out).Error
	return out, err
}

// Claim only writes a row that is still unused, and reports whether it won.
// Two checkouts racing on one code both reach here; exactly one gets `true`.
func (s *discountStore) Claim(ctx context.Context, codeID string, at time.Time) (bool, error) {
	res := s.db.WithContext(ctx).
		Model(&models.DiscountCode{}).
		Where("id = ? AND used_at IS NULL", codeID).
		Update("used_at", at)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected == 1, nil
}

func (s *discountStore) Attach(ctx context.Context, codeID, orderID string) error {
	return s.db.WithContext(ctx).
		Model(&models.DiscountCode{}).
		Where("id = ?", codeID).
		Update("used_order", orderID).Error
}

func (s *discountStore) Release(ctx context.Context, codeID string) error {
	return s.db.WithContext(ctx).
		Model(&models.DiscountCode{}).
		Where("id = ?", codeID).
		Updates(map[string]any{"used_at": nil, "used_order": nil}).Error
}

/* ---------------------------------------------------------- earnings ----- */

func (s *earningStore) Create(ctx context.Context, earning *models.CreatorEarning) error {
	if earning.OccurredAt.IsZero() {
		earning.OccurredAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(earning).Error
}

func (s *earningStore) ListForUser(ctx context.Context, userID string, limit int) ([]models.CreatorEarning, error) {
	if limit <= 0 {
		limit = 50
	}
	var out []models.CreatorEarning
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// TotalsForUser sums each status in one pass rather than three queries.
func (s *earningStore) TotalsForUser(ctx context.Context, userID string) (models.EarningTotals, error) {
	var rows []struct {
		Status string
		Total  float64
		Count  int
	}
	err := s.db.WithContext(ctx).
		Model(&models.CreatorEarning{}).
		Select("status AS status", "SUM(amount_thb) AS total", "COUNT(*) AS count").
		Where("user_id = ?", userID).
		Group("status").
		Scan(&rows).Error
	if err != nil {
		return models.EarningTotals{}, err
	}

	var totals models.EarningTotals
	for _, row := range rows {
		totals.Count += row.Count
		switch row.Status {
		case models.EarningPending:
			totals.PendingTHB = row.Total
		case models.EarningPayable:
			totals.PayableTHB = row.Total
		case models.EarningPaid:
			totals.PaidTHB = row.Total
		}
	}
	return totals, nil
}

func (s *earningStore) ListPayable(ctx context.Context, from, to time.Time) ([]models.CreatorEarning, error) {
	var out []models.CreatorEarning
	err := s.db.WithContext(ctx).
		Where("status = ? AND occurred_at >= ? AND occurred_at < ?", models.EarningPayable, from, to).
		Order("user_id ASC, occurred_at ASC").
		Find(&out).Error
	return out, err
}

// AttachToPayout settles a batch. All of it or none of it: a payout row that
// claims twelve earnings and moved nine is worse than a failed transfer.
func (s *earningStore) AttachToPayout(ctx context.Context, payoutID string, earningIDs []string, at time.Time) error {
	if len(earningIDs) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.Model(&models.CreatorEarning{}).
			Where("id IN ? AND status = ?", earningIDs, models.EarningPayable).
			Updates(map[string]any{
				"status":     models.EarningPaid,
				"payout_id":  payoutID,
				"updated_at": at,
			}).Error
	})
}

/* ----------------------------------------------------------- payouts ----- */

func (s *payoutStore) Create(ctx context.Context, payout *models.Payout) error {
	return s.db.WithContext(ctx).Create(payout).Error
}

func (s *payoutStore) ListForUser(ctx context.Context, userID string) ([]models.Payout, error) {
	var out []models.Payout
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("period_start DESC").
		Find(&out).Error
	return out, err
}

func (s *payoutStore) List(ctx context.Context, from, to time.Time) ([]models.Payout, error) {
	var out []models.Payout
	err := s.db.WithContext(ctx).
		Where("period_start >= ? AND period_start < ?", from, to).
		Order("period_start DESC").
		Find(&out).Error
	return out, err
}
