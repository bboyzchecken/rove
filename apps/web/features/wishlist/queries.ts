'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { WishlistItem } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** Wishlist + coverage (M3). Adding a wish changes coverage, so both refresh. */

export function useWishlist(tripId: string) {
  return useQuery({
    queryKey: queryKeys.wishlist(tripId),
    queryFn: () => repo.wishlist.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function useCoverage(tripId: string) {
  return useQuery({
    queryKey: queryKeys.coverage(tripId),
    queryFn: () => repo.wishlist.coverage(tripId),
    enabled: Boolean(tripId),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, tripId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.coverage(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
}

export function useAddWish(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<WishlistItem, 'id' | 'coverage'>) => repo.wishlist.add(tripId, input),
    onSuccess: (_wish, input) => {
      track('wishlist_item_added', { kind: input.kind });
      invalidate(queryClient, tripId);
    },
  });
}

export function useUpdateWish(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { wishId: string; patch: Partial<WishlistItem> }) =>
      repo.wishlist.update(tripId, input.wishId, input.patch),
    onSuccess: () => invalidate(queryClient, tripId),
  });
}

export function useRemoveWish(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (wishId: string) => repo.wishlist.remove(tripId, wishId),

    // Deleting one's own wish should not make the board flicker through a
    // loading state — drop it locally, then confirm.
    onMutate: async (wishId) => {
      const key = queryKeys.wishlist(tripId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WishlistItem[]>(key);
      if (previous) {
        queryClient.setQueryData<WishlistItem[]>(
          key,
          previous.filter((w) => w.id !== wishId),
        );
      }
      return { previous };
    },
    onError: (_error, _wishId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.wishlist(tripId), context.previous);
    },
    onSettled: () => invalidate(queryClient, tripId),
  });
}
