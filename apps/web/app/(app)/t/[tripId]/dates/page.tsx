import { DateBoard } from '@/components/dates/date-board';

/** Date coordination (M2.5 — W2.8): find the days everyone is free, then lock. */
export const metadata = { title: 'หาวันที่ตรงกัน' };

export default async function DatesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <DateBoard tripId={tripId} />;
}
