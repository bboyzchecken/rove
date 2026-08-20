'use client';

import { use, useState } from 'react';
import { Send } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { useComments, useCreateComment, useDeleteComment } from '@/features/collab/queries';
import { useTripOverview } from '@/features/trip/queries';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { formatRelative } from '@/lib/format';
import type { Comment } from '@/types/api';

/**
 * M9 — the Discussion tab.
 *
 * Threads are one level deep on purpose: a group deciding where to eat needs a
 * reply, not a tree. Viewers can comment — someone invited to look at a plan
 * should be able to say "day three looks packed" without edit rights.
 */
export default function DiscussionPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const { data: me } = useMe();
  const { data: overview } = useTripOverview(tripId);
  const { data, isLoading, error, refetch } = useComments(tripId);
  const createComment = useCreateComment(tripId);
  const deleteComment = useDeleteComment(tripId);

  if (isLoading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState onRetry={() => void refetch()} />;

  const comments = data?.items ?? [];
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  function send() {
    const text = body.trim();
    if (!text) return;

    createComment.mutate(
      {
        target_type: replyTo ? replyTo.target_type : 'trip',
        target_id: replyTo ? replyTo.target_id : tripId,
        body: text,
        parent_id: replyTo?.id,
      },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        {replyTo ? (
          <p className="mb-2 flex items-center gap-2 rounded-brand bg-espresso/5 px-3 py-1.5 text-xs text-muted">
            ตอบ {replyTo.author.display_name}: “{replyTo.body.slice(0, 40)}…”
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-auto text-primary"
            >
              ยกเลิก
            </button>
          </p>
        ) : null}

        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="อยากบอกอะไรกลุ่ม พิมพ์ตรงนี้"
            onKeyDown={(e) => {
              // Enter sends, shift+enter is a newline — the messaging default
              // everyone already has in their fingers.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            size="icon"
            aria-label="ส่ง"
            loading={createComment.isPending}
            disabled={!body.trim()}
            onClick={send}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {roots.length === 0 ? (
        <EmptyState
          title="ยังไม่มีใครคุยอะไร"
          description="เริ่มจากถามว่าวันไหนอยากทำอะไรก็ได้"
        />
      ) : (
        <div className="space-y-3">
          {roots.map((comment) => (
            <Card key={comment.id}>
              <CommentRow
                comment={comment}
                isMine={comment.user_id === me?.id}
                canDelete={comment.user_id === me?.id || overview?.my_role === 'owner'}
                onReply={() => setReplyTo(comment)}
                onDelete={() => deleteComment.mutate(comment.id)}
              />

              {repliesOf(comment.id).length > 0 ? (
                <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {repliesOf(comment.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        isMine={reply.user_id === me?.id}
                        canDelete={reply.user_id === me?.id || overview?.my_role === 'owner'}
                        onDelete={() => deleteComment.mutate(reply.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  isMine,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: Comment;
  isMine: boolean;
  canDelete: boolean;
  onReply?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Avatar
        name={comment.author.display_name}
        avatarUrl={comment.author.avatar_url}
        characterId={comment.author.character_id}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-espresso">
            {comment.author.display_name}
            {isMine ? <span className="ml-1 text-xs font-normal text-muted">(คุณ)</span> : null}
          </span>
          <span className="ml-2 text-xs text-muted">{formatRelative(comment.created_at)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-espresso">{comment.body}</p>

        <div className="mt-1 flex gap-3 text-xs">
          {onReply ? (
            <button type="button" onClick={onReply} className="text-muted hover:text-primary">
              ตอบ
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={onDelete} className="text-muted hover:text-danger">
              ลบ
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
