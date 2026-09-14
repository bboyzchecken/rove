-- 202609140001_trip_steps — Feedback #2 (D-9, D-11, D-12)
--
-- `started_with` is what the group ticked on the first screen of the entry
-- flow: a JSON array of "dates" | "flights" | "stay" | "destination" |
-- "friends". The trip room orders its steps from it.
--
-- `trip_step_overrides` holds the one step status the room cannot derive from
-- its own tables: a deliberate skip ("ไม่จำเป็น"). todo / check / done are
-- computed at read time and never stored.

ALTER TABLE trips ADD COLUMN started_with JSON NULL;

CREATE TABLE trip_step_overrides (
  trip_id    CHAR(36)    NOT NULL,
  step       VARCHAR(20) NOT NULL,
  status     VARCHAR(12) NOT NULL DEFAULT 'skipped',
  by_user_id CHAR(36)    NOT NULL,
  created_at DATETIME(3) NULL,
  PRIMARY KEY (trip_id, step)
);
