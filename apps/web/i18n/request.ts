import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';

/**
 * next-intl config (W0.6, second language in Phase 3).
 *
 * Keys are English, Thai is the product's first language, and the locale comes
 * from a cookie rather than the URL: this is one product for one audience, and
 * an `/en` prefix on every route would fork every share link and every OG tag
 * for a preference that belongs to a person, not to a page.
 *
 * Only the keys in `messages/` are translated today — most screen copy is
 * still Thai inside the components — which is why the switcher says so.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(chosen) ? chosen : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
