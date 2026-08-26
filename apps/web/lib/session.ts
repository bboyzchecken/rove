import { cookies } from 'next/headers';

import { isLiveMode } from '@/lib/data/mode';
import { serverEnv } from '@/lib/env';

/**
 * "Is whoever is asking for this page signed in?" — answered on the server.
 *
 * Only the public-facing screens need this, and only to pick which chrome to
 * wear (`BrowseShell`). Asking `useMe()` instead would work, but the answer
 * arrives one render late, so the page would paint the marketing frame and
 * then swap it for the app frame — a visible jump on the exact screens a
 * stranger judges the product by.
 *
 * Two deliberate limits, the same ones `proxy.ts` documents:
 *
 *  - It only checks that a session cookie is *present*. Whether the JWT is
 *    valid is the API's answer to give, and asking it here would put a network
 *    hop in front of every render. A forged cookie gets an app frame around a
 *    page whose queries then 401 — which is a worse-looking version of the
 *    same screen, not a leak.
 *
 *  - Mock mode has no cookie because it has no backend, and its whole point is
 *    that a UAT tester is always somebody. `lib/data/mode` is off-limits to
 *    components for good reason (§7 — ask the repository, not the mode), but
 *    this is the same server-side plumbing exception `proxy.ts` already makes.
 */
export async function isSignedIn(): Promise<boolean> {
  if (!isLiveMode) return true;

  const jar = await cookies();
  return Boolean(jar.get(serverEnv.authCookieName)?.value);
}
