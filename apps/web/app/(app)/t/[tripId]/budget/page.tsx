import { BudgetScreen } from '@/components/budget/budget-screen';

/** Budget tab (M7 — W7.1 … W7.3). Estimate only; real spending is M16. */
export const metadata = { title: 'งบประมาณการ' };

export default async function BudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <BudgetScreen tripId={tripId} />;
}
