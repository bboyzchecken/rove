import { TripList } from '@/components/trip/trip-list';

/** Every room this user is in — the destination the bottom bar's trip tab needs. */
export const metadata = { title: 'ทริปของฉัน' };

export default function TripsPage() {
  return <TripList />;
}
