/**
 * The flower characters (Feedback #2 — D-4, F0.4).
 *
 * The twenty animals are replaced by twenty flowers: eight petals, symmetric,
 * flat solid fill, no outline, a face in the middle. Each one is a FIXED SET
 * — a background tile, a petal colour, a centre colour and a face — so nobody
 * mixes their own and the roster reads as one family.
 *
 * Drawn as SVG from this spec rather than generated as bitmaps. The shapes are
 * simple enough that geometry beats a model on consistency (brand spec §7.5
 * says the same of the doodles), it costs nothing to change a face, and one
 * spec drives three things that must agree: the avatar in the app, the static
 * files under `public/characters/`, and the API's `characters.json`
 * (`scripts/gen-flower-characters.mjs` writes the latter two from here).
 *
 * THIS FILE HAS NO IMPORTS ON PURPOSE. The generator runs it under plain Node
 * with type stripping, and an `@/` alias or a bare `./flowers` specifier would
 * not resolve there.
 *
 * The LOOK is still the tester's call (fix-list §8 — "หน้าตาดอกไม้"): the
 * voice memo at 0:32 asked for arms and legs like the pink reference but a
 * symmetric face like the purple and yellow ones. Three looks ship behind the
 * UAT switcher and the winner becomes the only one.
 */

export type FlowerHue = 'blue' | 'pink' | 'yellow' | 'green' | 'orange' | 'purple';
export type FlowerShade = 'light' | 'solid';
export type FlowerColor = `${FlowerHue}-${FlowerShade}`;
export type FlowerFace = 'smile' | 'grin' | 'wink' | 'sleepy' | 'surprised' | 'happy' | 'cool';
/** How much of a body the flower has — see the note at the top. */
export type FlowerLook = 'limbs' | 'face' | 'body';

export const FLOWER_LOOKS: FlowerLook[] = ['limbs', 'face', 'body'];

export interface FlowerSpec {
  /** The tile behind the flower — a light pastel, never the petal hue. */
  bg: FlowerColor;
  petal: FlowerColor;
  center: FlowerColor;
  face: FlowerFace;
}

export interface FlowerCharacterSeed {
  id: string;
  /** Kept from the animal it replaces — D-4: names stay. */
  name: string;
  nameEn: string;
  flower: FlowerSpec;
}

/** Brand spec §2.2, as hex — the SVG cannot read CSS variables in a file. */
export const FLOWER_HEX: Record<FlowerColor, string> = {
  'blue-light': '#B4F3FF',
  'blue-solid': '#40D7FF',
  'pink-light': '#FFC7ED',
  'pink-solid': '#FF70D1',
  'yellow-light': '#FFF08E',
  'yellow-solid': '#F9D539',
  'green-light': '#BDFFAA',
  'green-solid': '#7DF55B',
  'orange-light': '#FFC799',
  'orange-solid': '#FF953E',
  'purple-light': '#DCC0FF',
  'purple-solid': '#B377FF',
};

const INK = '#000000';

/**
 * The twenty, in the order of the animals they replace — `flower-01` stands
 * where `shiba` stood, so `users.character_id` migrates by position.
 *
 * Twelve colours cannot give twenty petals a colour each, which is why D-4
 * says "ถ้าสีไม่ครบ ให้หน้าตาต่างกันแทน": no two rows share the same petal,
 * centre AND face.
 */
