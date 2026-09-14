/**
 * UAT variants (Feedback #2 — D-5, F0.1).
 *
 * The tester asked to see two or three versions of some screens and pick one.
 * Those versions live IN the app rather than as separate prototypes, behind a
 * floating switcher every tester can reach, so the choice is made on the real
 * data, on the real phone, with the real chrome around it.
 *
 * Three rules keep this from becoming a second product:
 *
 *   1. It only exists when `NEXT_PUBLIC_UAT_VARIANTS=1` was set at build time.
 *      In every other build the switcher does not render, cookies are ignored,
 *      and every key resolves to its default — production cannot be flipped
 *      by a stray cookie.
 *   2. The choice lives in a cookie, not localStorage, so the server renders
 *      the same variant the client will hydrate — a layout that flips after
 *      first paint is the kind of thing a tester reports as a bug.
 *   3. Every key has a default, and the default is the one that ships if the
 *      tester never picks. When they do pick, the winner is written into
 *      `docs/feedback-2-fix-list.md` §7 and the losers are deleted.
 */

export const UAT_VARIANTS_ENABLED = process.env.NEXT_PUBLIC_UAT_VARIANTS === '1';

export const VARIANTS = {
  /** F3.3 — how the trip room's eleven tabs are arranged. */
  'trip-tabs': {
    label: 'โครงหน้าทริป',
    hint: 'ลำดับและหน้าตาของแท็บในห้องทริป',
    options: [
      { id: 'a', label: 'A · แท็บเดิม + ป้ายสถานะ' },
      { id: 'b', label: 'B · จัดกลุ่ม 4 ช่วง' },
      { id: 'c', label: 'C · หน้าเดียว ทำทีละขั้น' },
    ],
    default: 'a',
  },
  /** F3.7 — the colour scale of the availability calendar. */
  'avail-colors': {
    label: 'สีปฏิทินวันว่าง',
    hint: 'สีของวันตามจำนวนคนที่ว่างตรงกัน',
    options: [
      { id: 'multi', label: 'ชุด 1 · ส้ม / ฟ้า / ชมพู / เขียว' },
      { id: 'mono', label: 'ชุด 2 · เขียวไล่เข้ม' },
    ],
    default: 'multi',
  },
  /** F5.2 / F5.3 — the landing page. */
  landing: {
    label: 'หน้าแรก',
    hint: 'เห็นได้เฉพาะตอนออกจากระบบ',
    options: [
      { id: 'a', label: 'A · โครงเดิม + คำใหม่' },
      { id: 'b', label: 'B · หน้าใหม่ทั้งหมด' },
    ],
    default: 'a',
  },
  /** F0.4 — the look of the flower characters, pending the tester's word. */
  flower: {
    label: 'หน้าตาดอกไม้',
    hint: 'ตัวละครทุกตัวเปลี่ยนตาม',
    options: [
      { id: 'limbs', label: '1 · มีแขนขา' },
      { id: 'face', label: '2 · หน้าอย่างเดียว' },
      { id: 'body', label: '3 · มีตัว + แขนขา' },
    ],
    default: 'limbs',
  },
} as const;

export type VariantKey = keyof typeof VARIANTS;
export type VariantId<K extends VariantKey> = (typeof VARIANTS)[K]['options'][number]['id'];
export type VariantSelection = { [K in VariantKey]: VariantId<K> };

export const VARIANT_KEYS = Object.keys(VARIANTS) as VariantKey[];

export function variantCookieName(key: VariantKey) {
  return `rove-variant.${key}`;
}

export function isVariantId<K extends VariantKey>(key: K, value: unknown): value is VariantId<K> {
  return VARIANTS[key].options.some((option) => option.id === value);
}

export function defaultSelection(): VariantSelection {
  const out = {} as Record<VariantKey, string>;
  for (const key of VARIANT_KEYS) out[key] = VARIANTS[key].default;
  return out as VariantSelection;
}

/**
 * The selection a request carries. `read` is whatever cookie jar the caller
 * has — `next/headers` on the server, `document.cookie` on the client — so
 * the same function answers on both sides and they cannot disagree.
 *
 * With the flag off, cookies are not even read: the answer is the defaults.
 */
export function selectionFromCookies(read: (name: string) => string | undefined): VariantSelection {
  const selection = defaultSelection();
  if (!UAT_VARIANTS_ENABLED) return selection;

  for (const key of VARIANT_KEYS) {
    const value = read(variantCookieName(key));
    if (isVariantId(key, value)) (selection as Record<VariantKey, string>)[key] = value;
  }
  return selection;
}

/** `document.cookie`, as a lookup. */
export function readBrowserCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return undefined;
}
