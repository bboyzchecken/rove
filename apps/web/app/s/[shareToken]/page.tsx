import { PublicTripView } from '@/components/public/public-trip-view';

/** Read-only view behind an unguessable share token (M10 — W10.2). */
export const metadata = { title: 'แพลนที่แชร์มา', robots: { index: false, follow: false } };

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <PublicTripView tokenOrSlug={shareToken} />;
}
