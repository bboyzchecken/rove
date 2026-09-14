/**
 * Writes the flower characters out of `apps/web/lib/catalog/flowers.ts`
 * (Feedback #2 — F0.4):
 *
 *   apps/web/public/characters/flower-NN.svg   one file per character
 *   apps/api/data/characters.json              what the API seeds
 *
 * Run from the repo root with Node 22 or newer — it loads the TypeScript spec
 * directly through Node's type stripping, so there is no build step and no
 * second copy of the geometry:
 *
 *   node --experimental-strip-types scripts/gen-flower-characters.mjs [--look limbs|face|body]
 *
 * The look defaults to `limbs` — the interpretation of the tester's note at
 * 0:32 (arms and legs, symmetric face) — and is the thing to re-run with once
 * the tester has picked. The avatar in the app draws from the same spec at
 * render time and follows the UAT switcher, so these files only matter for
 * places that need a URL: the API's catalogue and anything static.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLOWER_LOOKS, FLOWER_SET, flowerSvg } from '../apps/web/lib/catalog/flowers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/public/characters');
const apiJson = join(root, 'apps/api/data/characters.json');

const lookArg = process.argv.indexOf('--look');
const look = lookArg > -1 ? process.argv[lookArg + 1] : 'limbs';
if (!FLOWER_LOOKS.includes(look)) {
  console.error(`unknown look "${look}" — one of ${FLOWER_LOOKS.join(', ')}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// The animals go: a stale bitmap next to the flowers is a file somebody will
// eventually link to by mistake.
for (const file of readdirSync(outDir)) {
  if (file.startsWith('char-') && file.endsWith('.webp')) unlinkSync(join(outDir, file));
}

const ACCENT = { blue: 'blue', pink: 'pink', yellow: 'yellow', green: 'green', orange: 'yellow', purple: 'primary' };

const seeds = FLOWER_SET.map((seed, index) => {
  writeFileSync(join(outDir, `${seed.id}.svg`), flowerSvg(seed.flower, look, { label: seed.name }) + '\n');
  return {
    id: seed.id,
    name_th: seed.name,
    name_en: seed.nameEn,
    image_url: `/characters/${seed.id}.svg`,
    accent: ACCENT[seed.flower.petal.split('-')[0]],
    sort_order: index + 1,
  };
});

writeFileSync(apiJson, JSON.stringify(seeds, null, 2) + '\n');
console.log(`wrote ${seeds.length} characters (look: ${look}) → ${outDir} and ${apiJson}`);
