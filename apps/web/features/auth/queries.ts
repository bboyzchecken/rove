'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { CurrentUser, DreamItem } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * The signed-in user and everything hanging off the profile: characters,
 * dream list, travel stats, past and upcoming trips.
 *
 * `useMe` returns null for an anonymous visitor rather than throwing, so public
 * pages can call it unconditionally.
 */

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => repo.auth.me(),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<CurrentUser, 'name' | 'handle' | 'characterId' | 'homeCurrency'>>) =>
      repo.auth.updateMe(patch),
    onSuccess: (user, patch) => {
      if (patch.characterId) track('character_selected', { character_id: patch.characterId });
      queryClient.setQueryData(queryKeys.me(), user);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, next }: { provider: 'line' | 'google'; next?: string }) =>
      repo.auth.startLogin(provider, next),
    onSuccess: (result) => {
      // Live mode hands back a URL to follow — a full page load, because the
      // round trip ends at a route handler that sets the session cookie. Mock
      // mode signs the seeded user in on the spot and the caller navigates.
      if (result.redirectUrl) window.location.href = result.redirectUrl;
      else if (result.user) queryClient.setQueryData(queryKeys.me(), result.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.auth.logout(),
    onSuccess: () => queryClient.clear(),
  });
}

/* --------------------------------------------------------------- profile -- */

export function useCharacters() {
  return useQuery({
    queryKey: queryKeys.characters(),
    queryFn: () => repo.profile.characters(),
    staleTime: Infinity,
  });
}

export function useDreams() {
  return useQuery({ queryKey: queryKeys.dreams(), queryFn: () => repo.profile.dreams() });
}

export function useAddDream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<DreamItem, 'id'>) => repo.profile.addDream(input),
    onSuccess: () => {
      track('dream_item_added', {});
      void queryClient.invalidateQueries({ queryKey: queryKeys.dreams() });
    },
  });
}

export function useRemoveDream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dreamId: string) => repo.profile.removeDream(dreamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.dreams() }),
  });
}

/* ----------------------------------------------------------------- trips -- */

export function useUpcomingTrips() {
  return useQuery({ queryKey: queryKeys.tripsUpcoming(), queryFn: () => repo.trips.upcoming() });
}

export function usePastTrips() {
  return useQuery({ queryKey: queryKeys.tripsPast(), queryFn: () => repo.trips.past() });
}

export function useYearStats() {
  return useQuery({ queryKey: queryKeys.stats(), queryFn: () => repo.trips.stats() });
}
