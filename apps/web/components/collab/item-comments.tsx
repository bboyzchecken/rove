'use client';

import { useState } from 'react';
import { Check, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useAddComment, useComments, useResolveComment } from '@/features/collab/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { CommentTarget } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * The comment thread attached to one itinerary item or day (M9 — W9.1).
 *
 * It lives on the card the argument is actually about rather than in the
 * Discussion tab: "ตรงนี้เวลาไม่พอนะ" is a comment on a stop, and moving it to
 * a separate screen is how it stops being read.
 */
export function ItemComments({
  tripId,
  targetType,
  targetId,
}: {
  tripId: string;
  targetType: CommentTarget;
  targetId: string;
}) {
  const { data: comments = [] } = useComments(tripId, targetType, targetId);
  const { data: members = [] } = useTripMembers(tripId);
  const addComment = useAddComment(tripId, targetType, targetId);
  const resolve = useResolveComment(tripId, targetType, targetId);
  const [body, setBody] = useState('');

  async function send() {
    if (!body.trim()) return;
    await addComment.mutateAsync(body.trim());
    setBody('');
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="section-label">คุยกันเรื่องนี้</span>
        {comments.length > 0 ? <Badge>{comments.length}</Badge> : null}
      </div>

      {comments.map((comment) => {
        const who = members.find((m) => m.id === comment.memberId);
        return (
          <div
            key={comment.id}
            className={cn('bg-surface rounded-2xl p-2.5', comment.resolved && 'opacity-55')}
          >
            <div className="flex items-start gap-2">
              <CharacterAvatar characterId={who?.characterId ?? 'shiba'} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-espresso text-[11px] font-semibold">
                  {who?.name ?? 'สมาชิก'}
                </p>
                <p className="text-espresso text-xs leading-relaxed">{comment.body}</p>
              </div>
              <button
                aria-label={comment.resolved ? 'เปิดใหม่' : 'จบเรื่องนี้'}
                onClick={() =>
                  resolve.mutate({ commentId: comment.id, resolved: !comment.resolved })
                }
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  comment.resolved ? 'text-success' : 'text-muted hover:bg-bg',
                )}
              >
                <Check className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-end gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="ถามหรือเสนอเรื่องรายการนี้…"
          className="bg-surface text-espresso min-w-0 flex-1 rounded-full px-3.5 py-2 text-xs outline-none"
        />
        <Button size="sm" onClick={() => void send()} disabled={addComment.isPending || !body.trim()}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
