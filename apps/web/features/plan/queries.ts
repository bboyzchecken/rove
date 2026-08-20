'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { track } from '@/lib/analytics';
import { queryKeys } from '@/lib/query-keys';
import type { Collection, Day, Issue, Item, Plan, PlanDetail } from '@/types/api';

export type ItemInput = Partial<
  Pick<
    Item,
    | 'day_id'
    | 'type'
    | 'poi_id'
    | 'title'
    | 'notes'
    | 'start_time'
    | 'end_time'
    | 'duration_min'
    | 'travel_mode'
    | 'travel_min'
    | 'travel_note'
    | 'cost_amount'
    | 'cost_currency'
    | 'cost_basis'
    | 'cost_status'
    | 'cost_note'
    | 'is_prepaid'
  >
> & { title: string };

const planApi = {
  list: (tripId: string) => api.get<Collection<Plan>>(`/trips/${tripId}/plans`),
  create: (tripId: string, name?: string) => api.post<Plan>(`/trips/${tripId}/plans`, { name }),
  detail: (planId: string) => api.get<PlanDetail>(`/plans/${planId}`),
  update: (planId: string, patch: Partial<Pick<Plan, 'name' | 'summary' | 'key_decision'>>) =>
    api.patch<Plan>(`/plans/${planId}`, patch),
  remove: (planId: string) => api.delete<void>(`/plans/${planId}`),
  freeze: (planId: string) => api.post<{ plan_id: string }>(`/plans/${planId}/freeze`),
  snapshot: (planId: string) => api.post<{ snapshot_at: string }>(`/plans/${planId}/snapshot`),
  validate: (planId: string) =>
    api.get<{ issues: Issue[]; has_errors: boolean }>(`/plans/${planId}/validate`),
  createDay: (planId: string, body: { date: string; title?: string; theme?: string }) =>
    api.post<Day>(`/plans/${planId}/days`, body),

  createItem: (planId: string, input: ItemInput) => api.post<Item>(`/plans/${planId}/items`, input),
  updateItem: (itemId: string, input: ItemInput) => api.patch<Item>(`/items/${itemId}`, input),
  moveItem: (itemId: string, dayId: string, position: number) =>
    api.post<PlanDetail>(`/items/${itemId}/move`, { day_id: dayId, position }),
  deleteItem: (itemId: string) => api.delete<void>(`/items/${itemId}`),
  undoItem: (itemId: string) => api.post<Item>(`/items/${itemId}/undo`),
};

export function usePlans(tripId: string) {
  return useQuery({
    queryKey: queryKeys.plans(tripId),
    queryFn: () => planApi.list(tripId),
    enabled: Boolean(tripId),
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan(planId ?? ''),
    queryFn: () => planApi.detail(planId!),
    enabled: Boolean(planId),
  });
}

export function usePlanValidation(planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.planValidate(planId ?? ''),
    queryFn: () => planApi.validate(planId!),
    enabled: Boolean(planId),
  });
}

/**
 * Anything that touches items invalidates the same four things: the plan, its
 * budget, its warnings, and the trip's coverage board. Keeping that in one
 * function is what stops the four from drifting apart.
 */
function invalidatePlan(queryClient: QueryClient, tripId: string, planId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.planBudget(planId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.planValidate(planId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.coverage(tripId) });
}

export function useCreatePlan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => planApi.create(tripId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.plans(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useFreezePlan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => planApi.freeze(planId),
    onSuccess: (_data, planId) => {
      track({ name: 'plan_frozen' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.plans(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useSnapshotPlan() {
  return useMutation({ mutationFn: (planId: string) => planApi.snapshot(planId) });
}

export function useCreateItem(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput) => planApi.createItem(planId, input),
    onSuccess: () => {
      track({ name: 'item_added', props: { source: 'user' } });
      invalidatePlan(queryClient, tripId, planId);
    },
  });
}

export function useUpdateItem(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.plan(planId);

  return useMutation({
    mutationFn: ({ itemId, ...input }: ItemInput & { itemId: string }) =>
      planApi.updateItem(itemId, input),

    // Editing a card in a sheet should show its new title the moment the sheet
    // closes, not after a round trip.
    onMutate: async ({ itemId, ...input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanDetail>(key);
      if (previous) {
        queryClient.setQueryData<PlanDetail>(key, {
          ...previous,
          days: previous.days.map((day) => ({
            ...day,
            items: day.items.map((item) =>
              item.id === itemId ? { ...item, ...input } : item,
            ),
          })),
        });
      }
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => invalidatePlan(queryClient, tripId, planId),
  });
}

/**
 * Drag-and-drop must never wait on the network — the card has to land where the
 * finger let go. The optimistic reorder below is the real UI; the server
 * response replaces it, and a failure rolls it back.
 */
export function useMoveItem(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.plan(planId);

  return useMutation({
    mutationFn: ({ itemId, dayId, position }: { itemId: string; dayId: string; position: number }) =>
      planApi.moveItem(itemId, dayId, position),

    onMutate: async ({ itemId, dayId, position }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanDetail>(key);
      if (previous) {
        queryClient.setQueryData<PlanDetail>(key, moveItemLocally(previous, itemId, dayId, position));
      }
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    // The server returns the whole plan after a move, so take it verbatim
    // rather than refetching a second time.
    onSuccess: (fresh) => {
      track({ name: 'item_moved', props: { source: 'user' } });
      queryClient.setQueryData(key, fresh);
    },

    onSettled: () => invalidatePlan(queryClient, tripId, planId),
  });
}

/** Pure reorder used by the optimistic update; exported for its unit test. */
export function moveItemLocally(
  plan: PlanDetail,
  itemId: string,
  toDayId: string,
  position: number,
): PlanDetail {
  const moved = plan.days.flatMap((d) => d.items).find((i) => i.id === itemId);
  if (!moved) return plan;

  return {
    ...plan,
    days: plan.days.map((day) => {
      const without = day.items.filter((i) => i.id !== itemId);
      if (day.id !== toDayId) return { ...day, items: without };

      const index = Math.min(Math.max(position, 0), without.length);
      const items = [...without];
      items.splice(index, 0, { ...moved, day_id: toDayId });
      return { ...day, items: items.map((item, i) => ({ ...item, sort_order: i })) };
    }),
  };
}

export function useDeleteItem(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.plan(planId);

  return useMutation({
    mutationFn: (itemId: string) => planApi.deleteItem(itemId),

    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanDetail>(key);
      if (previous) {
        queryClient.setQueryData<PlanDetail>(key, {
          ...previous,
          days: previous.days.map((day) => ({
            ...day,
            items: day.items.filter((i) => i.id !== itemId),
          })),
        });
      }
      return { previous };
    },

    onError: (_error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSuccess: () => track({ name: 'item_deleted', props: { source: 'user' } }),

    onSettled: () => invalidatePlan(queryClient, tripId, planId),
  });
}

export function useUndoItem(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => planApi.undoItem(itemId),
    onSuccess: () => invalidatePlan(queryClient, tripId, planId),
  });
}

export function useCreateDay(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; title?: string; theme?: string }) =>
      planApi.createDay(planId, body),
    onSuccess: () => invalidatePlan(queryClient, tripId, planId),
  });
}
