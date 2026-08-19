'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Me {
  id: string;
  display_name: string;
  avatar_url: string;
  handle: string | null;
  locale: string;
  home_currency: string;
  role: 'user' | 'admin';
}

/**
 * The current user. Returns undefined for anonymous visitors rather than
 * throwing, so public pages can call it unconditionally.
 *
 * TODO(W0.5): wire this once /auth/me exists.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get<Me>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
