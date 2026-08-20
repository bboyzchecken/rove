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
			// A14.3 — characters seed table + users.character_id.
			ID: "202601020000_characters",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.Character{}); err != nil {
					return err
				}
				return tx.AutoMigrate(&models.User{})
			},
			Rollback: func(tx *gorm.DB) error {
				if tx.Migrator().HasColumn(&models.User{}, "character_id") {
					if err := tx.Migrator().DropColumn(&models.User{}, "character_id"); err != nil {
						return err
					}
				}
				return tx.Migrator().DropTable("characters")
			},
		},
		{
			// A15.1 / §4.2 — per-user tables that live outside any trip.
			ID: "202601020001_user_points_and_dreams",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.UserPoints{},
					&models.PointsTransaction{},
					&models.DreamItem{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("dream_items", "points_transactions", "user_points")
			},
		},
		{
			// A2.x / A3.x — the trip room: invites, flights, profiles, wishlist.
			ID: "202601020002_trip_room",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.TripInvite{},
					&models.TripFlight{},
					&models.MemberProfile{},
					&models.WishlistItem{},
					&models.ActivityLog{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"activity_logs", "wishlist_items", "member_profiles",
					"trip_flights", "trip_invites",
				)
			},
		},
		{
			// A4.x / A5.x — the itinerary itself.
			ID: "202601020003_plans_and_items",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.Plan{},
					&models.Day{},
					&models.Item{},
					&models.ItemVersion{},
					&models.Rationale{},
					&models.AIJob{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"ai_jobs", "rationales", "item_versions", "items", "days", "plans",
				)
			},
		},
		{
			// A16.1 — real spending, deliberately separate from the estimate.
			ID: "202601020004_expenses",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.ExpenseEntry{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("expense_entries")
			},
		},
		{
			// A8.x / A9.x — prep blocks, comments, votes.
			ID: "202601020005_prep_and_collab",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.PrepBlock{},
					&models.Comment{},
					&models.Vote{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("votes", "comments", "prep_blocks")
			},
		},
		{
			// A12.x — affiliate tracking and the clone edge points walk.
			ID: "202601020006_booking",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.AffiliatePartner{},
					&models.BookingClick{},
					&models.BookingConfirmation{},
					&models.PlanClone{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"plan_clones", "booking_confirmations", "booking_clicks", "affiliate_partners",
				)
			},
		},
		{
			// §4.2 caches — the durable copy behind the Redis cache.
			ID: "202601020007_caches",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.DistanceCache{},
					&models.WeatherCache{},
					&models.FXCache{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("fx_cache", "weather_cache", "distance_cache")
			},
		},
		{
			// M16 — public trips must never leak expense. Column added last so
			// the default applies to every row that already existed.
			ID: "202601020008_trip_public_hide_expense",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Trip{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropColumn(&models.Trip{}, "public_hide_expense")
			},
		},
	})

	return m.Migrate()
}
