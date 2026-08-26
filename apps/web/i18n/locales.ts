/**
 * What languages exist, and where the choice is stored.
 *
 * Kept apart from `request.ts` on purpose: that file reaches for
 * `next/headers`, and importing it from a client component would drag a
 * server-only API into the browser bundle. This module is plain data and is
 * safe on both sides.
 */
export const LOCALES = ['th', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Thai is the product's first language and the fallback for anything unknown. */
export const DEFAULT_LOCALE: Locale = 'th';

export const LOCALE_COOKIE = 'rove_locale';

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.includes((value ?? '') as Locale);
}
