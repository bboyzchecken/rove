/**
 * Every environment value the browser or the server may read, in one place.
 *
 * The monorepo has a single root `.env`; docker compose injects it into this
 * container. Anything not prefixed NEXT_PUBLIC_ is server-only — importing it
 * from a client component is a build error, which is the point.
 */

export const env = {
  /** Reachable from the user's browser. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  /** DEV_SPEC §15 — the name lives in env, never in a component. */
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'ROVE',
  mapsBrowserKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '',
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
} as const;

/**
 * Server-side base URL. Inside docker the API is reachable on the compose
 * network, which the browser cannot resolve — hence two different values.
 */
export const serverEnv = {
  apiUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://api:5000',
  authCookieName: process.env.AUTH_COOKIE_NAME ?? 'rove_token',
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN ?? 'localhost',
  /**
   * The API builds the OAuth `redirect_uri` from its own `WEB_BASE_URL`. The
   * exchange only succeeds when the value we send back matches that one byte
   * for byte, so the callback reads the same variable rather than guessing
   * from the request — a proxy or a container hostname would guess wrong.
   */
  webBaseUrl: process.env.WEB_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  /** Holds the OAuth `state` between the consent redirect and the callback. */
  oauthStateCookieName: 'rove_oauth_state',
  /** Where to land after sign-in, remembered across the provider round trip. */
  oauthNextCookieName: 'rove_oauth_next',
} as const;
