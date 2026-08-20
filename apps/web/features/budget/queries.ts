'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { BudgetSummary } from '@/types/api';

/**
 * The Budget tab is an ESTIMATE derived from plan items. It is deliberately a
 * different endpoint, a different tab and a different query key from Expense,
 * which is real spending (DEV_SPEC M7 vs M16).
 */
export function usePlanBudget(planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.planBudget(planId ?? ''),
    queryFn: () => api.get<BudgetSummary>(`/plans/${planId}/budget`),
    enabled: Boolean(planId),
  });
}
