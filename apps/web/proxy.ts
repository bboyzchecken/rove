import { NextResponse, type NextRequest } from 'next/server';

import { isLiveMode } from '@/lib/data/mode';

/**
 * The sign-in wall (W0.5).
 *
 * The file is `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention
 * and warns on the old name — see `file-conventions/proxy.md` in
 * `node_modules/next/dist/docs`.
 *
 * `app/(app)` is the signed-in half of the product — DEV_SPEC §3.2 calls it
 * exactly that — so an anonymous visitor is sent to /login with the page they
 * wanted remembered, instead of landing on a screen whose every query 401s.
 *
 * Two deliberate limits:
 *
 *  - This only checks that a session cookie is *present*. Whether the JWT is
 *    valid is the API's answer to give, and asking it here would put a network
 *    hop in front of every navigation. A forged cookie gets past this and then
 *    fails at the first request, which is the correct division of labour.
 *
 *  - Mock mode skips the wall entirely: there is no cookie to hold because
 *    there is no backend, and a UAT tester should still reach every screen.
 *    The mode is read through `lib/data/mode` rather than from the environment
 *    directly, so the switch keeps living in one place.
 */
const GUARDED = [
  '/home',
  '/trips',
  '/t',
  '/recap',
  '/dreams',
  '/profile',
  '/billing',
  '/new',
  '/admin',
];

/**
 * Doors that sit *inside* a guarded prefix but must stay open — otherwise the
 * wall swallows the very screen you use to get past it.
 *
 * `/admin/login` is the staff sign-in door (§16). It lives under `/admin` so
 * the two are read as one thing, and that is exactly what made it unreachable:
 * an anonymous visitor was bounced to `/login`, which is the *user* door, so
 * "admins sign in separately" was true in the file tree and false in the
 * browser.
 */
const OPEN = ['/admin/login'];

function isGuarded(pathname: string) {
  if (OPEN.some((base) => pathname === base || pathname.startsWith(`${base}/`))) return false;
  return GUARDED.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export function proxy(request: NextRequest) {
  if (!isLiveMode) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (!isGuarded(pathname)) return NextResponse.next();

  // Name comes from the same env the callback writes with; middleware runs on
  // the edge runtime where `lib/env` server values are still readable.
  const cookieName = process.env.AUTH_COOKIE_NAME ?? 'rove_token';
  if (request.cookies.get(cookieName)?.value) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Everything except Next's own assets, the BFF routes (which must stay
   * reachable while signed out — that is how you sign in), and static files.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand|characters).*)'],
};
