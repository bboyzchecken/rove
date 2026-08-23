import { NextResponse, type NextRequest } from 'next/server';

import { safeNext } from '@/lib/auth-redirect';
import { serverEnv } from '@/lib/env';

/**
 * Sign-in, step one (W0.5).
 *
 * The API knows how to build a provider's consent URL but has nowhere to keep
 * the `state` it puts in that URL — it is stateless by design. So the browser
 * goes through here instead of straight to the provider: we fetch the consent
 * URL, lift `state` out of it, and park it in an httpOnly cookie that the
 * callback compares against. That is what turns `state` from decoration into a
 * real CSRF check.
 *
 * Every failure lands back on /login with a reason, because a redirect loop
 * with no message is the worst way to learn that OAuth is not configured yet.
 */
const PROVIDERS = new Set(['line', 'google']);

/** Long enough for a slow consent screen, short enough not to linger. */
const STATE_TTL_SECONDS = 10 * 60;

/**
 * Redirects are anchored to WEB_BASE_URL, not to `request.url`: the dev server
 * binds 0.0.0.0 and a route handler resolves relative URLs against that, which
 * sends the browser to a host it cannot reach. WEB_BASE_URL is also what the
 * API builds its callback from, so the two stay in step.
 */
function loginUrl(params: Record<string, string>) {
  const url = new URL('/login', serverEnv.webBaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function backToLogin(params: Record<string, string>) {
  return NextResponse.redirect(loginUrl(params));
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') ?? '';
  const next = safeNext(request.nextUrl.searchParams.get('next'));

  if (!PROVIDERS.has(provider)) {
    return backToLogin({ error: 'provider' });
  }

  let consentUrl: string;
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/auth/${provider}/url`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      // The API answers 400 when the provider's client id is still blank.
      return backToLogin({ error: 'unconfigured', provider });
    }
    ({ url: consentUrl } = (await res.json()) as { url: string });
  } catch {
    return backToLogin({ error: 'unreachable' });
  }

  const state = new URL(consentUrl).searchParams.get('state');
  if (!state) {
    return backToLogin({ error: 'state' });
  }

  const response = NextResponse.redirect(consentUrl);
  const cookie = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  };
  response.cookies.set(serverEnv.oauthStateCookieName, state, cookie);
  response.cookies.set(serverEnv.oauthNextCookieName, next, cookie);
  return response;
}
