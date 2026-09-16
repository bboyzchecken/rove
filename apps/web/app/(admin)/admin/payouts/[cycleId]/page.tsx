import { PayoutCycleScreen } from '@/components/admin/payout-cycle-screen';

export default async function AdminPayoutCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  return <PayoutCycleScreen cycleId={cycleId} />;
}
