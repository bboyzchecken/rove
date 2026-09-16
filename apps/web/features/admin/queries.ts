'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { LedgerAdjustInput, TraceType, VerificationStatus } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** The evidence chain console (Feedback #4 — F12, D-20, D-30, D-36). */

export function useTrace(type: TraceType, query: string) {
  return useQuery({
    queryKey: queryKeys.adminTrace(type, query),
    queryFn: () => repo.admin.trace(type, query),
    enabled: query.trim().length > 0,
    retry: false,
  });
}

export function useLedgerAdjust() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LedgerAdjustInput) => repo.admin.adjust(input),
    onSuccess: () => {
      // Trace, flags and audit all move with one adjustment.
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useLedgerFlags(openOnly: boolean) {
  return useQuery({
    queryKey: queryKeys.adminFlags(openOnly),
    queryFn: () => repo.admin.flags(openOnly),
  });
}

export function useResolveFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { flagId: string; resolution: string }) =>
      repo.admin.resolveFlag(input.flagId, input.resolution),
    // Settled rather than success: a 409 means someone else resolved it, and
    // the list should show that instead of the stale open row.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useEconomySettings() {
  return useQuery({ queryKey: queryKeys.adminEconomy(), queryFn: () => repo.admin.economy() });
}

export function useSetEconomySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { creatorSharePercent: number; bookerCreditPercent: number; reason?: string }) =>
      repo.admin.setEconomy(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.adminEconomy(), settings);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export function useAdminAudit(targetType?: string, targetId?: string) {
  return useQuery({
    queryKey: queryKeys.adminAudit(targetType, targetId),
    queryFn: () => repo.admin.audit({ targetType, targetId }),
  });
}

/* ------------------------------------ payouts & KYC (Feedback #4 — F11) -- */

/** Payouts, KYC and flags all feed the same overview counts — refresh them together. */
function useAdminWrite<Input, Output>(fn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      // In mock mode the admin is also the creator being reviewed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function usePayoutsOverview() {
  return useQuery({ queryKey: queryKeys.adminPayouts(), queryFn: () => repo.admin.payouts() });
}

export function useSetPayoutAnchor() {
  return useAdminWrite((input: { anchorDate: string; reason?: string }) =>
    repo.admin.setPayoutAnchor(input.anchorDate, input.reason),
  );
}

export function usePayoutEarnings(status = 'pending') {
  return useQuery({
    queryKey: queryKeys.adminPayoutEarnings(status),
    queryFn: () => repo.admin.payoutEarnings({ status }),
  });
}

export function useReconcile() {
  return useAdminWrite((input: { earningIds: string[]; statementRef: string }) =>
    repo.admin.reconcile(input.earningIds, input.statementRef),
  );
}

export function usePayoutCycle(cycleId: string) {
  return useQuery({
    queryKey: queryKeys.adminCycle(cycleId),
    queryFn: () => repo.admin.cycle(cycleId),
    enabled: Boolean(cycleId),
  });
}

export function useMoveCycle() {
  return useAdminWrite((input: { cycleId: string; cutoffDate: string; reason: string }) =>
    repo.admin.moveCycle(input.cycleId, input.cutoffDate, input.reason),
  );
}

export function useCloseCycle() {
  return useAdminWrite((cycleId: string) => repo.admin.closeCycle(cycleId));
}

export function useMarkPayoutPaid() {
  return useAdminWrite((input: { payoutId: string; transferRef: string; slip?: File }) =>
    repo.admin.markPaid(input.payoutId, { transferRef: input.transferRef, slip: input.slip }),
  );
}

export function useKycQueue(status: VerificationStatus) {
  return useQuery({
    queryKey: queryKeys.adminKycQueue(status),
    queryFn: () => repo.admin.kycQueue(status),
  });
}

export function useKycDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.adminKycDetail(id),
    queryFn: () => repo.admin.kycDetail(id),
    enabled: Boolean(id),
    // Signed image URLs last ten minutes on the API.
    staleTime: 5 * 60_000,
  });
}

export function useApproveKyc() {
  return useAdminWrite((id: string) => repo.admin.approveKyc(id));
}

export function useRejectKyc() {
  return useAdminWrite((input: { id: string; steps: string[]; reason: string }) =>
    repo.admin.rejectKyc(input.id, input.steps, input.reason),
  );
}

export function useRevokeKyc() {
  return useAdminWrite((input: { id: string; reason: string }) =>
    repo.admin.revokeKyc(input.id, input.reason),
  );
}

export function usePendingAccounts() {
  return useQuery({
    queryKey: queryKeys.adminPendingAccounts(),
    queryFn: () => repo.admin.pendingAccounts(),
  });
}

export function useVerifyAccount() {
  return useAdminWrite((id: string) => repo.admin.verifyAccount(id));
}

export function useRejectAccount() {
  return useAdminWrite((input: { id: string; reason: string }) =>
    repo.admin.rejectAccount(input.id, input.reason),
  );
}
