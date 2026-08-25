'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
      // itself and the profile header that quotes the same number.
      void qc.invalidateQueries({ queryKey: queryKeys.redemptions() });
      void qc.invalidateQueries({ queryKey: queryKeys.me() });
    },
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
