'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { AvailabilityBoard, AvailabilityMark } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Date coordination (M2.5) — the step that runs before a trip has dates.
 *
 * The board is one payload: marks, who has submitted, ranked windows and the
 * lock. Every mutation returns the recomputed board, so the calendar, the
 * suggestion list and the lock bar can never disagree with each other.
 */

export function useDateBoard(tripId: string, month?: string) {
  return useQuery({
    queryKey: queryKeys.dateBoard(tripId, month),
    queryFn: () => repo.dates.board(tripId, month),
    enabled: Boolean(tripId),
    // Switching months must not blank the calendar — the toolbar that switched
    // it would unmount underneath the finger that tapped it.
    placeholderData: keepPreviousData,
  });
}

/**
 * Pushes a freshly computed board into every cached month.
 *
 * Marks, submissions, windows and the lock are trip-wide, so they belong in
 * all of them; `month`/`months` stay whatever that cache entry was showing, or
 * a mutation made in September would yank the calendar back to August.
 */
function seedBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  tripId: string,
  board: AvailabilityBoard,
) {
  const cached = queryClient.getQueryCache().findAll({ queryKey: ['trip', tripId, 'dates'] });

  for (const query of cached) {
    const previous = query.state.data as AvailabilityBoard | undefined;
    queryClient.setQueryData<AvailabilityBoard>(query.queryKey, {
      ...board,
      month: previous?.month ?? board.month,
      months: board.months.length > 0 ? board.months : (previous?.months ?? []),
    });
  }

  queryClient.setQueryData(queryKeys.dateBoard(tripId, board.month), board);
  void queryClient.invalidateQueries({ queryKey: queryKeys.dateWindows(tripId) });
}

export function useSetAvailability(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { memberId: string; dates: string[]; mark: AvailabilityMark | null }) =>
      repo.dates.setAvailability(tripId, input.memberId, input.dates, input.mark),

    // Painting days must not wait for a round trip — the calendar is a drag
    // surface, and a 140 ms lag per cell would be felt immediately.
    onMutate: async (input) => {
      const keys = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['trip', tripId, 'dates'] })
        .map((q) => q.queryKey);

      const previous: [readonly unknown[], AvailabilityBoard | undefined][] = keys.map((key) => [
        key,
        queryClient.getQueryData<AvailabilityBoard>(key),
      ]);

      for (const [key, board] of previous) {
        if (!board) continue;
        const wanted = new Set(input.dates);
        const entries = board.entries.filter(
          (e) => !(e.memberId === input.memberId && wanted.has(e.date)),
        );
        if (input.mark) {
          for (const date of input.dates) {
            entries.push({ memberId: input.memberId, date, mark: input.mark });
          }
        }
        queryClient.setQueryData<AvailabilityBoard>(key, { ...board, entries });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      for (const [key, board] of context?.previous ?? []) {
        if (board) queryClient.setQueryData(key, board);
      }
    },

    onSuccess: (board) => seedBoard(queryClient, tripId, board),
  });
}

export function useSubmitAvailability(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => repo.dates.submit(tripId, memberId),
    onSuccess: (board) => seedBoard(queryClient, tripId, board),
  });
}

export function useDateWindows(tripId: string) {
  return useQuery({
    queryKey: queryKeys.dateWindows(tripId),
    queryFn: () => repo.dates.windows(tripId),
    enabled: Boolean(tripId),
  });
}

export function useLockDates(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { startDate: string; endDate: string }) =>
      repo.dates.lock(tripId, input.startDate, input.endDate),
    onSuccess: (locked) => {
      track('dates_locked', { days: locked.days, everyone: locked.memberIds.length > 1 });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}

export function useUnlockDates(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.dates.unlock(tripId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
  });
}

export function useDestinations(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.destinations(tripId),
    queryFn: () => repo.dates.destinations(tripId),
    enabled: Boolean(tripId) && enabled,
  });
}

export function useChooseDestination(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (destinationId: string) => repo.dates.chooseDestination(tripId, destinationId),
    onSuccess: (_trip, destinationId) => {
      track('destination_chosen', { destination_id: destinationId, fit: 0 });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips() });
    },
  });
}
