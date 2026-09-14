-- 202609140003_dream_country — Feedback #2 (D-19)
--
-- A dream on the home screen flies the flag of where it is, which needs a
-- country code beside the Thai "ประเทศ · เมือง" string M15 stored. Older rows
-- keep '' and the web guesses from the name they already hold.

ALTER TABLE dream_items ADD COLUMN country VARCHAR(2) NOT NULL DEFAULT '';
