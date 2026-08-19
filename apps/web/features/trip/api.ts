import { api, type Paginated } from '@/lib/api-client';

import type { CreateTripInput, Trip, TripOverview } from './types';

/** Thin fetchers. No caching, no React — that belongs in queries.ts. */

export function listTrips(page = 1) {
  return api.get<Paginated<Trip>>('/trips', { searchParams: { page } });
}

export function getTripOverview(tripId: string) {
  return api.get<TripOverview>(`/trips/${tripId}`);
}

export function createTrip(input: CreateTripInput) {
  return api.post<Trip>('/trips', input);
}

export function updateTrip(tripId: string, patch: Partial<CreateTripInput>) {
  return api.patch<Trip>(`/trips/${tripId}`, patch);
}
