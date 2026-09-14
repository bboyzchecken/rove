-- 202609140000_trip_color — Feedback #2 (D-3, brand spec §2.7)
--
-- Every trip carries one of the six brand colours by name. Picked at random on
-- create (never the creator's most recent colour), changed only by the owner.
-- Rows older than the column are back-filled in Go with domain.ColorFromID —
-- the same CRC32-by-position hash the readers fall back to — so a trip never
-- changes colour between the migration and the first read.

ALTER TABLE trips ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '';
-- back-fill: UPDATE trips SET color = <domain.ColorFromID(id)> WHERE color = '';
