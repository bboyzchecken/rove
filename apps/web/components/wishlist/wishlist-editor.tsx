'use client';

import { useState } from 'react';
import { Ban, Heart, Star, Trash2 } from 'lucide-react';

import {
  useCreateWish,
  useDeleteWish,
  useUpdateWish,
  useWishlist,
} from '@/features/wishlist/queries';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import type { MemberView, WishKind, WishlistItem } from '@/types/api';

/**
 * W3.2 — the wishlist editor.
 *
 * Grouped by member on purpose: the product's premise is that a trip is a
 * negotiation between people, so seeing whose wish is whose matters more than
 * one flat list. You may edit your own rows; the owner may tidy anyone's.
 */

const KINDS: Record<WishKind, { label: string; icon: typeof Star; tone: string }> = {
  must: { label: 'ต้องไปให้ได้', icon: Star, tone: 'text-primary' },
  nice: { label: 'ได้ก็ดี', icon: Heart, tone: 'text-muted' },
  avoid: { label: 'ขอเลี่ยง', icon: Ban, tone: 'text-danger' },
};

const KIND_ORDER: WishKind[] = ['must', 'nice', 'avoid'];

export function WishlistEditor({
  tripId,
  members,
  meId,
  canEdit,
  isOwner,
}: {
  tripId: string;
  members: MemberView[];
  meId?: string;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const { data, isLoading, error, refetch } = useWishlist(tripId);

  if (isLoading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState onRetry={() => void refetch()} />;

  const items = data?.items ?? [];
  const byMember = new Map<string, WishlistItem[]>();
  for (const item of items) {
    byMember.set(item.member_id, [...(byMember.get(item.member_id) ?? []), item]);
  }

  // The current user's list first — they came here to add to their own.
  const ordered = [...members].sort((a, b) => {
    if (a.user_id === meId) return -1;
    if (b.user_id === meId) return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {ordered.map((member) => (
        <MemberWishlist
          key={member.user_id}
          tripId={tripId}
          member={member}
          items={byMember.get(member.user_id) ?? []}
          canAdd={canEdit && member.user_id === meId}
          canEdit={canEdit && (member.user_id === meId || isOwner)}
          isMe={member.user_id === meId}
        />
      ))}
    </div>
  );
}

function MemberWishlist({
  tripId,
  member,
  items,
  canAdd,
  canEdit,
  isMe,
}: {
  tripId: string;
  member: MemberView;
  items: WishlistItem[];
  canAdd: boolean;
  canEdit: boolean;
  isMe: boolean;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<WishKind>('nice');

  const createWish = useCreateWish(tripId);
  const deleteWish = useDeleteWish(tripId);
  const updateWish = useUpdateWish(tripId);

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    createWish.mutate(
      { text: trimmed, kind },
      {
        onSuccess: () => {
          setText('');
          // Kind stays put: people add three "must" rows in a row.
        },
      },
    );
  }

  return (
    <Card tone={isMe ? 'primary' : 'plain'}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Avatar
            name={member.display_name}
            avatarUrl={member.avatar_url}
            characterId={member.character_id}
            size="sm"
          />
          <CardTitle>
            {member.display_name}
            {isMe ? <span className="ml-1 text-xs font-normal text-muted">(คุณ)</span> : null}
          </CardTitle>
        </div>
        <span className="text-xs text-muted">{items.length} รายการ</span>
      </CardHeader>

      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">
          {isMe
            ? 'ยังไม่ได้ใส่อะไรเลย — ใส่สัก 3 ที่ก่อนก็พอ'
            : `${member.display_name}ยังไม่ได้ใส่ที่อยากไป`}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="group flex items-center gap-2 rounded-brand px-1 py-1.5">
              <KindIcon kind={item.kind} />

              <span className="min-w-0 flex-1 text-sm text-espresso">{item.text}</span>

              {item.coverage === 'covered' ? (
                <Badge tone="success">อยู่ในแพลนแล้ว</Badge>
              ) : item.coverage === 'partial' ? (
                <Badge tone="warning">ใกล้เคียง</Badge>
              ) : null}

              {canEdit ? (
                <>
                  <Select
                    value={item.kind}
                    aria-label="ความสำคัญ"
                    onChange={(e) =>
                      updateWish.mutate({
                        id: item.id,
                        text: item.text,
                        kind: e.target.value as WishKind,
                      })
                    }
                    className="h-8 w-auto border-0 bg-transparent py-0 text-xs opacity-0 focus:opacity-100 group-hover:opacity-100"
                  >
                    {KIND_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {KINDS[key].label}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    aria-label={`ลบ ${item.text}`}
                    onClick={() => deleteWish.mutate(item.id)}
                    className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <div className="mt-3 flex gap-2">
          <Select
            value={kind}
            aria-label="ความสำคัญ"
            onChange={(e) => setKind(e.target.value as WishKind)}
            className="w-36 shrink-0"
          >
            {KIND_ORDER.map((key) => (
              <option key={key} value={key}>
                {KINDS[key].label}
              </option>
            ))}
          </Select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder="เช่น กินราเมงร้านดัง, ขึ้นตึกสูงดูวิว"
          />
          <Button loading={createWish.isPending} disabled={!text.trim()} onClick={add}>
            เพิ่ม
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function KindIcon({ kind }: { kind: WishKind }) {
  const config = KINDS[kind] ?? KINDS.nice;
  return (
    <config.icon className={cn('h-4 w-4 shrink-0', config.tone)} aria-label={config.label} />
  );
}
