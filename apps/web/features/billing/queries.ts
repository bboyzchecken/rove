'use client';

import { useQuery } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * Bill & Payment (M20).
 *
 * All reads. Orders are written by the thing that was sold — the payment sheet
 * in the AI dialog today, a renewal worker later — so there is no mutation
 * here to keep in sync with them.
 *
 * The price list is `staleTime: Infinity`: it is a catalogue, not a balance.
 */

export function useBillingSummary() {
  return useQuery({
    queryKey: queryKeys.billingSummary(),
    queryFn: () => repo.billing.summary(),
    staleTime: 60_000,
  });
}

export function useOrders() {
  return useQuery({ queryKey: queryKeys.billingOrders(), queryFn: () => repo.billing.orders() });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: queryKeys.billingOrder(orderId),
    queryFn: () => repo.billing.order(orderId),
    enabled: Boolean(orderId),
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: queryKeys.billingSubscription(),
    queryFn: () => repo.billing.subscription(),
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: queryKeys.billingPlans(),
    queryFn: () => repo.billing.plans(),
    staleTime: Infinity,
  });
}
