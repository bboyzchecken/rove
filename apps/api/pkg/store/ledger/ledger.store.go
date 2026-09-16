// Package ledger is the only writer of points, creator earnings and the
// evidence behind them (Feedback #4 — F12). It inserts; it never deletes or
// edits a ledger row, and ledger_guard_test.go fails the build if that changes.
package ledger

import (
	"context"
	"errors"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.LedgerStore { return &store{db: db} }

var Module = fx.Module("store.ledger",
	fx.Provide(New, NewSettingsStore, NewAuditStore),
)

var ErrNoSource = errors.New("ledger: a ledger row needs a source")

func (s *store) Record(ctx context.Context, entry *models.LedgerEntry) error {
	if entry == nil || entry.Source == nil {
		return ErrNoSource
	}
	now := time.Now().UTC()
	if entry.Source.OccurredAt.IsZero() {
		entry.Source.OccurredAt = now
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(entry.Source).Error; err != nil {
			return err
		}
		sourceID := entry.Source.ID
		for i := range entry.Points {
			row := &entry.Points[i]
			row.SourceID = &sourceID
			if row.OccurredAt.IsZero() {
				row.OccurredAt = entry.Source.OccurredAt
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}
		for i := range entry.Earnings {
			row := &entry.Earnings[i]
			row.SourceID = &sourceID
			if row.OccurredAt.IsZero() {
				row.OccurredAt = entry.Source.OccurredAt
			}
			if row.Status == "" {
				row.Status = models.EarningPending
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.EarningEvent{
				EarningID:  row.ID,
				FromStatus: "",
				ToStatus:   row.Status,
				ActorID:    entry.Source.ActorUserID,
				Reason:     "เกิดรายได้",
				Ref:        sourceID,
				OccurredAt: row.OccurredAt,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *store) GetSource(ctx context.Context, id string) (*models.ValueSource, error) {
	var out models.ValueSource
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) SourcesByIDs(ctx context.Context, ids []string) ([]models.ValueSource, error) {
	var out []models.ValueSource
	if len(ids) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("id IN ?", ids).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) ChildSources(ctx context.Context, parentIDs []string) ([]models.ValueSource, error) {
	var out []models.ValueSource
	if len(parentIDs) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("parent_id IN ?", parentIDs).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) LatestSource(ctx context.Context, kind, subjectID string) (*models.ValueSource, error) {
	var out models.ValueSource
	err := s.db.WithContext(ctx).
		Where("kind = ? AND subject_id = ?", kind, subjectID).
		Order("occurred_at DESC").
		First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) CloneSourceForCopy(ctx context.Context, copyTripID string) (*models.ValueSource, error) {
	var out models.ValueSource
	err := s.db.WithContext(ctx).
		Where("kind = ? AND other_trip_id = ?", models.SourceClone, copyTripID).
		Order("occurred_at DESC").
		First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) SourcesForTrip(ctx context.Context, tripID string, limit int) ([]models.ValueSource, error) {
	var out []models.ValueSource
	err := s.db.WithContext(ctx).
		Where("trip_id = ? OR other_trip_id = ?", tripID, tripID).
		Order("occurred_at DESC").
		Limit(clampLimit(limit)).
		Find(&out).Error
	return out, err
}

func (s *store) SourcesForBooking(ctx context.Context, bookingID string) ([]models.ValueSource, error) {
	var out []models.ValueSource
	err := s.db.WithContext(ctx).Where("booking_id = ?", bookingID).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) SourcesForSubject(ctx context.Context, subjectID string) ([]models.ValueSource, error) {
	var out []models.ValueSource
	err := s.db.WithContext(ctx).Where("subject_id = ?", subjectID).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) SourcesForActor(ctx context.Context, userID string, limit int) ([]models.ValueSource, error) {
	var out []models.ValueSource
	err := s.db.WithContext(ctx).
		Where("actor_user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(clampLimit(limit)).
		Find(&out).Error
	return out, err
}

func (s *store) TripTied(ctx context.Context, tripID string) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).
		Model(&models.ValueSource{}).
		Where("trip_id = ? OR other_trip_id = ?", tripID, tripID).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

func (s *store) TiedBookingIDs(ctx context.Context, bookingIDs []string) (map[string]bool, error) {
	out := map[string]bool{}
	if len(bookingIDs) == 0 {
		return out, nil
	}
	var ids []string
	err := s.db.WithContext(ctx).
		Model(&models.ValueSource{}).
		Where("booking_id IN ?", bookingIDs).
		Distinct().
		Pluck("booking_id", &ids).Error
	for _, id := range ids {
		out[id] = true
	}
	return out, err
}

func (s *store) PointsBySources(ctx context.Context, sourceIDs []string) ([]models.UserPoints, error) {
	var out []models.UserPoints
	if len(sourceIDs) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("source_id IN ?", sourceIDs).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) EarningsBySources(ctx context.Context, sourceIDs []string) ([]models.CreatorEarning, error) {
	var out []models.CreatorEarning
	if len(sourceIDs) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("source_id IN ?", sourceIDs).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) GetPoints(ctx context.Context, id string) (*models.UserPoints, error) {
	var out models.UserPoints
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) GetEarning(ctx context.Context, id string) (*models.CreatorEarning, error) {
	var out models.CreatorEarning
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) PointsForUser(ctx context.Context, userID string, limit int) ([]models.UserPoints, error) {
	var out []models.UserPoints
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(clampLimit(limit)).
		Find(&out).Error
	return out, err
}

func (s *store) EarningsForUser(ctx context.Context, userID string, limit int) ([]models.CreatorEarning, error) {
	var out []models.CreatorEarning
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(clampLimit(limit)).
		Find(&out).Error
	return out, err
}

func (s *store) TransitionEarning(
	ctx context.Context,
	earningID string,
	from []string,
	to string,
	actorID *string,
	reason, ref string,
) (bool, error) {
	won := false
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current models.CreatorEarning
		if err := tx.Where("id = ?", earningID).First(&current).Error; err != nil {
			return err
		}
		allowed := false
		for _, status := range from {
			if current.Status == status {
				allowed = true
				break
			}
		}
		if !allowed {
			return nil
		}

		now := time.Now().UTC()
		// The status sits in the WHERE as well: two admins acting at once must
		// not both move the same earning.
		res := tx.Model(&models.CreatorEarning{}).
			Where("id = ? AND status = ?", earningID, current.Status).
			Updates(map[string]any{"status": to, "updated_at": now})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return nil
		}
		if err := tx.Create(&models.EarningEvent{
			EarningID:  earningID,
			FromStatus: current.Status,
			ToStatus:   to,
			ActorID:    actorID,
			Reason:     reason,
			Ref:        ref,
			OccurredAt: now,
		}).Error; err != nil {
			return err
		}
		won = true
		return nil
	})
	return won, err
}

func (s *store) EarningEvents(ctx context.Context, earningIDs []string) ([]models.EarningEvent, error) {
	var out []models.EarningEvent
	if len(earningIDs) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("earning_id IN ?", earningIDs).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) MoveEarningsToPayout(ctx context.Context, earningIDs []string, payoutID string, actorID *string) (int, error) {
	moved := 0
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		for _, id := range earningIDs {
			res := tx.Model(&models.CreatorEarning{}).
				Where("id = ? AND status = ?", id, models.EarningPayable).
				Updates(map[string]any{"status": models.EarningInPayout, "payout_id": payoutID, "updated_at": now})
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected != 1 {
				return errEarningMoved
			}
			if err := tx.Create(&models.EarningEvent{
				EarningID: id, FromStatus: models.EarningPayable, ToStatus: models.EarningInPayout,
				ActorID: actorID, Reason: "นับเข้ารอบโอน", Ref: payoutID, OccurredAt: now,
			}).Error; err != nil {
				return err
			}
			moved++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return moved, nil
}

var errEarningMoved = errors.New("ledger: an earning changed status while the payout was being built")

func (s *store) EarningsByStatus(ctx context.Context, status, partner string, limit int) ([]models.CreatorEarning, error) {
	q := s.db.WithContext(ctx).Where("status = ?", status)
	if partner != "" {
		q = q.Where("partner = ?", partner)
	}
	var out []models.CreatorEarning
	err := q.Order("occurred_at ASC").Limit(clampLimit(limit)).Find(&out).Error
	return out, err
}

func (s *store) EarningsForPayout(ctx context.Context, payoutID string) ([]models.CreatorEarning, error) {
	var out []models.CreatorEarning
	err := s.db.WithContext(ctx).Where("payout_id = ?", payoutID).Order("occurred_at ASC").Find(&out).Error
	return out, err
}

func (s *store) HeldEarnings(ctx context.Context, userID string, before *time.Time) ([]models.CreatorEarning, error) {
	q := s.db.WithContext(ctx).
		Joins("JOIN users u ON u.id = creator_earnings.user_id").
		Where("u.verified_at IS NULL").
		Where("creator_earnings.status IN ?", []string{models.EarningPending, models.EarningPayable}).
		Where("creator_earnings.amount_thb > 0")
	if userID != "" {
		q = q.Where("creator_earnings.user_id = ?", userID)
	}
	if before != nil {
		q = q.Where("creator_earnings.occurred_at < ?", *before)
	}
	var out []models.CreatorEarning
	err := q.Order("creator_earnings.occurred_at ASC").Limit(1000).Find(&out).Error
	return out, err
}

func (s *store) AddFlag(ctx context.Context, flag *models.LedgerFlag) error {
	return s.db.WithContext(ctx).Create(flag).Error
}

func (s *store) ResolveFlag(ctx context.Context, flagID, actorID, resolution string, at time.Time) (bool, error) {
	res := s.db.WithContext(ctx).
		Model(&models.LedgerFlag{}).
		Where("id = ? AND resolved_at IS NULL", flagID).
		Updates(map[string]any{"resolved_at": at, "resolved_by": actorID, "resolution": resolution})
	return res.RowsAffected == 1, res.Error
}

func (s *store) ListFlags(ctx context.Context, openOnly bool, limit int) ([]models.LedgerFlag, error) {
	q := s.db.WithContext(ctx).Model(&models.LedgerFlag{})
	if openOnly {
		q = q.Where("resolved_at IS NULL")
	}
	var out []models.LedgerFlag
	err := q.Order("created_at DESC").Limit(clampLimit(limit)).Find(&out).Error
	return out, err
}

func (s *store) FlagsBySources(ctx context.Context, sourceIDs []string) ([]models.LedgerFlag, error) {
	var out []models.LedgerFlag
	if len(sourceIDs) == 0 {
		return out, nil
	}
	err := s.db.WithContext(ctx).Where("source_id IN ?", sourceIDs).Order("created_at ASC").Find(&out).Error
	return out, err
}

func clampLimit(limit int) int {
	if limit <= 0 || limit > 500 {
		return 100
	}
	return limit
}

/* ----------------------------------------------------------- settings ---- */

type settingsStore struct{ db *gorm.DB }

func NewSettingsStore(db *gorm.DB) models.SettingsStore { return &settingsStore{db: db} }

func (s *settingsStore) All(ctx context.Context) (map[string]string, error) {
	var rows []models.AppSetting
	if err := s.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.Key] = row.Value
	}
	return out, nil
}

func (s *settingsStore) Set(ctx context.Context, key, value string, actorID *string) error {
	row := models.AppSetting{Key: key, Value: value, UpdatedBy: actorID, UpdatedAt: time.Now().UTC()}
	return s.db.WithContext(ctx).Save(&row).Error
}

/* -------------------------------------------------------------- audit ---- */

type auditStore struct{ db *gorm.DB }

func NewAuditStore(db *gorm.DB) models.AuditStore { return &auditStore{db: db} }

func (s *auditStore) Log(ctx context.Context, entry *models.AdminAuditLog) error {
	if entry.OccurredAt.IsZero() {
		entry.OccurredAt = time.Now().UTC()
	}
	return s.db.WithContext(ctx).Create(entry).Error
}

func (s *auditStore) List(ctx context.Context, targetType, targetID string, limit int) ([]models.AdminAuditLog, error) {
	q := s.db.WithContext(ctx).Model(&models.AdminAuditLog{})
	if targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if targetID != "" {
		q = q.Where("target_id = ?", targetID)
	}
	var out []models.AdminAuditLog
	err := q.Order("occurred_at DESC").Limit(clampLimit(limit)).Find(&out).Error
	return out, err
}
