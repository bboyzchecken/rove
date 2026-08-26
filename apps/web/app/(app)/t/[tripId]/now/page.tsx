import { TripNowScreen } from '@/components/trip/trip-now';

/** Trip Mode (M10 — W10.6): the screen you actually open while travelling. */
export const metadata = {
  title: 'โหมดวันเดินทาง',
};

export default async function TripNowPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripNowScreen tripId={tripId} />;
}
