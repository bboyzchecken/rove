import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl config (W0.6). One locale for now — DEV_SPEC §2.1: keys are
 * English, only `th` ships in Phase 1, and adding a language later is a new
 * file in messages/, not a rewrite.
 */
export default getRequestConfig(async () => {
  const locale = 'th';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
