'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { BookingEntry, BookingKind, BookingStatus, PrepTask } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** Prep checklist (M8) and bookings (M12) — the two "before we fly" tabs. */

export function usePrepTasks(tripId: string) {
  return useQuery({
    queryKey: queryKeys.prep(tripId),
    queryFn: () => repo.prep.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useAddPrepTask(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<PrepTask, 'id' | 'done'>) => repo.prep.add(tripId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}

export function useTogglePrepTask(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.prep(tripId);

  return useMutation({
    mutationFn: (input: { taskId: string; done: boolean }) =>
      repo.prep.toggle(tripId, input.taskId, input.done),

    // A checkbox that waits for the network feels broken, so it flips first.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PrepTask[]>(key);
      if (previous) {
        queryClient.setQueryData<PrepTask[]>(
          key,
          previous.map((task) => (task.id === input.taskId ? { ...task, done: input.done } : task)),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useUpdatePrepTask(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; patch: Partial<PrepTask> }) =>
      repo.prep.update(tripId, input.taskId, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}

export function useRemovePrepTask(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => repo.prep.remove(tripId, taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}

export function useApplyPrepTemplate(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.prep.applyTemplate(tripId),
    onSuccess: (tasks) => queryClient.setQueryData(queryKeys.prep(tripId), tasks),
  });
}

/** The trip's shared markdown block (W8.2). */
export function usePrepNote(tripId: string) {
  return useQuery({
    queryKey: queryKeys.prepNote(tripId),
    queryFn: () => repo.prep.note(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSavePrepNote(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => repo.prep.saveNote(tripId, body),
    onSuccess: (body) => queryClient.setQueryData(queryKeys.prepNote(tripId), body),
  });
}

/* --------------------------------------------------------------- booking -- */

export function useBookings(tripId: string) {
  return useQuery({
    queryKey: queryKeys.bookings(tripId),
    queryFn: () => repo.booking.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useBookingOffers(tripId: string, kind: BookingKind) {
  return useQuery({
    queryKey: queryKeys.bookingOffers(tripId, kind),
    queryFn: () => repo.booking.offers(tripId, kind),
    enabled: Boolean(tripId),
  });
}

export function useSaveBooking(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<BookingEntry, 'id'>) => repo.booking.save(tripId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useSetBookingStatus(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; status: BookingStatus }) =>
      repo.booking.setStatus(tripId, input.bookingId, input.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useRemoveBooking(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => repo.booking.remove(tripId, bookingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookings(tripId) }),
  });
}
