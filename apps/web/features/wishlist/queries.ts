'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  Collection,
  CoverageResponse,
  MemberProfile,
  WishlistItem,
} from '@/types/api';

export interface WishInput {
  kind?: 'must' | 'nice' | 'avoid';
  text: string;
  tags?: string[];
  poi_id?: string;
}

const wishlistApi = {
  list: (tripId: string) => api.get<Collection<WishlistItem>>(`/trips/${tripId}/wishlist`),
  create: (tripId: string, input: WishInput) =>
    api.post<WishlistItem>(`/trips/${tripId}/wishlist`, input),
  update: (tripId: string, id: string, input: WishInput) =>
    api.patch<WishlistItem>(`/trips/${tripId}/wishlist/${id}`, input),
  remove: (tripId: string, id: string) => api.delete<void>(`/trips/${tripId}/wishlist/${id}`),
  coverage: (tripId: string, planId?: string) =>
    api.get<CoverageResponse>(`/trips/${tripId}/coverage`, { searchParams: { plan_id: planId } }),
  profile: (tripId: string) => api.get<MemberProfile>(`/trips/${tripId}/profile/me`),
  saveProfile: (tripId: string, profile: Partial<MemberProfile>) =>
    api.put<MemberProfile>(`/trips/${tripId}/profile/me`, profile),
};

export function useWishlist(tripId: string) {
  return useQuery({
    queryKey: queryKeys.wishlist(tripId),
    queryFn: () => wishlistApi.list(tripId),
    enabled: Boolean(tripId),
  });
}

/** Adding a wish also changes coverage and the overview's "waiting on" count. */
function invalidateWishlist(queryClient: ReturnType<typeof useQueryClient>, tripId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.coverage(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
}

export function useCreateWish(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WishInput) => wishlistApi.create(tripId, input),
    onSuccess: () => invalidateWishlist(queryClient, tripId),
  });
}

export function useUpdateWish(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: WishInput & { id: string }) =>
      wishlistApi.update(tripId, id, input),
    onSuccess: () => invalidateWishlist(queryClient, tripId),
  });
}

/** Deleting is optimistic: the row vanishing instantly is the whole feel of a list. */
export function useDeleteWish(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.wishlist(tripId);

  return useMutation({
    mutationFn: (id: string) => wishlistApi.remove(tripId, id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Collection<WishlistItem>>(key);
      if (previous) {
        queryClient.setQueryData<Collection<WishlistItem>>(key, {
          items: previous.items.filter((w) => w.id !== id),
        });
      }
      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => invalidateWishlist(queryClient, tripId),
  });
}

export function useCoverage(tripId: string, planId?: string) {
  return useQuery({
    queryKey: [...queryKeys.coverage(tripId), planId ?? ''],
    queryFn: () => wishlistApi.coverage(tripId, planId),
    enabled: Boolean(tripId),
  });
}

export function useProfile(tripId: string) {
  return useQuery({
    queryKey: queryKeys.profile(tripId),
    queryFn: () => wishlistApi.profile(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSaveProfile(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Partial<MemberProfile>) => wishlistApi.saveProfile(tripId, profile),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}
