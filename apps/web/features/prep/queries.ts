'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { ChecklistEntry, Collection, PrepBlock } from '@/types/api';

const prepApi = {
  list: (tripId: string) => api.get<Collection<PrepBlock>>(`/trips/${tripId}/prep`),
  regenerate: (tripId: string) =>
    api.post<Collection<PrepBlock>>(`/trips/${tripId}/prep/regenerate`),
  create: (tripId: string, body: { title: string; content_md?: string }) =>
    api.post<PrepBlock>(`/trips/${tripId}/prep`, body),
  update: (
    blockId: string,
    body: { title?: string; content_md?: string; checklist?: ChecklistEntry[] },
  ) => api.patch<PrepBlock>(`/prep/${blockId}`, body),
  remove: (blockId: string) => api.delete<void>(`/prep/${blockId}`),
};

export function usePrep(tripId: string) {
  return useQuery({
    queryKey: queryKeys.prep(tripId),
    queryFn: () => prepApi.list(tripId),
    enabled: Boolean(tripId),
  });
}

/**
 * Ticking a checklist box is optimistic. It is the single most-repeated
 * interaction in this tab and a round trip per tick makes it feel broken —
 * and the SSE event will correct any drift within a second anyway.
 */
export function useToggleChecklist(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.prep(tripId);

  return useMutation({
    mutationFn: ({ blockId, checklist }: { blockId: string; checklist: ChecklistEntry[] }) =>
      prepApi.update(blockId, { checklist }),

    onMutate: async ({ blockId, checklist }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Collection<PrepBlock>>(key);
      if (previous) {
        queryClient.setQueryData<Collection<PrepBlock>>(key, {
          items: previous.items.map((b) => (b.id === blockId ? { ...b, checklist } : b)),
        });
      }
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useRegeneratePrep(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => prepApi.regenerate(tripId),
    onSuccess: (fresh) => queryClient.setQueryData(queryKeys.prep(tripId), fresh),
  });
}

export function useCreatePrepBlock(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; content_md?: string }) => prepApi.create(tripId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}

export function useUpdatePrepBlock(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, ...body }: { blockId: string; title?: string; content_md?: string }) =>
      prepApi.update(blockId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}

export function useDeletePrepBlock(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) => prepApi.remove(blockId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.prep(tripId) }),
  });
}
