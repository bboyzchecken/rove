/**
 * The covers a trip can wear (§15).
 *
 * One list with three readers: the cover picker offers it, a new trip starts
 * on `DEFAULT_COVER`, and the live mapper falls back to it when the API has no
 * `cover_image_url` yet. The files are generated — add the job to
 * `scripts/gen-brand-assets.mjs` first, then the entry here, or the picker
 * offers a 404.
 *
 * "vibe" covers come first on purpose: we only drew six destinations, and a
 * trip to the seventh is better served by what it feels like than by a
 * skyline that belongs to somewhere else.
 */
export interface CoverOption {
  id: string;
  src: string;
  label: string;
  group: 'vibe' | 'destination';
}

/** Every cover is drawn — and every upload is cropped — to this frame. */
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 800;

export const COVERS: CoverOption[] = [
  {
    id: 'placeholder',
    src: '/brand/covers/cover-placeholder.webp',
    label: 'แผนที่',
    group: 'vibe',
  },
  { id: 'beach', src: '/brand/covers/cover-beach.webp', label: 'ทะเล เกาะ', group: 'vibe' },
  {
    id: 'mountain',
    src: '/brand/covers/cover-mountain.webp',
    label: 'ภูเขา เดินป่า',
    group: 'vibe',
  },
  { id: 'city', src: '/brand/covers/cover-city.webp', label: 'เมืองใหญ่', group: 'vibe' },
  { id: 'roadtrip', src: '/brand/covers/cover-roadtrip.webp', label: 'โรดทริป', group: 'vibe' },
  { id: 'snow', src: '/brand/covers/cover-snow.webp', label: 'หิมะ', group: 'vibe' },
  { id: 'desert', src: '/brand/covers/cover-desert.webp', label: 'ทะเลทราย', group: 'vibe' },
  { id: 'food', src: '/brand/covers/cover-food.webp', label: 'สายกิน', group: 'vibe' },
  { id: 'festival', src: '/brand/covers/cover-festival.webp', label: 'เทศกาล', group: 'vibe' },
  { id: 'japan', src: '/brand/covers/cover-japan.webp', label: 'ญี่ปุ่น', group: 'destination' },
  { id: 'korea', src: '/brand/covers/cover-korea.webp', label: 'เกาหลี', group: 'destination' },
  {
    id: 'vietnam',
    src: '/brand/covers/cover-vietnam.webp',
    label: 'เวียดนาม',
    group: 'destination',
  },
  { id: 'thailand', src: '/brand/covers/cover-thailand.webp', label: 'ไทย', group: 'destination' },
  {
    id: 'iceland',
    src: '/brand/covers/cover-iceland.webp',
    label: 'ไอซ์แลนด์',
    group: 'destination',
  },
  { id: 'europe', src: '/brand/covers/cover-europe.webp', label: 'ยุโรป', group: 'destination' },
];

/**
 * What a trip wears until someone picks something else.
 *
 * Neutral by design: a trip with no cover yet used to open on the Japan
 * illustration, which told the room something about a destination nobody had
 * chosen.
 */
export const DEFAULT_COVER = '/brand/covers/cover-placeholder.webp';

/** An uploaded cover is a data URL, so "is this one of ours" is a prefix test. */
export function isBuiltInCover(src: string) {
  return COVERS.some((cover) => cover.src === src);
}
