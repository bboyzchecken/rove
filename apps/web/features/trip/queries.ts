'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type {
  CreateTripInput,
  FlightLegInput,
  ShareState,
  TripOverview,
  TripVisibility,
  UpdateTripInput,
} from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Trip room hooks. The shape here is the reference every other feature folder
 * copies, including the optimistic frame edit.
 */

export function useTrips() {
  return useQuery({ queryKey: queryKeys.trips(), queryFn: () => repo.trips.list() });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => repo.trips.get(tripId),
    enabled: Boolean(tripId),
  });
}

export function useTripOverview(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripOverview(tripId),
    queryFn: () => repo.trips.overview(tripId),
    enabled: Boolean(tripId),
  });
}

export function useTripMembers(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripMembers(tripId),
    queryFn: () => repo.members.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useTripActivity(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripActivity(tripId),
    queryFn: () => repo.collab.activity(tripId),
    enabled: Boolean(tripId),
  });
}

/** The legs of a trip and everything derived from them (M1 — A1.3). */
export function useTripRoute(tripId: string) {
  return useQuery({
    queryKey: queryKeys.tripRoute(tripId),
    queryFn: () => repo.trips.route(tripId),
    enabled: Boolean(tripId),
  });
}

/**
 * Saving a route moves the trip frame with it — dates and destinations both —
 * so this invalidates the whole room rather than just the route.
 */
export function useSetTripRoute(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (legs: FlightLegInput[]) => repo.trips.setRoute(tripId, legs),
    onSuccess: (route) => {
      queryClient.setQueryData(queryKeys.tripRoute(tripId), route);
      track('route_built', {
        legs: route.flights.length,
        countries: route.countries.length,
        source: 'manual',
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => repo.trips.create(input),
    onSuccess: (_trip, input) => {
      track('trip_created', {
        entry_type: input.coordinateDates ? 'coordinate' : input.entryType,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

/** Inline frame edits must feel instant, so they are optimistic with rollback. */
export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.tripOverview(tripId);

  return useMutation({
    mutationFn: (patch: UpdateTripInput) => repo.trips.update(tripId, patch),

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

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => repo.trips.remove(tripId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trips() }),
  });
}

export function useCloneTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => repo.trips.clone(tripId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trips() }),
  });
}

/* --------------------------------------------------------------- members -- */

export function useInviteMember(tripId: string) {
  return useMutation({
    mutationFn: (role: 'editor' | 'viewer') => repo.members.invite(tripId, role),
    onSuccess: (_invite, role) => track('member_invited', { role }),
  });
}

export function useJoinTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => repo.members.join(token),
    onSuccess: () => {
      track('member_joined', {});
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

export function useUpdateMemberRole(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: string; role: 'owner' | 'editor' | 'viewer' }) =>
      repo.members.updateRole(tripId, input.memberId, input.role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
  });
}

export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => repo.members.remove(tripId, memberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
  });
}

/* ----------------------------------------------------------------- share -- */

export function useShareState(tripId: string) {
  return useQuery({
    queryKey: queryKeys.share(tripId),
    queryFn: () => repo.share.state(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSetVisibility(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: TripVisibility) => repo.share.setVisibility(tripId, visibility),
    onSuccess: (state: ShareState, visibility) => {
      if (visibility !== 'private') track('share_link_created', { visibility });
      if (visibility === 'public') track('trip_published', { has_points_incentive: true });
      queryClient.setQueryData(queryKeys.share(tripId), state);
    },
  });
}

export function useRotateShareToken(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.share.rotateToken(tripId),
    onSuccess: (state: ShareState) => queryClient.setQueryData(queryKeys.share(tripId), state),
  });
}

export function useExportTrip(tripId: string) {
  return useMutation({
    mutationFn: (format: 'pdf' | 'ics' | 'json') => repo.share.exportTrip(tripId, format),
    onSuccess: (_result, format) => track('export', { format }),
  });
}

export function usePublicTrip(tokenOrSlug: string) {
  return useQuery({
    queryKey: queryKeys.publicTrip(tokenOrSlug),
    queryFn: () => repo.share.publicTrip(tokenOrSlug),
    enabled: Boolean(tokenOrSlug),
  });
}
