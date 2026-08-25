'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { SaveReviewInput } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** Trip reviews (M21 — A11.5): how it went, and what it really cost. */

export function useTripReviews(tripId: string) {
  return useQuery({
    queryKey: queryKeys.reviews(tripId),
    queryFn: () => repo.reviews.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSaveReview(tripId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveReviewInput) => repo.reviews.save(tripId, input),
    // The endpoint answers with the whole board, so there is nothing to
    // refetch — the response IS the next state.
    onSuccess: (board) => qc.setQueryData(queryKeys.reviews(tripId), board),
  });
}

export function useRemoveReview(tripId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => repo.reviews.remove(tripId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reviews(tripId) }),
  });
}
