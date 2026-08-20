'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Collection, POI } from '@/types/api';

const poiApi = {
  search: (q: string, city?: string) =>
    api.get<Collection<POI>>('/pois/search', { searchParams: { q, city, limit: 12 } }),
  resolve: (body: { google_maps_url?: string; place_id?: string; text?: string }) =>
    api.post<{ poi: POI; source: string }>('/pois/resolve', body),
};

/** Debounces a value so a search box does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function usePOISearch(query: string, city?: string) {
  const debounced = useDebounced(query);

  return useQuery({
    queryKey: queryKeys.poiSearch(debounced, city),
    queryFn: () => poiApi.search(debounced, city),
    // One character matches everything and teaches the user nothing.
    enabled: debounced.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
}

/** Resolves a pasted Google Maps URL into a POI (A5.3). */
export function useResolvePOI() {
  return useMutation({ mutationFn: poiApi.resolve });
}
