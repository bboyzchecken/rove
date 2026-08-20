import { PublicTripView } from '@/components/public/public-trip-view';

/**
 * Public plan page — the SEO surface (M11/Phase 2 adds explore + points on top
 * of it). Same read-only view as a share link; the difference is that this URL
 * is meant to be indexed.
 */
export default async function PublicPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicTripView tokenOrSlug={slug} />;
}
