import { CompareScreen } from '@/components/editor/compare-screen';

/** Compare page (M6 — W6.1/W6.2): variants side by side, votes, adopt, freeze. */
export const metadata = { title: 'เทียบแพลน' };

export default async function ComparePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <CompareScreen tripId={tripId} />;
}
