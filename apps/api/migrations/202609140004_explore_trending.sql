-- 202609140004_explore_trending — Feedback #2 (D-18)
--
-- "ติดเทรนด์" ranks public plans by views in the last seven days against the
-- seven before, which needs a per-day series next to the lifetime counter.
-- Both are bumped in the same place (handlePublicTrip). Rows older than a
-- month are never read and may be pruned by hand.
--
-- "มาใหม่" is ordered by when a plan was first published, not by updated_at.

CREATE TABLE trip_view_daily (
  trip_id CHAR(36) NOT NULL,
  day     DATE     NOT NULL,
  views   INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, day)
);

ALTER TABLE trips ADD COLUMN published_at DATETIME(3) NULL;
UPDATE trips SET published_at = updated_at WHERE visibility = 'public' AND published_at IS NULL;
