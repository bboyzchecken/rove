import { PublicTripView } from '@/components/public/public-trip-view';
import { isSignedIn } from '@/lib/session';

/**
 * Public plan page — the SEO surface (M11/Phase 2 adds explore + points on top
 * of it). Same read-only view as a share link; the difference is that this URL
 * is meant to be indexed.
 *
 * It is also where a card in สำรวจ lands, so a signed-in reader gets the app's
 * own frame here rather than being dropped out of it one tap into browsing.
 * `/s/[shareToken]` deliberately does not do this: an unlisted link is usually
 * opened by somebody who has no account to go back to.
 */
export default async function PublicPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicTripView tokenOrSlug={slug} signedIn={await isSignedIn()} />;
}
