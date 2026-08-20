'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { CreateItemInput, MoveItemInput, PlanDay, PlanItem } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Itinerary editor (M5) and the budget it feeds (M7).
 *
 * A plan edit changes coverage and the budget estimate, so those keys are
 * invalidated together — the three screens are one number in three views.
 */

export function usePlanDays(tripId: string) {
  return useQuery({
    queryKey: queryKeys.planDays(tripId),
    queryFn: () => repo.plan.days(tripId),
    enabled: Boolean(tripId),
  });
}

function invalidatePlan(queryClient: ReturnType<typeof useQueryClient>, tripId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.planDays(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.budget(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.coverage(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.planVersions(tripId) });
}

export function useAddItem(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) => repo.plan.addItem(tripId, input),
    onSuccess: () => invalidatePlan(queryClient, tripId),
  });
}

export function useUpdateItem(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.planDays(tripId);

  return useMutation({
    mutationFn: (input: { itemId: string; patch: Partial<PlanItem> }) =>
      repo.plan.updateItem(tripId, input.itemId, input.patch),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanDay[]>(key);
      if (previous) {
        queryClient.setQueryData<PlanDay[]>(
          key,
          previous.map((day) => ({
            ...day,
            items: day.items.map((item) =>
              item.id === input.itemId ? { ...item, ...input.patch } : item,
            ),
          })),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => invalidatePlan(queryClient, tripId),
  });
}

/** Drag-and-drop: the board has already moved the card, so this only confirms. */
export function useMoveItem(tripId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.planDays(tripId);

  return useMutation({
    mutationFn: (input: MoveItemInput) => repo.plan.moveItem(tripId, input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanDay[]>(key);
      if (previous) {
        const next = previous.map((day) => ({ ...day, items: [...day.items] }));
        let moved: PlanItem | undefined;
        for (const day of next) {
          const index = day.items.findIndex((i) => i.id === input.itemId);
          if (index >= 0) moved = day.items.splice(index, 1)[0];
        }
        const target = next.find((d) => d.id === input.toDayId);
        if (moved && target) target.items.splice(Math.min(input.toIndex, target.items.length), 0, moved);
        queryClient.setQueryData<PlanDay[]>(key, next);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (days) => queryClient.setQueryData(key, days),
    onSettled: () => invalidatePlan(queryClient, tripId),
  });
}

export function useRemoveItem(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => repo.plan.removeItem(tripId, itemId),
    onSuccess: () => invalidatePlan(queryClient, tripId),
  });
}

export function useRevalidatePlan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.plan.revalidate(tripId),
    onSuccess: (days) => {
      queryClient.setQueryData(queryKeys.planDays(tripId), days);
      invalidatePlan(queryClient, tripId);
    },
  });
}

export function useUndoPlan(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.plan.undo(tripId),
    onSuccess: (days) => {
      queryClient.setQueryData(queryKeys.planDays(tripId), days);
      invalidatePlan(queryClient, tripId);
    },
  });
}

export function usePlanVersions(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.planVersions(tripId),
    queryFn: () => repo.plan.versions(tripId),
    enabled: Boolean(tripId) && enabled,
  });
}

/* ---------------------------------------------------------------- budget -- */

export function useBudget(tripId: string) {
  return useQuery({
    queryKey: queryKeys.budget(tripId),
    queryFn: () => repo.budget.summary(tripId),
    enabled: Boolean(tripId),
  });
}

export function useSetBudget(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (perPersonThb: number) => repo.budget.setBudget(tripId, perPersonThb),
    onSuccess: (summary) => {
      queryClient.setQueryData(queryKeys.budget(tripId), summary);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripOverview(tripId) });
    },
  });
}

export function useRefreshFx(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repo.budget.refreshFx(tripId),
    onSuccess: (summary) => queryClient.setQueryData(queryKeys.budget(tripId), summary),
  });
}

/* ------------------------------------------------------------------- poi -- */

export function usePoiSearch(query: string, city?: string) {
  return useQuery({
    queryKey: queryKeys.poiSearch(query, city),
    queryFn: () => repo.poi.search(query, city),
    enabled: query.trim().length > 0,
  });
}
