import 'server-only';

import { cookies } from 'next/headers';

import { serverEnv } from './env';

/**
 * Server-side auth helpers. The JWT never reaches client JavaScript: the Go API
 * returns it once, the BFF route in app/api/auth/callback stores it in an
 * httpOnly cookie, and server components read it from here.
 */

export async function getAuthToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(serverEnv.authCookieName)?.value;
}

export async function setAuthCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const store = await cookies();
  store.set(serverEnv.authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(serverEnv.authCookieName);
}
