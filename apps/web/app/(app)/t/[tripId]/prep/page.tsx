import { PrepScreen } from '@/components/prep/prep-screen';

/** Prep tab (M8 — W8.1 shared checklist). */
export const metadata = { title: 'เตรียมตัว' };

export default async function PrepPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <PrepScreen tripId={tripId} />;
}
