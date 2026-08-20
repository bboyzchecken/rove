import { TripRecapScreen } from '@/components/trip/trip-recap';

/** บันทึกทริป — a finished trip, read-only (M17 — W17.5). */
export const metadata = { title: 'บันทึกทริป' };

export default async function TripRecapPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripRecapScreen tripId={tripId} />;
}