export const FLOWER_SET: FlowerCharacterSeed[] = [
  { id: 'flower-01', name: 'ชิบะ', nameEn: 'Shiba', flower: { bg: 'yellow-light', petal: 'pink-solid', center: 'yellow-solid', face: 'smile' } },
  { id: 'flower-02', name: 'แมวส้ม', nameEn: 'Orange cat', flower: { bg: 'blue-light', petal: 'orange-solid', center: 'yellow-light', face: 'grin' } },
  { id: 'flower-03', name: 'เรดแพนด้า', nameEn: 'Red panda', flower: { bg: 'green-light', petal: 'pink-light', center: 'pink-solid', face: 'wink' } },
  { id: 'flower-04', name: 'หมีน้อย', nameEn: 'Little bear', flower: { bg: 'pink-light', petal: 'yellow-solid', center: 'orange-solid', face: 'happy' } },
  { id: 'flower-05', name: 'กระต่าย', nameEn: 'Rabbit', flower: { bg: 'purple-light', petal: 'blue-light', center: 'blue-solid', face: 'sleepy' } },
  { id: 'flower-06', name: 'จิ้งจอก', nameEn: 'Fox', flower: { bg: 'blue-light', petal: 'orange-light', center: 'orange-solid', face: 'cool' } },
  { id: 'flower-07', name: 'เพนกวิน', nameEn: 'Penguin', flower: { bg: 'yellow-light', petal: 'blue-solid', center: 'blue-light', face: 'surprised' } },
  { id: 'flower-08', name: 'นกฮูก', nameEn: 'Owl', flower: { bg: 'orange-light', petal: 'purple-solid', center: 'yellow-solid', face: 'smile' } },
  { id: 'flower-09', name: 'กวางน้อย', nameEn: 'Fawn', flower: { bg: 'pink-light', petal: 'green-solid', center: 'green-light', face: 'grin' } },
  { id: 'flower-10', name: 'เม่นแคระ', nameEn: 'Hedgehog', flower: { bg: 'green-light', petal: 'purple-light', center: 'purple-solid', face: 'wink' } },
  { id: 'flower-11', name: 'คาปิบารา', nameEn: 'Capybara', flower: { bg: 'orange-light', petal: 'green-light', center: 'green-solid', face: 'sleepy' } },
  { id: 'flower-12', name: 'โคอาลา', nameEn: 'Koala', flower: { bg: 'pink-light', petal: 'blue-light', center: 'purple-solid', face: 'happy' } },
  { id: 'flower-13', name: 'แพนด้า', nameEn: 'Panda', flower: { bg: 'blue-light', petal: 'yellow-light', center: 'pink-solid', face: 'cool' } },
  { id: 'flower-14', name: 'เสือน้อย', nameEn: 'Tiger cub', flower: { bg: 'green-light', petal: 'orange-solid', center: 'yellow-solid', face: 'grin' } },
  { id: 'flower-15', name: 'นาก', nameEn: 'Otter', flower: { bg: 'yellow-light', petal: 'purple-light', center: 'blue-solid', face: 'surprised' } },
  { id: 'flower-16', name: 'วาฬ', nameEn: 'Whale', flower: { bg: 'orange-light', petal: 'blue-solid', center: 'pink-light', face: 'smile' } },
  { id: 'flower-17', name: 'กบ', nameEn: 'Frog', flower: { bg: 'purple-light', petal: 'green-solid', center: 'yellow-light', face: 'happy' } },
  { id: 'flower-18', name: 'แกะ', nameEn: 'Sheep', flower: { bg: 'blue-light', petal: 'pink-light', center: 'orange-solid', face: 'sleepy' } },
  { id: 'flower-19', name: 'แรคคูน', nameEn: 'Raccoon', flower: { bg: 'yellow-light', petal: 'purple-solid', center: 'green-light', face: 'wink' } },
  { id: 'flower-20', name: 'เต่า', nameEn: 'Turtle', flower: { bg: 'pink-light', petal: 'green-light', center: 'blue-solid', face: 'cool' } },
];

/** The animals, by position, for migrating a stored id (web) and users (API). */
export const LEGACY_CHARACTER_IDS = [
  'shiba', 'cat', 'red-panda', 'bear', 'rabbit', 'fox', 'penguin', 'owl', 'deer', 'hedgehog',
  'capybara', 'koala', 'panda', 'tiger', 'otter', 'whale', 'frog', 'sheep', 'raccoon', 'turtle',
];

/* ------------------------------------------------------------- drawing --- */

/**
 * The face, drawn in ink around (50, 50). Eyes ~7 units apart, mouth 5 below.
 * Solid fills only — the mouths that are strokes are thick and round-capped,
 * which at avatar size reads as a filled shape, not as an outline.
 */
