import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';

/**
 * OAuth callback — the one piece of BFF this app needs.
 *
 * The provider redirects here with a `code`. We exchange it at the Go API,
 * receive a JWT, and store it in an httpOnly cookie so the token never touches
 * client JavaScript (DEV_SPEC §17: no secrets in the client bundle).
 *
 * TODO(W0.5): finish LINE + Google, verify the `state` parameter against the
 * value set before redirecting, and handle the error branch.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const provider = request.nextUrl.searchParams.get('provider') ?? 'line';

  if (!code) {
    return NextResponse.redirect(new URL('/?auth=missing_code', request.url));
  }

  const res = await fetch(`${serverEnv.apiUrl}/api/v1/auth/oauth/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirect_uri: new URL('/api/auth/callback', request.url).toString(),
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL('/?auth=failed', request.url));
  }

  const { token } = (await res.json()) as { token: string };

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(serverEnv.authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
