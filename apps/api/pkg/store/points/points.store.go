package points

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

type pointsStore struct{ db *gorm.DB }

func New(db *gorm.DB) models.PointsStore { return &pointsStore{db: db} }

var Module = fx.Module("store.points", fx.Provide(New))

// Get returns a zero balance rather than an error for a user who has never
// earned anything — every user has points, most of them have none.
func (s *pointsStore) Get(ctx context.Context, userID string) (*models.UserPoints, error) {
	var p models.UserPoints
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&p).Error
	if err == gorm.ErrRecordNotFound {
		return &models.UserPoints{UserID: userID}, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// Award writes the ledger row and moves the balance atomically. The ledger is
// the source of truth; user_points is a cached sum (DEV_SPEC §6.5).
func (s *pointsStore) Award(ctx context.Context, tx *models.PointsTransaction) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Create(tx).Error; err != nil {
			return err
		}

		row := models.UserPoints{
			UserID:    tx.UserID,
			UpdatedAt: time.Now().UTC(),
		}
		if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}

		updates := map[string]any{
			"balance":    gorm.Expr("balance + ?", tx.Amount),
			"updated_at": time.Now().UTC(),
		}
		if tx.Amount > 0 {
			updates["lifetime_earned"] = gorm.Expr("lifetime_earned + ?", tx.Amount)
		}
		return db.Model(&models.UserPoints{}).
			Where("user_id = ?", tx.UserID).
			Updates(updates).Error
	})
}

func (s *pointsStore) History(ctx context.Context, userID, cursor string, limit int) ([]models.PointsTransaction, error) {
	var txs []models.PointsTransaction
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Scopes(store.CursorPaginate("created_at", cursor, limit)).
		Find(&txs).Error
	return txs, err
}
