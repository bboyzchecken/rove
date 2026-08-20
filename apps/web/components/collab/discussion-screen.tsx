'use client';

import { useState } from 'react';
import { Check, Send } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useAddComment, useComments, useResolveComment } from '@/features/collab/queries';
import { useTripActivity, useTripMembers } from '@/features/trip/queries';
import { cn } from '@/lib/utils';

/**
 * Discussion tab (M9 — W9.1) plus the activity feed (W2.5).
 *
 * Threads hang off the trip itself here; the per-item threads live on the
 * timeline card where the argument actually starts.
 */
export function DiscussionScreen({ tripId }: { tripId: string }) {
  const { data: comments = [], isLoading } = useComments(tripId, 'trip', tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: activity = [] } = useTripActivity(tripId);
  const addComment = useAddComment(tripId, 'trip', tripId);
  const resolve = useResolveComment(tripId, 'trip', tripId);
  const [body, setBody] = useState('');

  const memberOf = (id: string) => members.find((m) => m.id === id);

  async function send() {
    if (!body.trim()) return;
    await addComment.mutateAsync(body.trim());
    setBody('');
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader label="คุยกันเรื่องทริปนี้" />

        <Card className="p-3.5">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="มีอะไรอยากบอกเพื่อนร่วมทริป…"
              className="bg-surface text-espresso min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
            <Button
              size="md"
              onClick={() => void send()}
              disabled={addComment.isPending || !body.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </Card>

        <div className="mt-3 space-y-2">
          {isLoading ? <div className="rounded-brand bg-surface h-20 animate-pulse" /> : null}

          {!isLoading && comments.length === 0 ? (
            <EmptyState
              image="/brand/empty/empty-members.webp"
              title="ยังไม่มีใครพูดอะไร"
              hint="ถามเรื่องวัน งบ หรือที่พักตรงนี้ได้เลย ทุกคนในห้องเห็นหมด"
            />
          ) : null}

          {comments.map((comment) => {
            const who = memberOf(comment.memberId);
            return (
              <Card key={comment.id} className={cn('p-3.5', comment.resolved && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <CharacterAvatar characterId={who?.characterId ?? 'shiba'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-espresso text-sm font-semibold">{who?.name ?? 'สมาชิก'}</p>
                      <span className="text-muted text-[11px]">
                        {new Date(comment.createdAt).toLocaleDateString('th-TH')}
                      </span>
                      {comment.resolved ? <Badge tone="matcha">จบแล้ว</Badge> : null}
                    </div>
                    <p className="text-espresso mt-1 text-sm leading-relaxed">{comment.body}</p>
                  </div>
                  <button
                    aria-label={comment.resolved ? 'เปิดใหม่' : 'ทำเครื่องหมายว่าจบแล้ว'}
                    onClick={() =>
                      resolve.mutate({ commentId: comment.id, resolved: !comment.resolved })
                    }
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      comment.resolved ? 'text-success' : 'text-muted hover:bg-surface',
                    )}
                  >
                    <Check className="size-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeader label="ความเคลื่อนไหวทั้งหมด" />
        <Card className="divide-border divide-y">
          {activity.map((entry) => {
            const who = memberOf(entry.memberId);
            return (
              <div key={entry.id} className="flex items-center gap-3 p-3.5">
                <CharacterAvatar characterId={who?.characterId ?? 'shiba'} size="sm" />
                <p className="text-espresso min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{who?.name ?? 'ROVE'}</span>{' '}
                  <span className="text-muted">{entry.text}</span>
                </p>
                <span className="text-muted shrink-0 text-[11px]">
                  {new Date(entry.createdAt).toLocaleDateString('th-TH')}
                </span>
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
