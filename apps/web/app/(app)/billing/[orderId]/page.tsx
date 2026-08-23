import { ReceiptView } from '@/components/billing/receipt-view';

/** One receipt, printable as itself (M20 — W20.3). */
export const metadata = { title: 'ใบเสร็จ' };

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <ReceiptView orderId={orderId} />;
}
