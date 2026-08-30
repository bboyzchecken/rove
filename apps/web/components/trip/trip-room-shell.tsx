'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

import { TripHeader } from '@/components/trip/trip-header';
import { TripRealtime } from '@/components/trip/trip-realtime';
import { TripTabs } from '@/components/trip/trip-tabs';
import { tripFeature } from '@/lib/feature';

/**
 * The trip room's chrome — cover, frame summary, tab strip, presence.
 *
 * Trip Mode (`/t/:id/now`) is the one child that does not get it: while you
 * are actually travelling the screen is for one question at a time, and a tab
 * strip offering ten of them is the opposite of that (W10.6). Reading the
 * segment here rather than splitting the route tree keeps the URL the spec
 * asks for and every existing page exactly where it is.
 *
 * IT IS ALSO WHERE THE ROOM GETS ITS COLOUR (ROVE_BRAND_SPEC v3 §2.5).
 * The same segment that decides the chrome decides the feature, so every tab
 * is painted by the one component that already knows which tab it is. Every
 * `bg-feature` underneath re-points on navigation with no page doing anything,
 * which is what makes "one feature colour per screen" structural rather than a
 * thing to remember: a card inside Wishlist has no way to be orange.
 */
export function TripRoomShell({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const feature = tripFeature(segment);

  // Trip Mode still needs the attribute even without the chrome — it is a
  // screen in the room, and dropping it here would leave the route neutral.
  if (segment === 'now') return <div data-feature={feature}>{children}</div>;

  return (
    <div data-feature={feature}>
      <TripHeader tripId={tripId} />
      <TripTabs tripId={tripId} />
      {/* Owns the room's single SSE connection and renders "who is here". */}
      <TripRealtime tripId={tripId} />
      <div className="px-4 pb-5">{children}</div>
    </div>
  );
}
