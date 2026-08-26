'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { CreatePollInput, PresenceMember } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/** The inbox (A9.2), polls (A9.3) and presence (W9.3). */

export function useInbox() {
  return useQuery({
    queryKey: queryKeys.inbox(),
    queryFn: () => repo.community.inbox(),
    // The bell is a background thing: it should be current without being a
    // reason to keep a phone's radio awake.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId?: string) => repo.community.markRead(notificationId),
    onSuccess: (inbox) => queryClient.setQueryData(queryKeys.inbox(), inbox),
  });
}

export function usePolls(tripId: string) {
  return useQuery({
    queryKey: queryKeys.polls(tripId),
    queryFn: () => repo.community.polls(tripId),
    enabled: Boolean(tripId),
  });
}

function invalidatePolls(queryClient: ReturnType<typeof useQueryClient>, tripId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.polls(tripId) });
}

export function useCreatePoll(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePollInput) => repo.community.createPoll(tripId, input),
    onSuccess: () => invalidatePolls(queryClient, tripId),
  });
}

export function useAnswerPoll(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { pollId: string; option: number }) =>
      repo.community.answerPoll(tripId, input.pollId, input.option),
    onSuccess: () => invalidatePolls(queryClient, tripId),
  });
}

export function useClosePoll(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pollId: string) => repo.community.closePoll(tripId, pollId),
    onSuccess: () => invalidatePolls(queryClient, tripId),
  });
}

export function useRemovePoll(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pollId: string) => repo.community.removePoll(tripId, pollId),
    onSuccess: () => invalidatePolls(queryClient, tripId),
  });
}

/** How long a ping counts for. Anyone quieter than this has left the room. */
const PRESENCE_TTL_MS = 45_000;
const PING_EVERY_MS = 20_000;

/**
 * Presence (W9.3).
 *
 * Nothing is stored anywhere: this hook pings while the tab is visible, and
 * keeps a map of who else pinged recently. Someone who closes their laptop
 * simply stops appearing — which is the correct behaviour and needs no
 * disconnect handling at all.
 */
export function usePresence(tripId: string, tab: string) {
  const [others, setOthers] = useState<PresenceMember[]>([]);
  const typingRef = useRef(false);

  const ping = useCallback(
    (typing: boolean) => {
      typingRef.current = typing;
      void repo.community.ping(tripId, { typing, tab });
    },
    [tripId, tab],
  );

  useEffect(() => {
    if (!tripId) return;

    ping(false);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') ping(typingRef.current);
    }, PING_EVERY_MS);

    // Drop anyone who has gone quiet, so a closed laptop fades out on its own.
    const sweep = setInterval(() => {
      setOthers((current) => current.filter((m) => Date.now() - m.at < PRESENCE_TTL_MS));
    }, 10_000);

    return () => {
      clearInterval(timer);
      clearInterval(sweep);
    };
  }, [tripId, ping]);

  const seen = useCallback((member: PresenceMember) => {
    setOthers((current) => [...current.filter((m) => m.memberId !== member.memberId), member]);
  }, []);

  return { others, ping, seen };
}
