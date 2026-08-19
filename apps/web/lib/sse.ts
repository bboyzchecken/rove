'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { env } from './env';

/**
 * Realtime layer. The API publishes to a Redis channel per trip and streams it
 * over SSE; the browser's only job is to invalidate the right query keys
 * (DEV_SPEC §5.9). Deliberately not WebSockets — clients never write here.
 */

export type TripEventType =
  | 'trip.updated'
  | 'member.joined'
  | 'wishlist.changed'
  | 'plan.ready'
  | 'plan.updated'
  | 'item.updated'
  | 'comment.created'
  | 'ai.progress';

export interface TripEvent {
  type: TripEventType;
  target_type: string;
  target_id: string;
  actor_id: string;
  ts: string;
}

/**
 * Subscribes to a trip's event stream and invalidates the affected queries.
 *
 * TODO(W2.6): map each event type to the precise query keys instead of the
 * blanket invalidation below, and refetch everything once on reconnect.
 */
export function useTripEvents(tripId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tripId) return;

    const source = new EventSource(`${env.apiUrl}/api/v1/trips/${tripId}/events`, {
      withCredentials: true,
    });

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TripEvent;
        void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        void event;
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
