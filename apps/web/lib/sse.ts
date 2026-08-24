'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { isMockMode } from './data';
import { env } from './env';
import { queryKeys } from './query-keys';

/**
 * Realtime layer. The API publishes to a Redis channel per trip and streams it
 * over SSE; the browser's only job is to invalidate the right query keys
 * (DEV_SPEC §5.9). Deliberately not WebSockets — clients never write here.
 *
 * Mock mode has no server to stream from, and no second person to hear about:
 * the hook simply does nothing rather than opening a connection that will fail.
 */
export type TripEventType =
  | 'trip.updated'
  | 'member.joined'
  | 'wishlist.changed'
  | 'plan.ready'
  | 'plan.updated'
  | 'item.updated'
  | 'comment.created'
  | 'ai.progress'
  | 'dates.changed'
  | 'dates.locked'
  | 'expense.changed'
  | 'prep.changed'
  | 'booking.changed'
  | 'photo.changed'
  | 'document.changed';

export interface TripEvent {
  type: TripEventType;
  target_type: string;
  target_id: string;
  actor_id: string;
  ts: string;
}

export function useTripEvents(tripId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tripId || isMockMode) return;

    const source = new EventSource(`${env.apiUrl}/api/v1/trips/${tripId}/events`, {
      withCredentials: true,
    });

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TripEvent;
        for (const key of keysFor(tripId, event.type)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      } catch {
        // A malformed frame must never take the stream down.
      }
    };

    source.onerror = () => {
      // EventSource reconnects on its own; nothing to do here.
    };

    return () => source.close();
  }, [tripId, queryClient]);
}

/**
 * Which caches an event actually invalidates. Refetching the whole room on
 * every keystroke someone else types would undo the point of caching — and on a
 * phone on 4G it is the difference between "live" and "laggy".
 */
function keysFor(tripId: string, type: TripEventType): readonly (readonly unknown[])[] {
  switch (type) {
    case 'dates.changed':
    case 'dates.locked':
      return [['trip', tripId, 'dates'], queryKeys.tripOverview(tripId), queryKeys.trip(tripId)];

    case 'wishlist.changed':
      return [
        queryKeys.wishlist(tripId),
        queryKeys.coverage(tripId),
        queryKeys.tripOverview(tripId),
      ];

    case 'plan.ready':
    case 'plan.updated':
    case 'item.updated':
      return [
        queryKeys.planDays(tripId),
        queryKeys.budget(tripId),
        queryKeys.coverage(tripId),
        queryKeys.tripOverview(tripId),
        // Variants ride the plan events: a new candidate, a vote, an adopt and
        // a freeze all publish one of these (M6).
        queryKeys.variants(tripId),
      ];

    case 'expense.changed':
      return [queryKeys.expenses(tripId)];

    case 'prep.changed':
      return [queryKeys.prep(tripId), queryKeys.prepNote(tripId)];

    case 'booking.changed':
      return [queryKeys.bookings(tripId), queryKeys.tripOverview(tripId)];

    // Every filtered view of the grid is stale at once, so the prefix goes in
    // rather than one key per filter (M18/M19).
    case 'photo.changed':
      return [['trip', tripId, 'photos']];

    case 'document.changed':
      return [queryKeys.documents(tripId)];

    case 'comment.created':
      return [['trip', tripId, 'comments'], queryKeys.tripActivity(tripId)];

    case 'member.joined':
      return [queryKeys.tripMembers(tripId), queryKeys.tripOverview(tripId)];

    // Frame edits and the freeze/unfreeze toggle (M6 — A6.4) both land here;
    // the frozen state lives on the trip itself.
    case 'trip.updated':
      return [
        queryKeys.trip(tripId),
        queryKeys.tripOverview(tripId),
        queryKeys.variants(tripId),
      ];

    // The AI job carries its own stream; the plan is refreshed when it lands.
    case 'ai.progress':
      return [];

    default:
      return [queryKeys.tripOverview(tripId), queryKeys.tripActivity(tripId)];
  }
}
