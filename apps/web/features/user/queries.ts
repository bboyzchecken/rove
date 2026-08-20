'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type Paginated } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  CalendarEntry,
  Character,
  Collection,
  DreamItem,
  Me,
  PointsBalance,
  PointsTransaction,
  UserStats,
} from '@/types/api';

export interface DreamInput {
  title: string;
  destination_country?: string;
  destination_city?: string;
  url?: string;
  image_url?: string;
  notes?: string;
}

const userApi = {
  updateMe: (patch: Partial<Pick<Me, 'display_name' | 'handle' | 'locale' | 'home_currency'>>) =>
    api.patch<Me>('/users/me', patch),
  setCharacter: (characterId: number) =>
    api.patch<{ character: Character }>('/users/me/character', { character_id: characterId }),
  stats: () => api.get<UserStats>('/users/me/stats'),
  calendar: () => api.get<Collection<CalendarEntry>>('/users/me/calendar'),

  dreams: () => api.get<Paginated<DreamItem>>('/users/me/dream'),
  createDream: (input: DreamInput) => api.post<DreamItem>('/users/me/dream', input),
  updateDream: (id: string, input: DreamInput) => api.patch<DreamItem>(`/users/me/dream/${id}`, input),
  deleteDream: (id: string) => api.delete<void>(`/users/me/dream/${id}`),
  reorderDreams: (ids: string[]) => api.post('/users/me/dream/reorder', { ids }),

  points: () => api.get<PointsBalance>('/users/me/points'),
  pointsHistory: () =>
    api.get<{ items: PointsTransaction[]; next_cursor: string }>('/users/me/points/history'),
};

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userApi.updateMe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
  });
}

export function useSetCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (characterId: number) => userApi.setCharacter(characterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      // The character is the member avatar everywhere, so every trip's member
      // list is now stale.
      void queryClient.invalidateQueries({ queryKey: ['trip'] });
    },
  });
}

export function useUserStats() {
  return useQuery({ queryKey: queryKeys.userStats(), queryFn: userApi.stats });
}

export function useUserCalendar() {
  return useQuery({ queryKey: queryKeys.userCalendar(), queryFn: userApi.calendar });
}

export function useDreams() {
  return useQuery({ queryKey: queryKeys.dreams(), queryFn: userApi.dreams });
}

export function useCreateDream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userApi.createDream,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.dreams() }),
  });
}

export function useUpdateDream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: DreamInput & { id: string }) => userApi.updateDream(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.dreams() }),
  });
}

export function useDeleteDream() {
  const queryClient = useQueryClient();
  const key = queryKeys.dreams();

  return useMutation({
    mutationFn: (id: string) => userApi.deleteDream(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Paginated<DreamItem>>(key);
      if (previous) {
        queryClient.setQueryData<Paginated<DreamItem>>(key, {
          ...previous,
          items: previous.items.filter((d) => d.id !== id),
        });
      }
      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useReorderDreams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => userApi.reorderDreams(ids),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.dreams() }),
  });
}

export function usePoints() {
  return useQuery({ queryKey: queryKeys.points(), queryFn: userApi.points });
}

export function usePointsHistory() {
  return useQuery({ queryKey: queryKeys.pointsHistory(), queryFn: userApi.pointsHistory });
}
