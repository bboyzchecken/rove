import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_AFTER_LOGIN, safeNext } from '@/lib/auth-redirect';
import { serverEnv } from '@/lib/env';

/**
 * Sign-in, step two — the one piece of BFF this app needs (W0.5).
 *
 * The provider redirects here with `code` and the `state` we stashed in
 * `/api/auth/start`. We check the two states match, exchange the code at the Go
 * API, and store the JWT in an httpOnly cookie so the token never touches
 * client JavaScript (DEV_SPEC §17: no secrets in the client bundle).
 *
 * `redirect_uri` has to be the exact string the API used when it built the
 * consent URL — same host, same `?provider=` — or the provider rejects the
 * exchange. Both sides derive it from WEB_BASE_URL for that reason.
 */
/**
 * Anchored to WEB_BASE_URL rather than `request.url` for the same reason the
 * exchange is: the dev server binds 0.0.0.0, and resolving against that sends
 * the browser to a host it cannot reach.
 */
function backToLogin(params: Record<string, string>) {
  const url = new URL('/login', serverEnv.webBaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = NextResponse.redirect(url);
  // A failed attempt must not leave a usable state behind for the next one.
  response.cookies.delete(serverEnv.oauthStateCookieName);
  response.cookies.delete(serverEnv.oauthNextCookieName);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const provider = request.nextUrl.searchParams.get('provider') ?? 'line';
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(serverEnv.oauthStateCookieName)?.value;
  const next = safeNext(request.cookies.get(serverEnv.oauthNextCookieName)?.value);

  // The provider reports its own refusals here — a cancelled consent screen
  // arrives as ?error=access_denied and never carries a code.
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    return backToLogin({ error: 'denied' });
  }

  if (!code) {
    return backToLogin({ error: 'missing_code' });
  }

  if (!state || !expectedState || state !== expectedState) {
    return backToLogin({ error: 'state' });
  }

  const redirectUri = `${serverEnv.webBaseUrl.replace(/\/$/, '')}/api/auth/callback?provider=${provider}`;

  let token: string;
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/auth/oauth/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return backToLogin({ error: 'exchange' });
    }
    ({ token } = (await res.json()) as { token: string });
  } catch {
    return backToLogin({ error: 'unreachable' });
  }

  const response = NextResponse.redirect(new URL(next || DEFAULT_AFTER_LOGIN, serverEnv.webBaseUrl));
  response.cookies.set(serverEnv.authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.delete(serverEnv.oauthStateCookieName);
  response.cookies.delete(serverEnv.oauthNextCookieName);
  return response;
}
