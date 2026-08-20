import type { ReactNode } from 'react';

import { TripHeader } from '@/components/trip/trip-header';
import { TripRealtime } from '@/components/trip/trip-realtime';
import { TripTabs } from '@/components/trip/trip-tabs';

/**
 * Trip room shell (M2 — W2.1): cover, frame summary, then the tab strip that
 * every tab renders under. On a phone the tabs scroll horizontally; the app's
 * own bottom bar stays put underneath.
 */
export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <div>
      <TripRealtime tripId={tripId} />
      <TripHeader tripId={tripId} />
      <TripTabs tripId={tripId} />
      <div className="px-4 pb-5">{children}</div>
    </div>
  );
}
