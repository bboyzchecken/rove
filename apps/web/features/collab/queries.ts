'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Collection, Comment } from '@/types/api';

const collabApi = {
  list: (tripId: string, targetType?: string, targetId?: string) =>
    api.get<Collection<Comment>>(`/trips/${tripId}/comments`, {
      searchParams: { target_type: targetType, target_id: targetId },
    }),
  create: (
    tripId: string,
    body: { target_type: string; target_id: string; body: string; parent_id?: string },
  ) => api.post<Comment>(`/trips/${tripId}/comments`, body),
  remove: (id: string) => api.delete<void>(`/comments/${id}`),
  vote: (tripId: string, body: { target_type: string; target_id: string; choice: string; reason?: string }) =>
    api.post(`/trips/${tripId}/votes`, body),
};

/** A thread on one item/day/plan, or the whole Discussion tab when no target. */
export function useComments(tripId: string, targetType?: string, targetId?: string) {
  const key =
    targetType && targetId
      ? queryKeys.comments(tripId, targetType, targetId)
      : queryKeys.discussion(tripId);

  return useQuery({
    queryKey: key,
    queryFn: () => collabApi.list(tripId, targetType, targetId),
    enabled: Boolean(tripId),
  });
}

export function useCreateComment(tripId: string, targetType?: string, targetId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { target_type: string; target_id: string; body: string; parent_id?: string }) =>
      collabApi.create(tripId, body),
    onSuccess: () => {
      if (targetType && targetId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.comments(tripId, targetType, targetId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.discussion(tripId) });
    },
  });
}

export function useDeleteComment(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collabApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.discussion(tripId) }),
  });
}

export function useVote(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { target_type: string; target_id: string; choice: string; reason?: string }) =>
      collabApi.vote(tripId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
  });
}
