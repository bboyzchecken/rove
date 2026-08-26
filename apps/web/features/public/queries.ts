'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { AdaptInput, ExploreFilters } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** The public model (M11): explore, creator pages, and following a plan. */

export function useExplore(filters: ExploreFilters) {
  return useQuery({
    queryKey: queryKeys.explore(JSON.stringify(filters)),
    queryFn: () => repo.share.explore(filters),
    // Old pages stay while the next filter loads — no flash of empty grid.
    placeholderData: (previous) => previous,
  });
}

/**
 * What the platform has to show for itself (M24 — A24.1 / A24.2).
 *
 * Cached hard on purpose: these are the same numbers for every visitor, the
 * API already caches them for ten minutes, and the landing page is the most
 * requested screen in the product.
 */
const SOCIAL_PROOF_STALE_MS = 5 * 60 * 1000;

export function usePlatformStats() {
  return useQuery({
    queryKey: queryKeys.platformStats(),
    queryFn: () => repo.share.platformStats(),
    staleTime: SOCIAL_PROOF_STALE_MS,
  });
}

export function useRecentReviews() {
  return useQuery({
    queryKey: queryKeys.recentReviews(),
    queryFn: () => repo.share.recentReviews(),
    staleTime: SOCIAL_PROOF_STALE_MS,
  });
}

export function useCreator(handle: string) {
  return useQuery({
    queryKey: queryKeys.creator(handle),
    queryFn: () => repo.share.creator(handle),
    enabled: Boolean(handle),
  });
}

export function useCloneFromPublic() {
  return useMutation({
    mutationFn: (tokenOrSlug: string) => repo.share.cloneFromPublic(tokenOrSlug),
    onSuccess: () => track('trip_cloned', {}),
  });
}

/**
 * What copying this plan into my own frame would change (A11.4).
 *
 * A query rather than a mutation even though it POSTs: it writes nothing, and
 * the dialog re-runs it every time a number changes.
 */
export function useAdaptPreview(tokenOrSlug: string, input: AdaptInput, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adaptPreview(tokenOrSlug, JSON.stringify(input)),
    queryFn: () => repo.share.adaptPreview(tokenOrSlug, input),
    enabled: enabled && Boolean(tokenOrSlug),
    placeholderData: (previous) => previous,
  });
}

export function useCloneAdapted() {
  return useMutation({
    mutationFn: ({ tokenOrSlug, input }: { tokenOrSlug: string; input: AdaptInput }) =>
      repo.share.cloneAdapted(tokenOrSlug, input),
    onSuccess: () => track('trip_cloned', {}),
  });
}
