package core

import (
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Migrate runs every registered migration in order. It is called on boot and
// is also reachable as `go run . up`.
//
// Rules (DEV_SPEC §4.1):
//   - one migration per task, id = "YYYYMMDDHHMM_short_description", never edited
//     once merged; fix mistakes with a NEW migration
//   - AutoMigrate is fine for additive changes; write raw SQL for anything that
//     rewrites data, and mirror it into ./migrations/*.sql for documentation
func Migrate(db *gorm.DB) error {
	m := gormigrate.New(db, gormigrate.DefaultOptions, []*gormigrate.Migration{
		{
			// A0.3 — first migration: the four tables Phase 0 needs to boot.
			ID: "202601010000_init_core",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.User{},
					&models.Trip{},
					&models.TripMember{},
					&models.POI{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("trip_members", "trips", "pois", "users")
			},
		},
		{
			// FULLTEXT index for the AI lookup_poi tool (DEV_SPEC §4.2).
			ID: "202601010001_poi_fulltext",
			Migrate: func(tx *gorm.DB) error {
				return tx.Exec(
					"ALTER TABLE pois ADD FULLTEXT INDEX ft_poi_names (name_th, name_en, name_ja)",
				).Error
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Exec("ALTER TABLE pois DROP INDEX ft_poi_names").Error
			},
		},
	})

	return m.Migrate()
}
