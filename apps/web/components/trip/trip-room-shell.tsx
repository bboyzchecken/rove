'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

import { TripHeader } from '@/components/trip/trip-header';
import { TripRealtime } from '@/components/trip/trip-realtime';
import { TripTabs } from '@/components/trip/trip-tabs';

/**
 * The trip room's chrome — cover, frame summary, tab strip, presence.
 *
 * Trip Mode (`/t/:id/now`) is the one child that does not get it: while you
 * are actually travelling the screen is for one question at a time, and a tab
 * strip offering ten of them is the opposite of that (W10.6). Reading the
 * segment here rather than splitting the route tree keeps the URL the spec
 * asks for and every existing page exactly where it is.
 */
export function TripRoomShell({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();

  if (segment === 'now') return <>{children}</>;

  return (
    <div>
      <TripHeader tripId={tripId} />
      <TripTabs tripId={tripId} />
      {/* Owns the room's single SSE connection and renders "who is here". */}
      <TripRealtime tripId={tripId} />
      <div className="px-4 pb-5">{children}</div>
    </div>
  );
}
