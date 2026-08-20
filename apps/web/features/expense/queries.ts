'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type Paginated } from '@/lib/api-client';
import { track } from '@/lib/analytics';
import { queryKeys } from '@/lib/query-keys';
import type { ExpenseEntry, ExpenseSummary } from '@/types/api';

export interface ExpenseInput {
  title: string;
  amount: number;
  currency?: string;
  category?: ExpenseEntry['category'];
  split_type?: 'shared' | 'personal';
  participants_json?: string[];
  day_id?: string;
  note?: string;
  paid_by_user_id?: string;
}

export interface ExpenseFilters {
  day_id?: string;
  user_id?: string;
  split_type?: string;
  page?: number;
}

const expenseApi = {
  list: (tripId: string, filters: ExpenseFilters) =>
    api.get<Paginated<ExpenseEntry>>(`/trips/${tripId}/expense`, { searchParams: { ...filters } }),
  summary: (tripId: string) => api.get<ExpenseSummary>(`/trips/${tripId}/expense/summary`),
  create: (tripId: string, input: ExpenseInput) =>
    api.post<ExpenseEntry>(`/trips/${tripId}/expense`, input),
  update: (id: string, input: ExpenseInput) => api.patch<ExpenseEntry>(`/expense/${id}`, input),
  remove: (id: string) => api.delete<void>(`/expense/${id}`),
};

export function useExpenses(tripId: string, filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.expense(tripId), filters],
    queryFn: () => expenseApi.list(tripId, filters),
    enabled: Boolean(tripId),
  });
}

export function useExpenseSummary(tripId: string) {
  return useQuery({
    queryKey: queryKeys.expenseSummary(tripId),
    queryFn: () => expenseApi.summary(tripId),
    enabled: Boolean(tripId),
  });
}

/** An expense change moves the list, the settlement table and the user's stats. */
function invalidateExpense(queryClient: ReturnType<typeof useQueryClient>, tripId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.expense(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.expenseSummary(tripId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.userStats() });
}

export function useCreateExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => expenseApi.create(tripId, input),
    onSuccess: (_entry, input) => {
      track({
        name: 'expense_added',
        props: { split_type: input.split_type ?? 'shared', category: input.category ?? 'other' },
      });
      invalidateExpense(queryClient, tripId);
    },
  });
}

export function useUpdateExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ExpenseInput & { id: string }) => expenseApi.update(id, input),
    onSuccess: () => invalidateExpense(queryClient, tripId),
  });
}

export function useDeleteExpense(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseApi.remove(id),
    onSuccess: () => invalidateExpense(queryClient, tripId),
  });
}
