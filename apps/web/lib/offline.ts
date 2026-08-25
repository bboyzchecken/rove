/**
 * The last thing we knew, kept for the moment there is no signal (W10.6).
 *
 * Trip Mode is used standing on a platform in Ueno with one bar of roaming
 * data. The service worker keeps the app shell available offline; this keeps
 * the *plan* available, by writing a snapshot of the day to localStorage every
 * time the screen successfully loads one.
 *
 * Deliberately small and deliberately not the query cache: persisting all of
 * TanStack Query would put expenses, member lists and tokens' worth of other
 * people's data on the device to solve a problem that is one day's itinerary.
 */

import type { PlanDay, Trip } from './data';

const KEY = 'rove.offline.trip';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface OfflineTrip {
  tripId: string;
  savedAt: string;
  trip: Pick<Trip, 'id' | 'title' | 'startDate' | 'endDate' | 'cities'>;
  days: PlanDay[];
}

export function saveOfflineTrip(tripId: string, trip: OfflineTrip['trip'], days: PlanDay[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: OfflineTrip = {
      tripId,
      savedAt: new Date().toISOString(),
      trip,
      days,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A full or blocked localStorage costs the offline copy, not the screen.
  }
}

/** Returns the snapshot for this trip, or null when there is none worth using. */
export function readOfflineTrip(tripId: string): OfflineTrip | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as OfflineTrip;
    if (parsed.tripId !== tripId) return null;
    // A fortnight-old itinerary is not a fallback, it is a wrong answer.
    if (Date.now() - new Date(parsed.savedAt).getTime() > MAX_AGE_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}
