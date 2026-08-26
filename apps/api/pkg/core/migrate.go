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
		{
			// M6 — A6.1: candidate itineraries stored whole as snapshots, kept out
			// of plan_days so every existing trip-scoped query stays as it is.
			ID: "202608240001_plan_variants",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.PlanVariant{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("plan_variants")
			},
		},
		{
			// M18/M19 — photos and the document folder. Rows carry storage KEYS;
			// URLs are minted at read time by the storage service.
			ID: "202608240002_trip_photos_documents",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.TripPhoto{}, &models.TripDocument{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("trip_documents", "trip_photos")
			},
		},
		{
			// M9 — A9.2/A9.3: the inbox and polls. Poll answers reuse `votes`
			// with target_type='poll' and the option index in `value`.
			ID: "202608240003_community",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Notification{}, &models.Poll{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("polls", "notifications")
			},
		},
		{
			// M21 — A11.5: what people say after the trip, and what it actually
			// cost them. One row per member per trip; the unique index is what
			// makes "edit my review" a replace rather than a second opinion.
			ID: "202608250000_trip_reviews",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.TripReview{})
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("trip_reviews")
			},
		},
		{
			// M22 — A12.10/A12.11/A12.12: what points turn into, what a published
			// plan earns its creator, and the groups who asked for a human.
			ID: "202608250001_partner_economy",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.DiscountCode{},
					&models.CreatorEarning{},
					&models.Payout{},
					&models.AgentLead{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"agent_leads", "payouts", "creator_earnings", "discount_codes",
				)
			},
		},
		{
			// Indexes for the read paths the trip room hits hardest. Every one of
			// these matched a WHERE that was already indexed but an ORDER BY that
			// was not, which MySQL answers with a filesort over the whole matched
			// set — cheap on a seeded database, and the first thing to show up in
			// slow query logs once a trip has a real amount of history in it.
			//
			// Raw SQL rather than tags on the models: the sort column is usually
			// `created_at`, which lives on the embedded Base and cannot be tagged
			// per-table without putting the same index on all of them.
			ID: "202608250002_hot_path_indexes",
			Migrate: func(tx *gorm.DB) error {
				return createIndexes(tx, hotPathIndexes)
			},
			Rollback: func(tx *gorm.DB) error {
				return dropIndexes(tx, hotPathIndexes)
			},
		},
		{
			// M23 — the points ledger became something a person pages through
			// (A23.1), which turns `user_points` into a keyset-paginated read
			// with the same shape as the activity feed above.
			ID: "202608260000_points_ledger_index",
			Migrate: func(tx *gorm.DB) error {
				return createIndexes(tx, ledgerIndexes)
			},
			Rollback: func(tx *gorm.DB) error {
				return dropIndexes(tx, ledgerIndexes)
			},
		},
		{
			// M26 — the Trip Pass (A26.2). No new table: a pass is an order with
			// `kind = 'trip_pass'` and a trip on it, so what this adds is the index
			// that lookup needs, plus the raised free-draft default.
			//
			// Trips that already exist keep the two drafts they were created with.
			// Handing three to a trip halfway through planning would be a quota that
			// grew while nobody was looking, which is a stranger thing to see than a
			// number that stayed where it was.
			ID: "202608270000_trip_pass",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.AICredit{}); err != nil {
					return err
				}
				return createIndexes(tx, tripPassIndexes)
			},
			Rollback: func(tx *gorm.DB) error {
				return dropIndexes(tx, tripPassIndexes)
			},
		},
	})

	return m.Migrate()
}

// hotPathIndex is one index, named so the guard below can ask whether it is
// already there — a fresh database and an existing one take the same path.
type hotPathIndex struct {
	name    string
	table   string
	columns string
	why     string
}

var hotPathIndexes = []hotPathIndex{
	{
		name: "idx_activity_feed", table: "activity_logs", columns: "(trip_id, created_at)",
		// ListActivity: WHERE trip_id ORDER BY created_at DESC, keyset-paginated.
		// This table gains a row on every mutation anywhere in the product, so it
		// is the fastest-growing one there is, and the trip overview reads it.
		why: "trip feed, keyset-paginated",
	},
	{
		name: "idx_ai_jobs_created", table: "ai_jobs", columns: "(created_at)",
		// CostSince: SUM(cost_usd) WHERE created_at >= ?. It runs before every
		// single draft to check the daily cap, and was scanning the whole table.
		why: "daily AI cost cap",
	},
	{
		name: "idx_trips_public", table: "trips", columns: "(visibility, updated_at)",
		// ListPublic: WHERE visibility = 'public'. Nothing indexed that column, so
		// the busiest unauthenticated endpoint in the product scanned trips. Note
		// this only covers sort=new; sort=popular orders by an expression and
		// needs a stored score column instead.
		why: "explore feed",
	},
	{
		name: "idx_plan_items_order", table: "plan_items", columns: "(trip_id, sort_order)",
		// ListItems: WHERE trip_id ORDER BY sort_order. Read by the plan board,
		// the overview, validation and coverage — several times per trip request.
		why: "itinerary read",
	},
	{
		name: "idx_plan_days_order", table: "plan_days", columns: "(trip_id, day_index)",
		why: "itinerary read",
	},
	{
		name: "idx_wishlist_order", table: "wishlist_items", columns: "(trip_id, sort_order)",
		why: "wishlist and coverage read",
	},
}

// ledgerIndexes serve M23 — reading a person's own points history rather than
// summing it.
var ledgerIndexes = []hotPathIndex{
	{
		name: "idx_points_ledger", table: "user_points", columns: "(user_id, occurred_at, id)",
		// ListPage: WHERE user_id ORDER BY (occurred_at, id) DESC. `user_id`
		// alone was indexed, so every page of a long ledger sorted the whole
		// account's history to hand back thirty rows. The id is in the index
		// because it is in the ORDER BY — it is what makes the cursor stable
		// when two awards land in the same second.
		why: "points ledger, keyset-paginated",
	},
	{
		name: "idx_points_by_trip", table: "user_points", columns: "(user_id, reason, trip_id)",
		// EarnedByTrip: WHERE user_id AND reason GROUP BY trip_id — the
		// audience card's one query (A23.2).
		why: "audience card, points per published trip",
	},
}

// tripPassIndexes serve M26 — "is this trip paid for" is asked on every read of
// the AI panel and before every draft, so it is a hot path from the day it
// ships rather than one that became one later.
var tripPassIndexes = []hotPathIndex{
	{
		name: "idx_orders_trip_pass", table: "orders", columns: "(trip_id, kind, status)",
		// TripPass: WHERE trip_id AND kind AND status IN (...). `trip_id` alone
		// was indexed, which was enough while a trip had at most a receipt or two
		// and is not what this column is being asked now.
		why: "trip pass lookup",
	},
}

// createIndexes is idempotent: an index that is already there is left alone
// rather than failing the boot of every task in the service.
func createIndexes(tx *gorm.DB, indexes []hotPathIndex) error {
	for _, ix := range indexes {
		if tx.Migrator().HasIndex(ix.table, ix.name) {
			continue
		}
		if err := tx.Exec("CREATE INDEX " + ix.name + " ON " + ix.table + " " + ix.columns).Error; err != nil {
			return err
		}
	}
	return nil
}

func dropIndexes(tx *gorm.DB, indexes []hotPathIndex) error {
	for _, ix := range indexes {
		if !tx.Migrator().HasIndex(ix.table, ix.name) {
			continue
		}
		if err := tx.Exec("DROP INDEX " + ix.name + " ON " + ix.table).Error; err != nil {
			return err
		}
	}
	return nil
}
