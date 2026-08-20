import { DiscussionScreen } from '@/components/collab/discussion-screen';

/** Discussion tab (M9 — W9.1) with the activity feed (W2.5). */
export const metadata = { title: 'คุยกัน' };

export default async function DiscussionPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <DiscussionScreen tripId={tripId} />;
}
