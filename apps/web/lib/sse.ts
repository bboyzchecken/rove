'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { env } from './env';
import { queryKeys } from './query-keys';

/**
 * Realtime layer. The API publishes to a Redis channel per trip and streams it
 * over SSE; the browser's only job is to invalidate the right query keys
 * (DEV_SPEC §5.14). Deliberately not WebSockets — clients never write here.
 */

export type TripEventType =
  | 'trip.updated'
  | 'member.joined'
  | 'member.removed'
  | 'wishlist.changed'
  | 'plan.ready'
  | 'plan.updated'
  | 'item.updated'
  | 'comment.created'
  | 'ai.progress'
  | 'expense.created'
  | 'expense.updated'
  | 'prep.updated'
  | 'booking.updated'
  | 'export.ready';

export interface TripEvent {
  type: TripEventType;
  target_type: string;
  target_id: string;
  actor_id: string;
  ts: string;
  meta?: Record<string, unknown>;
}

/**
 * Maps an event to the queries it invalidates. Narrow keys, not a blanket
 * invalidation of the whole trip: a comment arriving must not refetch the
 * itinerary someone is mid-drag on.
 */
function invalidateFor(client: QueryClient, tripId: string, event: TripEvent) {
  const invalidate = (key: readonly unknown[]) =>
    void client.invalidateQueries({ queryKey: key });

  switch (event.type) {
    case 'trip.updated':
      invalidate(queryKeys.tripOverview(tripId));
      invalidate(queryKeys.tripActivity(tripId));
      break;

    case 'member.joined':
    case 'member.removed':
      invalidate(queryKeys.tripMembers(tripId));
      invalidate(queryKeys.tripOverview(tripId));
      invalidate(queryKeys.tripActivity(tripId));
      break;

    case 'wishlist.changed':
      invalidate(queryKeys.wishlist(tripId));
      invalidate(queryKeys.coverage(tripId));
      invalidate(queryKeys.tripOverview(tripId));
      break;

    case 'plan.ready':
      invalidate(queryKeys.plans(tripId));
      invalidate(queryKeys.tripOverview(tripId));
      invalidate(queryKeys.coverage(tripId));
      break;

    case 'plan.updated':
    case 'item.updated': {
      const planId = typeof event.meta?.plan_id === 'string' ? event.meta.plan_id : null;
      if (planId) {
        invalidate(queryKeys.plan(planId));
        invalidate(queryKeys.planBudget(planId));
        invalidate(queryKeys.planValidate(planId));
      } else {
        invalidate(queryKeys.plans(tripId));
      }
      invalidate(queryKeys.coverage(tripId));
      break;
    }

    case 'comment.created':
      invalidate(queryKeys.discussion(tripId));
      break;

    case 'expense.created':
    case 'expense.updated':
      invalidate(queryKeys.expense(tripId));
      invalidate(queryKeys.expenseSummary(tripId));
      invalidate(queryKeys.userStats());
      break;

    case 'prep.updated':
      invalidate(queryKeys.prep(tripId));
      break;

    case 'booking.updated':
      invalidate(queryKeys.bookings(tripId));
      break;

    case 'ai.progress':
      // Progress is rendered from the event itself (see useAIProgress); there
      // is nothing cached to invalidate until the job finishes.
      break;

    default:
      invalidate(queryKeys.trip(tripId));
  }
}

export interface TripEventsState {
  connected: boolean;
  lastEvent: TripEvent | null;
}

/**
 * Subscribes to a trip's event stream and invalidates the affected queries.
 *
 * EventSource reconnects on its own; on reconnect we refetch the whole trip
 * once, because anything that changed while the socket was down was missed.
 */
export function useTripEvents(tripId: string | undefined): TripEventsState {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<TripEvent | null>(null);
  // A ref, not state: reconnecting must not re-run the effect that owns the
  // connection.
  const hasConnectedBefore = useRef(false);

  useEffect(() => {
    if (!tripId) return;

    const source = new EventSource(`${env.apiUrl}/api/v1/trips/${tripId}/events`, {
      withCredentials: true,
    });

    source.onopen = () => {
      setConnected(true);
      if (hasConnectedBefore.current) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      }
      hasConnectedBefore.current = true;
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TripEvent;
        setLastEvent(event);
        invalidateFor(queryClient, tripId, event);
      } catch {
        // A malformed frame must never take the stream down.
      }
    };

    source.onerror = () => {
      // EventSource retries on its own using the server's `retry:` hint.
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [tripId, queryClient]);

  return { connected, lastEvent };
}

/** AI progress steps, rendered as a live status while a job runs (W4.1). */
export const AI_STEP_LABELS: Record<string, string> = {
  queued: 'เข้าคิวแล้ว',
  gathering: 'กำลังอ่าน wishlist ของทุกคน',
  frame: 'กำลังวางกรอบวันและเที่ยวบิน',
  facts: 'กำลังดึงข้อมูลสถานที่และอากาศ',
  generating: 'กำลังร่างแพลน',
  validating: 'กำลังตรวจเวลาเปิด-ปิดและเส้นทาง',
  repairing_1: 'กำลังแก้จุดที่ตรวจแล้วไม่ผ่าน',
  repairing_2: 'กำลังแก้รอบสุดท้าย',
  refining: 'กำลังปรับตามที่ขอ',
  normalizing: 'กำลังจัดหมวด wishlist',
  persisting: 'กำลังบันทึกแพลน',
  done: 'เสร็จแล้ว',
};

export function aiStepLabel(step: string): string {
  return AI_STEP_LABELS[step] ?? 'กำลังทำงาน';
}
