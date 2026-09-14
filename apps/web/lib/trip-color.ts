import type { TripColor } from '@/lib/data/model';

/**
 * The trip's own colour (Feedback #2 — D-3, ROVE_BRAND_SPEC §2.7).
 *
 * Six names, resolved to the brand pairs through Tailwind classes that are
 * written out in full here so the compiler sees them. The order MUST match
 * `domain.TripColors` in the API: both sides hash an id into this list by
 * position when a trip predates the column, and a trip that is blue on the
 * server and pink in mock mode is exactly the drift `lib/data` exists to
 * prevent.
 */
export const TRIP_COLORS: TripColor[] = ['blue', 'pink', 'yellow', 'green', 'orange', 'purple'];

export const TRIP_COLOR_LABEL: Record<TripColor, string> = {
  blue: 'ฟ้า',
  pink: 'ชมพู',
  yellow: 'เหลือง',
  green: 'เขียว',
  orange: 'ส้ม',
  purple: 'ม่วง',
};

export interface TripColorClasses {
  /** The light half — rows, bars, banners. */
  light: string;
  /** The solid half — dots, countdown accents, the calendar bar. */
  solid: string;
  text: string;
  ring: string;
  border: string;
  /** The light half at low opacity, for a hover or a hairline tint. */
  tint: string;
}

const CLASSES: Record<TripColor, TripColorClasses> = {
  blue: {
    light: 'bg-blue-light',
    solid: 'bg-blue-solid',
    text: 'text-blue-solid',
    ring: 'ring-blue-solid',
    border: 'border-blue-solid',
    tint: 'bg-blue-light/40',
  },
  pink: {
    light: 'bg-pink-light',
    solid: 'bg-pink-solid',
    text: 'text-pink-solid',
    ring: 'ring-pink-solid',
    border: 'border-pink-solid',
    tint: 'bg-pink-light/40',
  },
  yellow: {
    light: 'bg-yellow-light',
    solid: 'bg-yellow-solid',
    text: 'text-yellow-solid',
    ring: 'ring-yellow-solid',
    border: 'border-yellow-solid',
    tint: 'bg-yellow-light/40',
  },
  green: {
    light: 'bg-green-light',
    solid: 'bg-green-solid',
    text: 'text-green-solid',
    ring: 'ring-green-solid',
    border: 'border-green-solid',
    tint: 'bg-green-light/40',
  },
  orange: {
    light: 'bg-orange-light',
    solid: 'bg-orange-solid',
    text: 'text-orange-solid',
    ring: 'ring-orange-solid',
    border: 'border-orange-solid',
    tint: 'bg-orange-light/40',
  },
  purple: {
    light: 'bg-purple-light',
    solid: 'bg-purple-solid',
    text: 'text-purple-solid',
    ring: 'ring-purple-solid',
    border: 'border-purple-solid',
    tint: 'bg-purple-light/40',
  },
};

/** Hex, for the few places that paint with a style attribute (the year calendar). */
export const TRIP_COLOR_HEX: Record<TripColor, { light: string; solid: string }> = {
  blue: { light: '#B4F3FF', solid: '#40D7FF' },
  pink: { light: '#FFC7ED', solid: '#FF70D1' },
  yellow: { light: '#FFF08E', solid: '#F9D539' },
  green: { light: '#BDFFAA', solid: '#7DF55B' },
  orange: { light: '#FFC799', solid: '#FF953E' },
  purple: { light: '#DCC0FF', solid: '#B377FF' },
};

export function isTripColor(value: unknown): value is TripColor {
  return typeof value === 'string' && (TRIP_COLORS as string[]).includes(value);
}

/** CRC32 — the same hash `domain.ColorFromID` uses, so both sides agree. */
function crc32(text: string) {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i);
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A stable colour for a trip that has none stored. */
export function colorFromId(id: string): TripColor {
  return TRIP_COLORS[crc32(id) % TRIP_COLORS.length]!;
}

/** What the wire or the seed said, or the stable fallback. */
export function tripColorOf(trip: { id: string; color?: string | null }): TripColor {
  return isTripColor(trip.color) ? trip.color : colorFromId(trip.id);
}

/** A fresh colour for a new trip, never the one the last trip got. */
export function randomTripColor(exclude?: string | null): TripColor {
  const pool = TRIP_COLORS.filter((c) => c !== exclude);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function tripColorClasses(color: TripColor): TripColorClasses {
  return CLASSES[color];
}
