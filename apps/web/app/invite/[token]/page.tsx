import { InviteScreen } from '@/components/trip/invite-screen';

/** Accept an invite, then land in the trip room (M2 — W2.4). */
export const metadata = { title: 'คำเชิญเข้าร่วมทริป' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteScreen token={token} />;
}
