// Package billing holds the GORM implementation of orders, receipts and
// subscriptions (M20 — A20.x).
package billing

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.BillingStore { return &store{db: db} }

var Module = fx.Module("store.billing", fx.Provide(New))

// CreateOrder numbers the receipt and writes it in one transaction.
//
// The sequence is a COUNT inside that transaction rather than a counter table:
// orders are rare (a handful per user per year) and a wrong number is worse
// than a slow one. The unique index on `number` is the real guarantee — if two
// transactions still manage to pick the same sequence, the second one fails and
// is retried once rather than issuing a duplicate receipt.
func (s *store) CreateOrder(ctx context.Context, order *models.Order) error {
	if order.IssuedAt.IsZero() {
		order.IssuedAt = time.Now().UTC()
	}
	if order.Currency == "" {
		order.Currency = "THB"
	}

	attempt := func() error {
		return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var used int64
			prefix := domain.ReceiptYearPrefix(order.IssuedAt)
			if err := tx.Model(&models.Order{}).
				Where("number LIKE ?", prefix+"%").
				Count(&used).Error; err != nil {
				return err
			}
			order.Number = domain.ReceiptNumber(order.IssuedAt, int(used)+1)
			return tx.Create(order).Error
		})
	}

	if err := attempt(); err != nil {
		if !isDuplicate(err) {
			return err
		}
		// Lost the race for that sequence — take the next one.
		order.ID = ""
		return attempt()
	}
	return nil
}

// isDuplicate spots the unique-index violation on `number`.
//
// `gorm.ErrDuplicatedKey` only arrives when GORM is opened with
// `TranslateError` (it is not — §4.1 config), so the driver's own message is
// checked as well. Both are tried rather than one, so turning translation on
// later needs no change here.
func isDuplicate(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	message := strings.ToLower(err.Error())
	// MySQL says "Error 1062: Duplicate entry"; SQLite, which the authorization
	// tests run on, says "UNIQUE constraint failed".
	return strings.Contains(message, "duplicate entry") ||
		strings.Contains(message, "unique constraint failed")
}

func (s *store) ListOrders(ctx context.Context, userID string, limit int) ([]models.Order, error) {
	if limit <= 0 {
		limit = 100
	}
	var out []models.Order
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("issued_at DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// GetOrder is scoped by user, not just by id: a receipt names what someone
// bought and is nobody else's to read.
func (s *store) GetOrder(ctx context.Context, userID, orderID string) (*models.Order, error) {
	var order models.Order
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND id = ?", userID, orderID).
		First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// Summary aggregates in SQL rather than by loading every order — except for the
// draft count, which has to read the lines to know how many drafts a purchase
// of "3 ครั้ง" actually was.
func (s *store) Summary(ctx context.Context, userID string) (*models.BillingSummary, error) {
	var head struct {
		Orders      int64
		TotalSpent  *float64
		PointsSpent *int
	}

	paid := func() *gorm.DB {
		return s.db.WithContext(ctx).
			Model(&models.Order{}).
			Where("user_id = ? AND status = ?", userID, domain.OrderPaid)
	}

	err := paid().
		Select("COUNT(*) AS orders, SUM(total_thb) AS total_spent, SUM(points_spent) AS points_spent").
		Scan(&head).Error
	if err != nil {
		return nil, err
	}

	out := &models.BillingSummary{Orders: int(head.Orders)}
	if head.TotalSpent != nil {
		out.TotalSpentTHB = *head.TotalSpent
	}
	if head.PointsSpent != nil {
		out.PointsSpent = *head.PointsSpent
	}

	// The first purchase is read as a row rather than as MIN(issued_at): a
	// driver that hands an aggregated timestamp back as text (SQLite does) turns
	// the whole summary into a 500 over a line of small print.
	if out.Orders > 0 {
		var first models.Order
		if err := paid().Order("issued_at ASC").First(&first).Error; err == nil {
			issued := first.IssuedAt
			out.Since = &issued
		}
	}

	drafts, err := s.draftsPurchased(ctx, userID)
	if err != nil {
		return nil, err
	}
	out.AIDraftsPurchased = drafts
	return out, nil
}

// draftsPurchased counts drafts, not orders: "ซื้อ AI ไปกี่ครั้ง" means runs.
func (s *store) draftsPurchased(ctx context.Context, userID string) (int, error) {
	var orders []models.Order
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND status = ? AND kind = ?", userID, domain.OrderPaid, domain.OrderKindAICredit).
		Find(&orders).Error
	if err != nil {
		return 0, err
	}

	total := 0
	for _, order := range orders {
		for _, line := range models.DecodeOrderLines(order.Lines) {
			total += line.Quantity
		}
	}
	return total, nil
}

/* --------------------------------------------------------- subscription -- */

func (s *store) ActiveSubscription(ctx context.Context, userID string) (*models.Subscription, error) {
	var sub models.Subscription
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND status IN ?", userID, []string{models.SubStatusActive, models.SubStatusPastDue}).
		Order("current_period_end DESC").
		First(&sub).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Not an error: a free user simply has no subscription row.
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

func (s *store) SaveSubscription(ctx context.Context, sub *models.Subscription) error {
	return s.db.WithContext(ctx).Save(sub).Error
}
