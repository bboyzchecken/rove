import { ExploreScreen } from '@/components/public/explore-screen';
import { isSignedIn } from '@/lib/session';

/**
 * Explore / discovery feed of public plans (M11 — W11.1).
 *
 * Lives under `(marketing)` because it is indexed and reachable without an
 * account, but it is also a tab in `AppShell.NAV` — so the frame is chosen per
 * reader rather than per folder (`BrowseShell`). The session is read here, on
 * the server, so the chrome is right on the first paint.
 */
export const metadata = {
  title: 'สำรวจแพลนสาธารณะ',
  description: 'ตามรอยทริปที่คนไปมาแล้วจริงๆ — ก๊อปแพลนไปเป็นของตัวเองแล้วแก้ต่อได้เลย',
};

export default async function ExplorePage() {
  return <ExploreScreen signedIn={await isSignedIn()} />;
}
