package user

import (
	"context"

	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type store struct{ db *gorm.DB }

// New returns the GORM-backed models.UserStore.
func New(db *gorm.DB) models.UserStore { return &store{db: db} }

// Module wires this store into the FX graph as the UserStore interface.
var Module = fx.Module("store.user", fx.Provide(New))

func (s *store) Create(ctx context.Context, u *models.User) error {
	return s.db.WithContext(ctx).Create(u).Error
}

func (s *store) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *store) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	if err := s.db.WithContext(ctx).Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *store) GetByProvider(ctx context.Context, provider, providerUID string) (*models.User, error) {
	var u models.User
	err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_uid = ?", provider, providerUID).
		First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *store) Update(ctx context.Context, u *models.User) error {
	return s.db.WithContext(ctx).Save(u).Error
}

func (s *store) GetByHandle(ctx context.Context, handle string) (*models.User, error) {
	var u models.User
	if err := s.db.WithContext(ctx).Where("handle = ?", handle).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// ListByIDs keeps member lists and activity feeds to two queries instead of N+1.
func (s *store) ListByIDs(ctx context.Context, ids []string) ([]models.User, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var us []models.User
	err := s.db.WithContext(ctx).Where("id IN ?", ids).Find(&us).Error
	return us, err
}

func (s *store) SetCharacter(ctx context.Context, userID string, characterID int16) error {
	return s.db.WithContext(ctx).
		Model(&models.User{}).
		Where("id = ?", userID).
		Update("character_id", characterID).Error
}

func (s *store) Count(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.User{}).Count(&n).Error
	return n, err
}
