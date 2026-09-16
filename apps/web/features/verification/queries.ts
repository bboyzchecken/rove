'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type {
  Verification,
  VerificationAccountInput,
  VerificationBasicInput,
} from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** เปิดรับรายได้ — creator verification (Feedback #4 — F11, D-22, D-37 … D-39). */

export function useVerification(enabled = true) {
  return useQuery({
    queryKey: queryKeys.verification(),
    queryFn: () => repo.verification.get(),
    enabled,
  });
}

/** Every write answers with the whole verification — it replaces the cache as-is. */
function useVerificationWrite<Input>(fn: (input: Input) => Promise<Verification>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (verification) => {
      queryClient.setQueryData(queryKeys.verification(), verification);
      void queryClient.invalidateQueries({ queryKey: queryKeys.earnings() });
    },
  });
}

export function useSaveVerificationBasic() {
  return useVerificationWrite((input: VerificationBasicInput) => repo.verification.saveBasic(input));
}

export function useSendOtp() {
  return useMutation({
    mutationFn: (channel: 'phone' | 'email') => repo.verification.sendOtp(channel),
  });
}

export function useVerifyOtp() {
  return useVerificationWrite((input: { channel: 'phone' | 'email'; code: string }) =>
    repo.verification.verifyOtp(input.channel, input.code),
  );
}

export function useSaveVerificationIdentity() {
  return useVerificationWrite((idNumber: string) => repo.verification.saveIdentity(idNumber));
}

export function useUploadVerificationDocuments() {
  return useVerificationWrite((files: { idCard?: File; selfie?: File }) =>
    repo.verification.uploadDocuments(files),
  );
}

export function useSaveVerificationAccount() {
  return useVerificationWrite((input: VerificationAccountInput) => repo.verification.saveAccount(input));
}

export function useSubmitVerification() {
  return useVerificationWrite<void>(() => repo.verification.submit());
}