function facePaths(face: FlowerFace): string {
  const dotEyes = `<circle cx="44" cy="47" r="2.4" fill="${INK}"/><circle cx="56" cy="47" r="2.4" fill="${INK}"/>`;
  const smile = `<path d="M44.5 54 Q50 59.5 55.5 54" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  const grin = `<path d="M43 53.5 Q50 62.5 57 53.5 Z" fill="${INK}"/>`;
  const closed = (cx: number) =>
    `<path d="M${cx - 2.6} 47 Q${cx} 49.6 ${cx + 2.6} 47" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  const arch = (cx: number) =>
    `<path d="M${cx - 2.6} 48.2 Q${cx} 44.6 ${cx + 2.6} 48.2" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;

  switch (face) {
    case 'smile':
      return dotEyes + smile;
    case 'grin':
      return dotEyes + grin;
    case 'wink':
      return `<circle cx="44" cy="47" r="2.4" fill="${INK}"/>` + closed(56) + smile;
    case 'sleepy':
      return (
        closed(44) +
        closed(56) +
        `<path d="M47 55 Q50 57.4 53 55" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
      );
    case 'surprised':
      return (
        `<circle cx="44" cy="46.5" r="2.7" fill="${INK}"/><circle cx="56" cy="46.5" r="2.7" fill="${INK}"/>` +
        `<circle cx="50" cy="56" r="2.8" fill="${INK}"/>`
      );
    case 'happy':
      return arch(44) + arch(56) + grin;
    case 'cool':
      return (
        `<rect x="39.5" y="44.5" width="8" height="5" rx="2.2" fill="${INK}"/>` +
        `<rect x="52.5" y="44.5" width="8" height="5" rx="2.2" fill="${INK}"/>` +
        `<path d="M47.5 47 L52.5 47" stroke="${INK}" stroke-width="1.6"/>` +
        smile
      );
  }
}

/** Eight petals around (50, 50), tips at radius `reach`. */
function petals(fill: string, reach: number) {
  const ry = reach * 0.46;
  const rx = ry * 0.56;
  const cy = 50 - reach + ry;
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += `<ellipse cx="50" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fill}" transform="rotate(${i * 45} 50 50)"/>`;
  }
  return out;
}

function limb(x1: number, y1: number, x2: number, y2: number, width = 3.6) {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
}

/**
 * The whole character as an SVG string, 100×100 viewBox. `label` becomes the
 * accessible name; leave it out for a purely decorative use.
 */
export function flowerSvg(
  spec: FlowerSpec,
  look: FlowerLook = 'limbs',
  options: { label?: string; background?: boolean } = {},
): string {
  const { label, background = true } = options;
  const bg = background ? `<rect width="100" height="100" fill="${FLOWER_HEX[spec.bg]}"/>` : '';
  const petal = FLOWER_HEX[spec.petal];
  const center = FLOWER_HEX[spec.center];

  let body = '';
  if (look === 'face') {
    body = petals(petal, 44) + `<circle cx="50" cy="50" r="15.5" fill="${center}"/>` + facePaths(spec.face);
  } else if (look === 'limbs') {
    // Arms out of the petals at ten and two o'clock, legs straight down. The
    // head stays where the face-only look has it, so switching looks does not
    // make the roster jump.
    body =
      limb(23, 64, 12, 74) +
      limb(77, 64, 88, 74) +
      limb(45.5, 88, 43, 97) +
      limb(54.5, 88, 57, 97) +
      petals(petal, 42) +
      `<circle cx="50" cy="50" r="15" fill="${center}"/>` +
      facePaths(spec.face);
  } else {
    // A small torso in the petal colour under a head lifted to make room, arms
    // off the torso — the pink reference from the voice memo, made symmetric.
    body =
      `<g transform="translate(0 -9)">` +
      petals(petal, 38) +
      `<circle cx="50" cy="50" r="13.5" fill="${center}"/>` +
      facePaths(spec.face) +
      `</g>` +
      `<rect x="41" y="72" width="18" height="17" rx="7" fill="${petal}"/>` +
      limb(42, 78, 31, 73) +
      limb(58, 78, 69, 73) +
      limb(45.5, 88, 44, 97) +
      limb(54.5, 88, 56, 97);
  }

  const a11y = label
    ? `role="img" aria-label="${escapeAttr(label)}"`
    : 'role="presentation" aria-hidden="true"';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${a11y}>${bg}${body}</svg>`;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
