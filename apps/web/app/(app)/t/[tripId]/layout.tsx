import type { ReactNode } from 'react';

import { TripRoomShell } from '@/components/trip/trip-room-shell';

/**
 * Trip room shell (M2 — W2.1): cover, frame summary, then the tab strip that
 * every tab renders under. On a phone the tabs scroll horizontally; the app's
 * own bottom bar stays put underneath.
 *
 * The chrome itself lives in a client component so Trip Mode can opt out of it
 * without moving every other page in this folder (W10.6).
 */
export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return <TripRoomShell tripId={tripId}>{children}</TripRoomShell>;
}
