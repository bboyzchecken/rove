import { PlanScreen } from '@/components/editor/plan-screen';

/** Plan tab (M4 + M5). */
export const metadata = { title: 'แพลน' };

export default async function PlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <PlanScreen tripId={tripId} />;
}
