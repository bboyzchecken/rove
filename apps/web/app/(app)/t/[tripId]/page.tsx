import { TripOverview } from '@/components/trip/trip-overview';

/** Trip overview (M2 — W2.2, plus the onboarding checklist from W1.5). */
export const metadata = { title: 'ภาพรวมทริป' };

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripOverview tripId={tripId} />;
}
