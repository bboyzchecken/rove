'use client';

import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Me } from '@/types/api';

/**
 * The current user. Anonymous visitors get `undefined` rather than an error, so
 * public pages can call this unconditionally.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (error) {
        // 401 is the normal state for a logged-out visitor, not a failure.
        if (error instanceof ApiError && error.isUnauthorized) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Where to send someone who needs to sign in first. */
export function loginHref(provider: 'line' | 'google', returnTo?: string) {
  const params = new URLSearchParams({ provider });
  if (returnTo) params.set('return_to', returnTo);
  return `/api/auth/login?${params.toString()}`;
}
