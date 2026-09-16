// Package kyc stores creator verification, payout accounts, OTP challenges and
// payout cycles (Feedback #4 — F11).
package kyc

import (
	"context"
	"errors"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.KYCStore { return &store{db: db} }

func NewCycleStore(db *gorm.DB) models.PayoutCycleStore { return &cycleStore{db: db} }

var Module = fx.Module("store.kyc", fx.Provide(New, NewCycleStore))

func (s *store) GetByUser(ctx context.Context, userID string) (*models.CreatorVerification, error) {
	var out models.CreatorVerification
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) Get(ctx context.Context, id string) (*models.CreatorVerification, error) {
	var out models.CreatorVerification
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) Save(ctx context.Context, v *models.CreatorVerification) error {
	return s.db.WithContext(ctx).Save(v).Error
}

func (s *store) List(ctx context.Context, status string, limit int) ([]models.CreatorVerification, error) {
	q := s.db.WithContext(ctx).Model(&models.CreatorVerification{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var out []models.CreatorVerification
	err := q.Order("COALESCE(submitted_at, updated_at) ASC").Limit(limit).Find(&out).Error
	return out, err
}

func (s *store) IDHashTaken(ctx context.Context, hash, exceptUserID string) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&models.CreatorVerification{}).
		Where("id_number_hash = ? AND user_id <> ? AND status IN ?", hash, exceptUserID,
			[]string{models.KYCSubmitted, models.KYCApproved, models.KYCRejected, models.KYCRevoked}).
		Count(&count).Error
	return count > 0, err
}

func (s *store) CurrentAccount(ctx context.Context, userID string) (*models.PayoutAccount, error) {
	var out models.PayoutAccount
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND status <> ?", userID, models.AccountReplaced).
		Order("created_at DESC").
		First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) GetAccount(ctx context.Context, id string) (*models.PayoutAccount, error) {
	var out models.PayoutAccount
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) ReplaceAccount(ctx context.Context, account *models.PayoutAccount) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.PayoutAccount{}).
			Where("user_id = ? AND status <> ?", account.UserID, models.AccountReplaced).
			Update("status", models.AccountReplaced).Error; err != nil {
			return err
		}
		return tx.Create(account).Error
	})
}

func (s *store) SaveAccount(ctx context.Context, account *models.PayoutAccount) error {
	return s.db.WithContext(ctx).Save(account).Error
}

func (s *store) UsersSharingAccount(ctx context.Context, hash, exceptUserID string) ([]string, error) {
	var ids []string
	err := s.db.WithContext(ctx).Model(&models.PayoutAccount{}).
		Where("number_hash = ? AND user_id <> ?", hash, exceptUserID).
		Distinct().
		Pluck("user_id", &ids).Error
	return ids, err
}

func (s *store) PendingAccountChanges(ctx context.Context, limit int) ([]models.PayoutAccount, error) {
	var out []models.PayoutAccount
	err := s.db.WithContext(ctx).
		Joins("JOIN creator_verifications cv ON cv.user_id = payout_accounts.user_id").
		Where("payout_accounts.status = ? AND cv.status = ?", models.AccountPending, models.KYCApproved).
		Order("payout_accounts.created_at ASC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

func (s *store) CreateOTP(ctx context.Context, otp *models.OTPChallenge) error {
	return s.db.WithContext(ctx).Create(otp).Error
}

func (s *store) LatestOTP(ctx context.Context, userID, channel string) (*models.OTPChallenge, error) {
	var out models.OTPChallenge
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND channel = ?", userID, channel).
		Order("created_at DESC").
		First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *store) SaveOTP(ctx context.Context, otp *models.OTPChallenge) error {
	return s.db.WithContext(ctx).Save(otp).Error
}

func (s *store) MarkNotice(ctx context.Context, earningID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&models.EarningNotice{}).Where("earning_id = ?", earningID).Count(&count).Error; err != nil {
		return false, err
	}
	if count > 0 {
		return false, nil
	}
	if err := s.db.WithContext(ctx).Create(&models.EarningNotice{EarningID: earningID}).Error; err != nil {
		// The unique index lost a race — somebody else noticed it first.
		return false, nil
	}
	return true, nil
}

/* ------------------------------------------------------------- cycles ---- */

type cycleStore struct{ db *gorm.DB }

func (s *cycleStore) List(ctx context.Context) ([]models.PayoutCycle, error) {
	var out []models.PayoutCycle
	err := s.db.WithContext(ctx).Order("cutoff_date DESC").Find(&out).Error
	return out, err
}

func (s *cycleStore) Get(ctx context.Context, id string) (*models.PayoutCycle, error) {
	var out models.PayoutCycle
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *cycleStore) Create(ctx context.Context, cycle *models.PayoutCycle) error {
	return s.db.WithContext(ctx).Create(cycle).Error
}

func (s *cycleStore) Update(ctx context.Context, cycle *models.PayoutCycle) error {
	return s.db.WithContext(ctx).Save(cycle).Error
}

func (s *cycleStore) NextOpen(ctx context.Context) (*models.PayoutCycle, error) {
	var out models.PayoutCycle
	err := s.db.WithContext(ctx).Where("status = ?", models.CycleOpen).Order("cutoff_date ASC").First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *cycleStore) CreatePayout(ctx context.Context, payout *models.Payout) error {
	return s.db.WithContext(ctx).Create(payout).Error
}

func (s *cycleStore) GetPayout(ctx context.Context, id string) (*models.Payout, error) {
	var out models.Payout
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *cycleStore) UpdatePayout(ctx context.Context, payout *models.Payout) error {
	return s.db.WithContext(ctx).Save(payout).Error
}

func (s *cycleStore) PayoutsForCycle(ctx context.Context, cycleID string) ([]models.Payout, error) {
	var out []models.Payout
	err := s.db.WithContext(ctx).Where("cycle_id = ?", cycleID).Order("amount_thb DESC").Find(&out).Error
	return out, err
}
