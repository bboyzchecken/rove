'use client';

import { useRouter } from 'next/navigation';

import { useCreateTrip } from '@/features/trip/queries';
import type { CreateTripInput } from '@/features/trip/api';

/**
 * All three entry flows end the same way: create the trip, then land the user
 * inside it. Sharing this is what keeps X1.1's "three screens" promise honest —
 * no flow gets to add a confirmation step the others do not have.
 */
export function useEntrySubmit() {
  const router = useRouter();
  const createTrip = useCreateTrip();

  return {
    isPending: createTrip.isPending,
    error: createTrip.error,
    submit: async (input: CreateTripInput) => {
      const trip = await createTrip.mutateAsync(input);
      router.push(`/t/${trip.id}`);
    },
  };
}

/** Cities offered as chips in the city flow — the Phase 1 scope (D0.1). */
export const CITY_OPTIONS: Array<{ key: string; label: string; suggestedDays: number }> = [
  { key: 'tokyo', label: 'โตเกียว', suggestedDays: 5 },
  { key: 'yokohama', label: 'โยโกฮาม่า', suggestedDays: 2 },
  { key: 'kamakura', label: 'คามาคุระ / เอโนชิมะ', suggestedDays: 1 },
  { key: 'fujikawaguchiko', label: 'ฟูจิ / คาวากุจิโกะ', suggestedDays: 2 },
  { key: 'kawagoe', label: 'คาวาโกเอะ', suggestedDays: 1 },
  { key: 'hakone', label: 'ฮาโกเน่', suggestedDays: 2 },
  { key: 'nikko', label: 'นิกโก้', suggestedDays: 1 },
];

/** Adds the suggested days for the chosen cities, with a floor of three. */
export function suggestDays(cities: string[]): number {
  const total = cities.reduce((sum, key) => {
    const city = CITY_OPTIONS.find((c) => c.key === key);
    return sum + (city?.suggestedDays ?? 1);
  }, 0);
  return Math.max(total, 3);
}

/** ISO date `days` after `from`, for pre-filling the end date. */
export function addDays(from: string, days: number): string {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
