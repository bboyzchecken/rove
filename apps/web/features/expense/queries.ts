'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { ExpenseEntry } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** Real spending and the settle-up (M16). */

export function useExpenses(tripId: string) {
  return useQuery({
    queryKey: queryKeys.expenses(tripId),
    queryFn: () => repo.expense.summary(tripId),
    enabled: Boolean(tripId),
  });
}

export function useAddExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ExpenseEntry, 'id'>) => repo.expense.add(tripId, input),
    onSuccess: (_entry, input) => {
      track('expense_added', { split_type: input.scope, category: input.category });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses(tripId) });
    },
  });
}

export function useUpdateExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expenseId: string; patch: Partial<ExpenseEntry> }) =>
      repo.expense.update(tripId, input.expenseId, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses(tripId) }),
  });
}

export function useRemoveExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => repo.expense.remove(tripId, expenseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses(tripId) }),
  });
}

export function useSettleUp(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromMemberId: string; toMemberId: string }) =>
      repo.expense.settle(tripId, input.fromMemberId, input.toMemberId),
    onSuccess: (summary) => queryClient.setQueryData(queryKeys.expenses(tripId), summary),
  });
}
