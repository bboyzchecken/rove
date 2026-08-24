import { DocumentsScreen } from '@/components/document/documents-screen';

/** Documents tab (M19 — W19.1). */
export const metadata = { title: 'เอกสาร' };

export default async function DocumentsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <DocumentsScreen tripId={tripId} />;
}
