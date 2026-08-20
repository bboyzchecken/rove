import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { OAUTH_COOKIE_MAX_AGE, RETURN_COOKIE, STATE_COOKIE } from '@/lib/oauth';

/**
 * Starts the OAuth dance. It lives on the server because it has to set the
 * state cookie the callback verifies, and because the client ids belong in
 * server env rather than the browser bundle.
 *
 *   /api/auth/login?provider=line&return_to=/t/abc
 */
export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') === 'google' ? 'google' : 'line';
  const returnTo = request.nextUrl.searchParams.get('return_to') ?? '/home';

  const state = randomBytes(16).toString('hex');
  const redirectURI = new URL('/api/auth/callback', request.url);
  redirectURI.searchParams.set('provider', provider);

  const authorizeURL =
    provider === 'google'
      ? googleAuthorizeURL(redirectURI.toString(), state)
      : lineAuthorizeURL(redirectURI.toString(), state);

  if (!authorizeURL) {
    return NextResponse.redirect(new URL('/?auth=not_configured', request.url));
  }

  const response = NextResponse.redirect(authorizeURL);
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(RETURN_COOKIE, returnTo, options);
  return response;
}

function lineAuthorizeURL(redirectURI: string, state: string): string | null {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) return null;

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectURI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'profile openid');
  return url.toString();
}

function googleAuthorizeURL(redirectURI: string, state: string): string | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectURI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'openid email profile');
  return url.toString();
}
