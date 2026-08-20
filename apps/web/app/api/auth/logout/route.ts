import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';

/** Clears the auth cookie. POST-only, so a prefetched link cannot log someone out. */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.delete(serverEnv.authCookieName);
  return response;
}
