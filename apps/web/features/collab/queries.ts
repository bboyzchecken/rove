'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { CommentTarget, VoteTarget } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** Comments, votes and the activity feed (M9). */

export function useComments(tripId: string, targetType: CommentTarget, targetId: string) {
  return useQuery({
    queryKey: queryKeys.comments(tripId, targetType, targetId),
    queryFn: () => repo.collab.comments(tripId, targetType, targetId),
    enabled: Boolean(tripId && targetId),
  });
}

export function useAddComment(tripId: string, targetType: CommentTarget, targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => repo.collab.addComment(tripId, targetType, targetId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.comments(tripId, targetType, targetId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripActivity(tripId) });
    },
  });
}

export function useResolveComment(tripId: string, targetType: CommentTarget, targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string; resolved: boolean }) =>
      repo.collab.resolveComment(tripId, input.commentId, input.resolved),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(tripId, targetType, targetId) }),
  });
}

export function useVotes(tripId: string, targetType: VoteTarget, targetId: string) {
  return useQuery({
    queryKey: queryKeys.votes(tripId, targetType, targetId),
    queryFn: () => repo.collab.votes(tripId, targetType, targetId),
    enabled: Boolean(tripId && targetId),
  });
}

export function useVote(tripId: string, targetType: VoteTarget, targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: 1 | -1) => repo.collab.vote(tripId, targetType, targetId, value),
    onSuccess: (votes) =>
      queryClient.setQueryData(queryKeys.votes(tripId, targetType, targetId), votes),
  });
}
