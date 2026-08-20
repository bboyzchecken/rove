'use client';

import { useTripEvents } from '@/lib/sse';

/**
 * Subscribes the whole trip room to its event stream (W2.6). Mounted once in
 * the layout rather than per tab, so switching tabs does not reconnect.
 *
 * Renders nothing: its entire job is the subscription.
 */
export function TripRealtime({ tripId }: { tripId: string }) {
  useTripEvents(tripId);
  return null;
}
