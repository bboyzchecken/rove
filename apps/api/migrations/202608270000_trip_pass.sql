-- 202608270000_trip_pass — M26 (A26.2 / A26.3)
--
-- The Trip Pass adds no table. A pass is an order with `kind = 'trip_pass'` and
-- a `trip_id` on it: `orders` already records which trip a purchase was for,
-- and a second table would be a second opinion about whether a trip was paid
-- for — the sort of disagreement that ends with somebody being charged twice.
--
-- What it does add is a read. "Is this trip paid for" is asked on every render
-- of the AI panel and before every draft, so it is a hot path from the day it
-- ships rather than one that quietly became one.
--
-- The Go side (pkg/core/migrate.go) guards each statement with HasIndex, so
-- running this against a database that already has them is a no-op.

-- TripPass: WHERE trip_id AND kind AND status IN ('paid','refunded').
-- `trip_id` alone was indexed, which was enough while a trip had at most a
-- receipt or two hanging off it, and is not what this column is asked now.
CREATE INDEX idx_orders_trip_pass ON orders (trip_id, kind, status);

-- The free trip quota went from two drafts to three (A26.3). Only the column
-- default moves: trips that already exist keep the two they were created with,
-- because a quota that grew while nobody was looking is a stranger thing to see
-- than a number that stayed where it was.
ALTER TABLE ai_credits ALTER COLUMN included SET DEFAULT 3;
