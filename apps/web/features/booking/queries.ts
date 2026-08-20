'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { BookingClick, Collection, Item } from '@/types/api';

const bookingApi = {
  list: (tripId: string) => api.get<Collection<BookingClick>>(`/trips/${tripId}/bookings`),
  link: (itemId: string) =>
    api.post<{ tracking_id: string; redirect_url: string; partner: { key: string; name: string } }>(
      `/items/${itemId}/booking-link`,
    ),
  setStatus: (itemId: string, status: Item['booking_status']) =>
    api.post<Item>(`/items/${itemId}/booking-status`, { status }),
};

export function useBookings(tripId: string) {
  return useQuery({
    queryKey: queryKeys.bookings(tripId),
    queryFn: () => bookingApi.list(tripId),
    enabled: Boolean(tripId),
  });
}

/**
 * Mints the affiliate link for an item. The response URL is our own /go/ route,
 * never the partner's — that redirect is what records the click and carries the
 * original creator's id forward for points (DEV_SPEC §6.5).
 */
export function useBookingLink(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => bookingApi.link(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(tripId) });
    },
  });
}

export function useBookingStatus(tripId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: Item['booking_status'] }) =>
      bookingApi.setStatus(itemId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.planBudget(planId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(tripId) });
    },
  });
}
