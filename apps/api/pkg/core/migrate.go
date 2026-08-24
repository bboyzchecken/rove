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
		{
			// Phase 1 — every table the MVP needs, in one migration because they
			// ship together: a half-migrated database has no useful state.
			ID: "202601020000_phase1_core",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.Character{},
					&models.UserPoints{},
					&models.Invite{},
					&models.DreamItem{},
					&models.Availability{},
					&models.AvailabilitySubmission{},
					&models.WishlistItem{},
					&models.Plan{},
					&models.PlanDay{},
					&models.PlanItem{},
					&models.ItemVersion{},
					&models.ExpenseEntry{},
					&models.Settlement{},
					&models.PrepTask{},
					&models.PrepNote{},
					&models.Booking{},
					&models.BookingClick{},
					&models.Comment{},
					&models.Vote{},
					&models.Activity{},
					&models.AIJob{},
					&models.AICredit{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"ai_credits", "ai_jobs", "activity_logs", "votes", "comments",
					"booking_clicks", "bookings", "prep_notes", "prep_tasks",
					"expense_settlements", "expense_entries", "item_versions",
					"plan_items", "plan_days", "plans", "wishlist_items",
					"trip_availability_submissions", "trip_availability",
					"dream_items", "invites", "user_points", "characters",
				)
			},
		},
		{
			// The columns Phase 1 adds to tables that already existed.
			ID: "202601020001_phase1_trip_user_columns",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Trip{}, &models.User{})
			},
			Rollback: func(tx *gorm.DB) error {
				for _, col := range []string{
					"budget_per_person_thb", "dates_locked_at", "dates_locked_by", "destination_id",
				} {
					if err := tx.Migrator().DropColumn(&models.Trip{}, col); err != nil {
						return err
					}
				}
				for _, col := range []string{"character_id", "referred_by"} {
					if err := tx.Migrator().DropColumn(&models.User{}, col); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			// M1 — A1.3: the route a trip is built on. A trip that starts from
			// "BKK→NRT, 4 Dec, lands 08:05" keeps those legs; the frame (dates,
			// destinations, country) is derived from them rather than typed.
			ID: "202608200000_trip_flights",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.TripFlight{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("trip_flights")
			},
		},
		{
			// M20 — A20.1: bill & payment. Orders carry every purchase, whatever
			// was sold; `subscriptions` is empty until billing turns on, and ships
			// now so that the day it does is a deploy and not a migration on a
			// table people are already buying from.
			ID: "202608210000_billing",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Order{}, &models.Subscription{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("orders", "subscriptions")
			},
		},
		{
			// M3 — A3.1: what each member wants out of THIS trip. Account-level
			// profiles already exist; this table is the per-trip layer the AI frame
			// and the conflict detector (A6.5) read.
			ID: "202608240000_member_profiles",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.MemberProfile{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("member_profiles")
			},
		},
	})

	return m.Migrate()
}
