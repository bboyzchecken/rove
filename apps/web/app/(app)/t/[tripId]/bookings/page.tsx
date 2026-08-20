import { BookingScreen } from '@/components/booking/booking-screen';

/** Bookings tab (M12 — W12.2). */
export const metadata = { title: 'การจอง' };

export default async function BookingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <BookingScreen tripId={tripId} />;
}
