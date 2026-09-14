import { cookies } from 'next/headers';

import { LandingA } from '@/components/marketing/landing-a';
import { LandingB } from '@/components/marketing/landing-b';
import { selectionFromCookies } from '@/lib/uat/variants';

/**
 * The landing page (M1 — W1.1).
 *
 * Two of them for UAT round 2 (Feedback #2 — D-17): A is the Feedback #1
 * layout with new words, B is a different page altogether. Which one `/`
 * shows follows the tester's floating switcher (F0.1) — read here on the
 * server, so the first paint is already the chosen one. Both are also
 * reachable directly at /landing-a and /landing-b for sharing a link.
 *
 * When the tester has chosen, the loser is deleted and this file goes back
 * to exporting one page.
 */
export default async function LandingPage() {
  const jar = await cookies();
  const { landing } = selectionFromCookies((name) => jar.get(name)?.value);
  return landing === 'b' ? <LandingB /> : <LandingA />;
}
