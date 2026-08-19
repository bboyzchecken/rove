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
  /** Placeholder until BRAND is decided — DEV_SPEC §15. */
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'TripPlanner',
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
} as const;
