-- 202608260000_points_ledger_index — M23 (A23.1 / A23.2)
--
-- Points redeem for money off at a published rate (A12.10), so the ledger
-- stopped being a number on a profile card and became something a person pages
-- through line by line. That changes how `user_points` is read: from
-- SUM(delta) WHERE user_id — which the existing single-column index served
-- fine — to a keyset walk ordered by (occurred_at, id), which it does not.
--
-- Same shape as idx_activity_feed in the previous migration, and for the same
-- reason: the WHERE was indexed, the ORDER BY was not, so MySQL sorted the
-- whole account's history to return thirty rows.
--
-- The Go side (pkg/core/migrate.go) guards each statement with HasIndex, so
-- running this against a database that already has them is a no-op.

-- ListPage: WHERE user_id ORDER BY occurred_at DESC, id DESC.
-- `id` is in the index because it is in the ORDER BY — it is what makes the
-- cursor stable when a clone award and a publish bonus land in the same second.
CREATE INDEX idx_points_ledger ON user_points (user_id, occurred_at, id);

-- EarnedByTrip: WHERE user_id AND reason GROUP BY trip_id — one query behind
-- the whole audience card, instead of one per published trip.
CREATE INDEX idx_points_by_trip ON user_points (user_id, reason, trip_id);
