'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { CreateLeadInput } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Points out and money owed (M22 — A12.10 / A12.11), and handing a trip to a
 * human (A12.12).
 */

export function useRedemptions() {
  return useQuery({
    queryKey: queryKeys.redemptions(),
    queryFn: () => repo.rewards.redemptions(),
  });
}

export function useRedeemPoints() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (amountThb: number) => repo.rewards.redeem(amountThb),
    onSuccess: () => {
      // The balance moved, so anything that shows it is now wrong: the board
      // itself, the profile header that quotes the same number, and the ledger
      // that now has one more row in it (M23).
      void qc.invalidateQueries({ queryKey: queryKeys.redemptions() });
      void qc.invalidateQueries({ queryKey: queryKeys.me() });
      void qc.invalidateQueries({ queryKey: queryKeys.pointsHistory() });
    },
  });
}

/**
 * Where my points came from (M23 — A23.1).
 *
 * Infinite rather than paged: the question is "why do I have this many", which
 * is answered by reading backwards until it makes sense, not by hopping to
 * page 4.
 */
export function usePointsHistory() {
  return useInfiniteQuery({
    queryKey: queryKeys.pointsHistory(),
    queryFn: ({ pageParam }) => repo.rewards.pointsHistory(pageParam),
    initialPageParam: '',
    // An empty cursor is the API saying "that was everything".
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
}

/** Who followed my published plans, and what that paid (M23 — A23.2). */
export function useAudience() {
  return useQuery({
    queryKey: queryKeys.audience(),
    queryFn: () => repo.rewards.audience(),
  });
}

export function useEarnings() {
  return useQuery({
    queryKey: queryKeys.earnings(),
    queryFn: () => repo.rewards.earnings(),
  });
}

export function useTripLeads(tripId: string) {
  return useQuery({
    queryKey: queryKeys.leads(tripId),
    queryFn: () => repo.leads.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useCreateLead(tripId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLeadInput) => repo.leads.create(tripId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads(tripId) }),
  });
}
