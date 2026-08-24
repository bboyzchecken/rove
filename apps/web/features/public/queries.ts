'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { ExploreFilters } from '@/lib/data';
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
