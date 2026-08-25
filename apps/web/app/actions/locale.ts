'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/locales';

/**
 * Switching language (Phase 3).
 *
 * A server action rather than `document.cookie`: the locale is read on the
 * server by next-intl, so writing it there is the one place it can be set and
 * re-rendered in a single round trip — and it keeps working with JavaScript off.
 *
 * A year: long enough that nobody has to choose twice, short enough that a
 * shared device forgets eventually.
 */
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(next: string) {
  const store = await cookies();

  store.set(LOCALE_COOKIE, isLocale(next) ? next : DEFAULT_LOCALE, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
}
