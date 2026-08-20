'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { queryKeys } from '@/lib/query-keys';
import type { TripOverview } from '@/types/api';

import { tripApi, type CreateTripInput, type UpdateTripInput } from './api';

/**
 * The hooks components import. This file is the reference shape every other
 * feature folder copies, including the optimistic update below.
 */

export function useTrips(page = 1) {
  return useQuery({
    queryKey: queryKeys.tripList(page),
    queryFn: () => tripApi.list(page),
  });
}

export function useTripOverview(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripOverview(tripId),
    queryFn: () => tripApi.overview(tripId),
    enabled: Boolean(tripId),
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => tripApi.create(input),
    onSuccess: (_trip, input) => {
      track({ name: 'trip_created', props: { entry_type: input.entry_type } });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

/** Inline frame edits must feel instant, so they are optimistic with rollback. */
export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.tripOverview(tripId);

  return useMutation({
    mutationFn: (patch: UpdateTripInput) => tripApi.update(tripId, patch),

    onMutate: async (patch) => {
      // Cancel in-flight refetches or one could land after this and undo it.
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

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

export function useTripMembers(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripMembers(tripId),
    queryFn: () => tripApi.members(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSetMemberRole(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'owner' | 'editor' | 'viewer' }) =>
      tripApi.setRole(tripId, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripMembers(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => tripApi.removeMember(tripId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripMembers(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useCreateInvite(tripId: string) {
  return useMutation({
    mutationFn: (body: { role?: 'editor' | 'viewer'; expire_in_days?: number; email?: string }) =>
      tripApi.createInvite(tripId, body),
    onSuccess: (_data, body) => track({ name: 'member_invited', props: { role: body.role } }),
  });
}

export function useSetVisibility(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: 'private' | 'link' | 'public') =>
      tripApi.setVisibility(tripId, visibility),
    onSuccess: (_data, visibility) => {
      track({ name: 'share_link_created', props: { visibility } });
      if (visibility === 'public') {
        track({ name: 'trip_published', props: { has_points_incentive: true } });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useSaveFlights(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (flights: CreateTripInput['flights']) => tripApi.saveFlights(tripId, flights),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) }),
  });
}

/** The activity feed is cursor-paginated so it stays stable as rows arrive. */
export function useTripActivity(tripId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.tripActivity(tripId),
    queryFn: ({ pageParam }) => tripApi.activity(tripId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: Boolean(tripId),
  });
}

export function useExportPlan(tripId: string) {
  return useMutation({
    mutationFn: ({ format, planId }: { format: 'html' | 'pdf'; planId?: string }) =>
      tripApi.export(tripId, format, planId),
    onSuccess: (_data, { format }) => track({ name: 'export', props: { format } }),
  });
}

export function useCloneTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => tripApi.clone(tripId),
    onSuccess: () => {
      track({ name: 'trip_cloned' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}
