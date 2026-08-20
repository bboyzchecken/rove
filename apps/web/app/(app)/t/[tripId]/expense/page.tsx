import { ExpenseScreen } from '@/components/expense/expense-screen';

/** Expense tab (M16) — actual money, never part of a public payload (W16.5). */
export const metadata = { title: 'ค่าใช้จ่ายจริง' };

export default async function ExpensePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <ExpenseScreen tripId={tripId} />;
}
