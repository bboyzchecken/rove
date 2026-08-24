'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { AiGenerateInput, AiJob, BuyCreditsInput } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * AI planner (M4).
 *
 * Drafting is a job, not a request: `start()` returns as soon as the job is
 * queued and progress arrives over a subscription (SSE in live mode, a timer
 * in mock mode). The component only ever sees `job`.
 */

export function useAiCredits(tripId: string) {
  return useQuery({
    queryKey: queryKeys.aiCredits(tripId),
    queryFn: () => repo.ai.credits(tripId),
    enabled: Boolean(tripId),
  });
}

export function useAiDraft(tripId: string) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<AiJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const start = useCallback(
    async (input: AiGenerateInput) => {
      setError(null);
      try {
        const started = await repo.ai.generate(tripId, input);
        setJob(started);
        void queryClient.invalidateQueries({ queryKey: queryKeys.aiCredits(tripId) });

        unsubscribe.current?.();
        unsubscribe.current = repo.ai.subscribe(tripId, started.id, (update) => {
          setJob(update);
          if (update.status === 'failed') setError(update.error ?? 'ร่างไม่สำเร็จ');
        });
        return started;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'ร่างไม่สำเร็จ');
        return null;
      }
    },
    [queryClient, tripId],
  );

  const reset = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setJob(null);
    setError(null);
  }, []);

  const apply = useMutation({
    mutationFn: () => {
      if (!job) throw new Error('ยังไม่มีร่างให้ใช้');
      return repo.ai.apply(tripId, job.id);
    },
    onSuccess: (days) => {
      queryClient.setQueryData(queryKeys.planDays(tripId), days);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
    },
  });

  return {
    job,
    error,
    start,
    reset,
    apply,
    isRunning: job?.status === 'queued' || job?.status === 'running',
    isDone: job?.status === 'done',
  };
}

/**
 * Buying drafts. Two caches move on success and they are not the same cache:
 * the trip's meter, and this user's billing history — the purchase leaves a
 * receipt behind (M20), and the profile is allowed to be looked at next.
 */
export function useBuyAiCredits(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BuyCreditsInput) => repo.ai.buyCredits(tripId, input),
    onSuccess: (credits, input) => {
      track('ai_credits_purchased', { quantity: input.quantity, channel: input.method });
      queryClient.setQueryData(queryKeys.aiCredits(tripId), credits);
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing() });
      // Points are money here: a draft paid for with them changes the balance
      // the profile and the dialog both read from `me`.
      if (input.method === 'points') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      }
    },
  });
}

/**
 * Multi-variant drafting (M6 — A6.2). Same job machinery as a single draft,
 * but the result lands in the variants list rather than in the live plan.
 */
export function useAiVariants(tripId: string) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<AiJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const start = useCallback(
    async (input: { count: 2 | 3; brief?: string }) => {
      setError(null);
      try {
        const started = await repo.plan.generateVariants(tripId, input);
        setJob(started);
        void queryClient.invalidateQueries({ queryKey: queryKeys.aiCredits(tripId) });

        unsubscribe.current?.();
        unsubscribe.current = repo.ai.subscribe(tripId, started.id, (update) => {
          setJob(update);
          if (update.status === 'failed') setError(update.error ?? 'ร่างไม่สำเร็จ');
          if (update.status === 'done') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.variants(tripId) });
          }
        });
        return started;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'ร่างไม่สำเร็จ');
        return null;
      }
    },
    [queryClient, tripId],
  );

  const reset = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setJob(null);
    setError(null);
  }, []);

  return {
    job,
    error,
    start,
    reset,
    isRunning: job?.status === 'queued' || job?.status === 'running',
    isDone: job?.status === 'done',
  };
}
