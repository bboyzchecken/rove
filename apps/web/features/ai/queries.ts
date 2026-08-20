'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { aiStepLabel, type TripEvent } from '@/lib/sse';
import type { AIJob, ParsedTicket, RefineOutput } from '@/types/api';

const aiApi = {
  generate: (tripId: string, hints?: string) =>
    api.post<{ job_id: string }>(`/trips/${tripId}/ai/generate`, { hints }),
  normalize: (tripId: string) => api.post<{ job_id: string }>(`/trips/${tripId}/ai/normalize`),
  refine: (planId: string, instruction: string) =>
    api.post<{ job_id: string }>(`/plans/${planId}/ai/refine`, { instruction }),
  applyDiff: (planId: string, jobId: string, accepted: number[] | 'all') =>
    api.post<{ applied: number }>(`/plans/${planId}/ai/apply-diff`, {
      job_id: jobId,
      ...(accepted === 'all'
        ? { accept_all: true }
        : { accepted_diff_ids: accepted }),
    }),
  job: (jobId: string) => api.get<AIJob>(`/ai/jobs/${jobId}`),
  parseTicket: (text: string) => api.post<ParsedTicket>('/ai/parse-ticket', { text }),
};

export function useGeneratePlan(tripId: string) {
  return useMutation({ mutationFn: (hints?: string) => aiApi.generate(tripId, hints) });
}

export function useNormalizeWishlist(tripId: string) {
  return useMutation({ mutationFn: () => aiApi.normalize(tripId) });
}

export function useRefinePlan(planId: string) {
  return useMutation({ mutationFn: (instruction: string) => aiApi.refine(planId, instruction) });
}

export function useApplyDiff(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, accepted }: { jobId: string; accepted: number[] | 'all' }) =>
      aiApi.applyDiff(planId, jobId, accepted),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.planBudget(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.coverage(tripId) });
    },
  });
}

export function useParseTicket() {
  return useMutation({ mutationFn: (text: string) => aiApi.parseTicket(text) });
}

/**
 * Watches one AI job to completion.
 *
 * SSE carries the step-by-step progress; this query is the fallback for a
 * client whose stream is down, and the authority on the final result. Polling
 * stops the moment the job reaches a terminal state (DEV_SPEC §7.1).
 */
export function useAIJob(jobId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.aiJob(jobId ?? ''),
    queryFn: () => aiApi.job(jobId!),
    enabled: Boolean(jobId) && options.enabled !== false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'error' ? false : 2000;
    },
  });
}

export interface AIProgress {
  step: string;
  label: string;
  status: 'queued' | 'running' | 'done' | 'error';
}

/**
 * Live progress for the "ให้ AI ร่างแพลน" button (W4.1). It prefers the SSE
 * event, because it arrives seconds before the next poll would.
 */
export function useAIProgress(jobId: string | undefined, lastEvent: TripEvent | null): AIProgress | null {
  const { data: job } = useAIJob(jobId);
  const [fromStream, setFromStream] = useState<AIProgress | null>(null);

  useEffect(() => {
    if (!jobId || !lastEvent) return;
    if (lastEvent.type !== 'ai.progress' || lastEvent.target_id !== jobId) return;

    const step = typeof lastEvent.meta?.step === 'string' ? lastEvent.meta.step : '';
    const status = typeof lastEvent.meta?.status === 'string' ? lastEvent.meta.status : 'running';
    setFromStream({
      step,
      label: aiStepLabel(step),
      status: status as AIProgress['status'],
    });
  }, [jobId, lastEvent]);

  if (!jobId) return null;

  // The job row wins once it is terminal — the stream can drop the last event.
  if (job && (job.status === 'done' || job.status === 'error')) {
    return { step: job.step, label: aiStepLabel(job.step), status: job.status };
  }
  if (fromStream) return fromStream;
  if (job) return { step: job.step, label: aiStepLabel(job.step), status: job.status };
  return { step: 'queued', label: aiStepLabel('queued'), status: 'queued' };
}

/** Pulls the diff list out of a finished refine job. */
export function refineOutput(job: AIJob | undefined): RefineOutput | null {
  if (!job || job.status !== 'done' || !job.output) return null;
  const output = job.output as unknown as RefineOutput;
  return Array.isArray(output.diffs) ? output : null;
}

/** Pulls the open questions out of a finished generate job (W4.2). */
export function openQuestions(job: AIJob | undefined): string[] {
  if (!job || job.status !== 'done' || !job.output) return [];
  const questions = (job.output as { open_questions?: unknown }).open_questions;
  return Array.isArray(questions) ? questions.filter((q): q is string => typeof q === 'string') : [];
}
