import { PointsScreen } from '@/components/profile/points-screen';

/**
 * ประวัติแต้ม (M23 — W23.1).
 *
 * Its own destination, like บิลและการชำระเงิน: points redeem for money off
 * (A12.10), so the ledger behind the balance is a record people come looking
 * for rather than something they meet by scrolling the profile.
 */
export const metadata = { title: 'ประวัติแต้ม' };

export default function PointsPage() {
  return <PointsScreen />;
}
