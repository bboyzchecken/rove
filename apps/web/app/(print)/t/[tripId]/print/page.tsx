import { PrintScreen } from '@/components/editor/print-screen';

/**
 * Printable itinerary (Feedback #4 — F3/D-4), outside the `(app)` group so it
 * renders with no AppShell chrome — just the plan, ready for `window.print()`.
 */
export const metadata = { title: 'พิมพ์แพลน', robots: { index: false, follow: false } };

export default async function PrintPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <PrintScreen tripId={tripId} />;
}
