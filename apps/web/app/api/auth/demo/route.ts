import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_AFTER_LOGIN, safeNext } from '@/lib/auth-redirect';
import { serverEnv } from '@/lib/env';

/**
 * The dev sign-in door — reachable only via `/admin/login`, never `/login`
 * (§16: a plain sign-in with no OAuth provider to vouch for the person is
 * exactly the surface a script farming free-AI-plan credit would want, so it
 * was moved off the screen every real user sees and the account it grants is
 * always promoted to admin).
 *
 * Live mode has no other way in while GOOGLE_OAUTH_CLIENT_ID and
 * LINE_LOGIN_CHANNEL_ID are still blank: the API answers 400 for both consent
 * URLs, so /login becomes a wall with no gate. This trades nothing for a session
 * on a fixed demo account, and it exists only where all three of these hold:
 *
 *   - NEXT_PUBLIC_DEV_LOGIN=true in the environment,
 *   - NODE_ENV is not production,
 *   - the API still registers POST /api/v1/auth/demo, which it does only while
 *     MOCK_MODE=true and ENV is not production.
 *
 * Three independent switches, because a sign-in that skips authentication is
 * exactly the thing that must not survive a careless deploy. Delete this file
 * once real OAuth credentials are in place.
 *
 * The cookie is set here rather than by the API for the same reason the OAuth
 * callback does it: the JWT must never reach client JavaScript (DEV_SPEC §17).
 */
function loginUrl(params: Record<string, string>) {
  const url = new URL('/admin/login', serverEnv.webBaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== 'true' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'ไม่พบหน้านี้' }, { status: 404 });
  }

  const next = safeNext(request.nextUrl.searchParams.get('next'));

  let token: string;
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    // 404 here means the API is running with MOCK_MODE=false, so the route was
    // never registered — the same "not configured" story the login screen
    // already tells for an unset provider.
    if (!res.ok) {
      return NextResponse.redirect(loginUrl({ error: 'unconfigured' }));
    }
    ({ token } = (await res.json()) as { token: string });
  } catch {
    return NextResponse.redirect(loginUrl({ error: 'unreachable' }));
  }

  const response = NextResponse.redirect(
    new URL(next || DEFAULT_AFTER_LOGIN, serverEnv.webBaseUrl),
  );
  response.cookies.set(serverEnv.authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
