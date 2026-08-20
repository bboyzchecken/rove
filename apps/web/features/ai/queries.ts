'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { AiGenerateInput, AiJob } from '@/lib/data';
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

export function useBuyAiCredits(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { quantity: number; channel: string }) =>
      repo.ai.buyCredits(tripId, input.quantity, input.channel),
    onSuccess: (credits) => {
      queryClient.setQueryData(queryKeys.aiCredits(tripId), credits);
    },
  });
}
