-- 202609140002_flower_characters — Feedback #2 (D-4)
--
-- The twenty animals become twenty flowers. New rows arrive through
-- `go run . seed` (data/characters.json); this moves every account onto the
-- flower that stands where its animal stood, and retires the animals.
--
-- ORDER MATTERS: run this before deploying the web build that ships the
-- flowers, or every migrated-late account renders as flower-01 until it does.

ALTER TABLE characters ADD COLUMN name_en VARCHAR(80) NOT NULL DEFAULT '';

UPDATE users SET character_id = CASE character_id
  WHEN 'shiba'     THEN 'flower-01'  WHEN 'cat'      THEN 'flower-02'
  WHEN 'red-panda' THEN 'flower-03'  WHEN 'bear'     THEN 'flower-04'
  WHEN 'rabbit'    THEN 'flower-05'  WHEN 'fox'      THEN 'flower-06'
  WHEN 'penguin'   THEN 'flower-07'  WHEN 'owl'      THEN 'flower-08'
  WHEN 'deer'      THEN 'flower-09'  WHEN 'hedgehog' THEN 'flower-10'
  WHEN 'capybara'  THEN 'flower-11'  WHEN 'koala'    THEN 'flower-12'
  WHEN 'panda'     THEN 'flower-13'  WHEN 'tiger'    THEN 'flower-14'
  WHEN 'otter'     THEN 'flower-15'  WHEN 'whale'    THEN 'flower-16'
  WHEN 'frog'      THEN 'flower-17'  WHEN 'sheep'    THEN 'flower-18'
  WHEN 'raccoon'   THEN 'flower-19'  WHEN 'turtle'   THEN 'flower-20'
  ELSE character_id END
WHERE character_id IS NOT NULL;

UPDATE characters SET is_active = 0 WHERE id IN (
  'shiba','cat','red-panda','bear','rabbit','fox','penguin','owl','deer','hedgehog',
  'capybara','koala','panda','tiger','otter','whale','frog','sheep','raccoon','turtle'
);
