-- 202608250002_hot_path_indexes — performance
--
-- Six indexes for the read paths the trip room hits hardest. In every case the
-- WHERE was already indexed and the ORDER BY was not, which MySQL answers with
-- a filesort over the whole matched set: invisible on a seeded database, and
-- the first thing in the slow query log once a trip has real history behind it.
--
-- Written as raw SQL rather than as tags on the models because the sort column
-- is usually `created_at`, which lives on the embedded Base struct and cannot
-- be tagged for one table without landing on all of them.
--
-- The Go side (pkg/core/migrate.go) guards each statement with HasIndex, so it
-- is safe to run against a database that already has some of these.

-- ListActivity: WHERE trip_id ORDER BY created_at DESC, keyset-paginated.
-- activity_logs gains a row on every mutation anywhere in the product, so it is
-- the fastest-growing table there is — and the trip overview reads it.
CREATE INDEX idx_activity_feed ON activity_logs (trip_id, created_at);

-- CostSince: SUM(cost_usd) WHERE created_at >= ?. Runs before every draft to
-- check the daily cap, and was a full scan of a table that only ever grows.
CREATE INDEX idx_ai_jobs_created ON ai_jobs (created_at);

-- ListPublic: WHERE visibility = 'public'. Nothing indexed that column, so the
-- busiest unauthenticated endpoint in the product scanned trips.
--
-- This covers sort=new only. sort=popular orders by (view_count + clone_count *
-- 5), an expression no index can serve — that one needs a stored score column,
-- which is a separate change.
CREATE INDEX idx_trips_public ON trips (visibility, updated_at);

-- ListItems: WHERE trip_id ORDER BY sort_order. Read by the plan board, the
-- overview, validation and coverage — several times within one trip request.
CREATE INDEX idx_plan_items_order ON plan_items (trip_id, sort_order);

-- ListDays: WHERE trip_id ORDER BY day_index.
CREATE INDEX idx_plan_days_order ON plan_days (trip_id, day_index);

-- ListByTrip: WHERE trip_id ORDER BY sort_order, created_at.
CREATE INDEX idx_wishlist_order ON wishlist_items (trip_id, sort_order);
