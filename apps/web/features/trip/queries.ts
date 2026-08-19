'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { createTrip, getTripOverview, listTrips, updateTrip } from './api';
import type { CreateTripInput, TripOverview } from './types';

/**
 * The hooks components import. This file is the reference for every other
 * feature folder — copy its shape, including the optimistic update below.
 */

export function useTrips(page = 1) {
  return useQuery({
    queryKey: [...queryKeys.trips(), page],
    queryFn: () => listTrips(page),
  });
}

export function useTripOverview(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripOverview(tripId),
    queryFn: () => getTripOverview(tripId),
    enabled: Boolean(tripId),
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => createTrip(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trips() }),
  });
}

/** Inline frame edits must feel instant, so they are optimistic with rollback. */
export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.tripOverview(tripId);

  return useMutation({
    mutationFn: (patch: Partial<CreateTripInput>) => updateTrip(tripId, patch),

    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TripOverview>(key);

      if (previous) {
        queryClient.setQueryData<TripOverview>(key, {
          ...previous,
          trip: { ...previous.trip, ...patch },
        });
      }
      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
