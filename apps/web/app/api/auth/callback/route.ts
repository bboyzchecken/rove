import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';
import { RETURN_COOKIE, STATE_COOKIE } from '@/lib/oauth';

/**
 * OAuth callback — the one piece of BFF this app needs.
 *
 * The provider redirects here with a `code`. We exchange it at the Go API,
 * receive a JWT, and store it in an httpOnly cookie so the token never touches
 * client JavaScript (DEV_SPEC §17: no secrets in the client bundle).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const providerError = params.get('error');

  if (providerError) {
    return fail(request, 'denied');
  }
  if (!code) {
    return fail(request, 'missing_code');
  }

  // CSRF: the state we set before redirecting must come back unchanged.
  // Without this, an attacker can complete a login flow into a victim's browser.
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!expectedState || !state || state !== expectedState) {
    return fail(request, 'bad_state');
  }

  const provider = params.get('provider') === 'google' ? 'google' : 'line';
  const redirectURI = new URL('/api/auth/callback', request.url);
  // The redirect_uri sent to the token endpoint must match the one that was
  // registered and used to start the flow, byte for byte — including this
  // query param, since it is how the callback knows which provider replied.
  redirectURI.searchParams.set('provider', provider);

  let payload: { token: string; is_new?: boolean };
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/auth/oauth/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectURI.toString() }),
      cache: 'no-store',
    });
    if (!res.ok) return fail(request, 'exchange_failed');
    payload = (await res.json()) as { token: string; is_new?: boolean };
  } catch {
    return fail(request, 'unreachable');
  }

  if (!payload.token) return fail(request, 'no_token');

  // A brand-new account goes to onboarding (character first, per W14.3);
  // everyone else lands where they were headed.
  const returnTo = sanitizeReturnTo(request.cookies.get(RETURN_COOKIE)?.value);
  const destination = payload.is_new ? '/onboarding' : returnTo;

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(serverEnv.authCookieName, payload.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // matches the JWT's 7-day lifetime
  });
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(RETURN_COOKIE);
  return response;
}

/**
 * Only same-origin paths are accepted as a return destination. An absolute URL
 * here would turn the login flow into an open redirect.
 */
function sanitizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/home';
  return value;
}

function fail(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/?auth=${reason}`, request.url));
}
