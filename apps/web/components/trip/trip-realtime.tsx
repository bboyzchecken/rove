'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

import { TripPresence } from '@/components/trip/trip-presence';
import { usePresence } from '@/features/community/queries';
import { useTripMembers } from '@/features/trip/queries';
import { useTripEvents } from '@/lib/sse';

/**
 * The room's one connection to the server (W2.6, W9.3).
 *
 * Mounted once in the layout rather than per tab, so switching tabs does not
 * reconnect — and everything realtime hangs off it: cache invalidation, and
 * the presence strip. A second EventSource per room would double the open
 * connections for something the first one already carries.
 */
export function TripRealtime({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const tab = pathname.split('/').slice(3).join('/') || 'overview';

  const { data: members = [] } = useTripMembers(tripId);
  const { others, seen } = usePresence(tripId, tab);

  const onEvent = useCallback(
    (event: { type: string; target_id: string; payload?: { typing?: boolean; tab?: string } }) => {
      if (event.type !== 'presence.ping') return;
      seen({
        memberId: event.target_id,
        typing: Boolean(event.payload?.typing),
        tab: event.payload?.tab ?? '',
        at: Date.now(),
      });
    },
    [seen],
  );

  useTripEvents(tripId, onEvent);

  return <TripPresence others={others} members={members} />;
}
