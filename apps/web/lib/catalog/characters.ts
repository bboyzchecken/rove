import type { Character } from '@/lib/data/model';

import { FLOWER_SET, LEGACY_CHARACTER_IDS, type FlowerHue } from './flowers';

/**
 * The 20 fixed characters (DEV_SPEC M14) — flowers since Feedback #2 (D-4).
 *
 * The same list is seeded server-side from `apps/api/data/characters.json`,
 * which `scripts/gen-flower-characters.mjs` writes from the same `FLOWER_SET`
 * — keep the ids identical on both sides.
 *
 * Real catalogue data, used in both modes — which is why it lives in
 * `lib/catalog/` and not, as it used to, in a folder called `mock`.
 */

/** The picker tints its tile with the petal's hue family, as before. */
const ACCENT_OF: Record<FlowerHue, Character['accent']> = {
  blue: 'blue',
  pink: 'pink',
  yellow: 'yellow',
  green: 'green',
  orange: 'yellow',
  purple: 'primary',
};

export const CHARACTERS: Character[] = FLOWER_SET.map((seed) => ({
  id: seed.id,
  name: seed.name,
  nameEn: seed.nameEn,
  image: `/characters/${seed.id}.svg`,
  accent: ACCENT_OF[seed.flower.petal.split('-')[0] as FlowerHue],
  flower: seed.flower,
}));

/**
 * Who someone is until they pick (§15). Replaces the twenty-odd `?? 'shiba'`
 * that used to be written out by hand — the id changed once and every one of
 * them would have had to change with it.
 */
export const DEFAULT_CHARACTER_ID = CHARACTERS[0]!.id;

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

/** `shiba` → `flower-01`, by position — the same map the API migration runs. */
const LEGACY = new Map(LEGACY_CHARACTER_IDS.map((id, index) => [id, CHARACTERS[index]!]));

export function getCharacter(id: string): Character {
  // A stored animal id still resolves: a UAT browser holding last round's
  // localStorage, or an API row the migration has not reached, both land on
  // the flower that took the animal's place rather than on a hole.
  const found = BY_ID.get(id) ?? LEGACY.get(id);
  // A missing character would be a seed bug, not a user state — fail loudly in
  // dev by falling back to the first one rather than rendering a hole.
  return found ?? CHARACTERS[0]!;
}

/** The flower id an old animal id maps to; unknown ids pass through. */
export function migrateCharacterId(id: string): string {
  return BY_ID.has(id) ? id : (LEGACY.get(id)?.id ?? id);
}
