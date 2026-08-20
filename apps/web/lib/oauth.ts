/**
 * Cookie names shared by the two auth route handlers.
 *
 * They live here rather than in a route.ts because Next only allows a route
 * module to export its handlers and a fixed set of config values — exporting a
 * constant from one would fail the build.
 */

/** CSRF state, set before redirecting to the provider and verified on return. */
export const STATE_COOKIE = 'rove_oauth_state';

/** Where to send the user after a successful sign-in. */
export const RETURN_COOKIE = 'rove_return_to';

/** Ten minutes is long enough to sign in, short enough to not linger. */
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;
