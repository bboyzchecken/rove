'use client';

import { useState } from 'react';
import { AlertCircle, Check, CircleDashed, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { FieldLabel, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import { useTripMembers } from '@/features/trip/queries';
import { useAddWish, useRemoveWish, useWishlist } from '@/features/wishlist/queries';
import type { CoverageState, WishKind } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Wishlist editor + Coverage Board in one surface (M3 — W3.2, W3.3).
 *
 * The coverage state is the whole point of the screen: it answers "is my thing
 * actually in the plan?", which is what starts group arguments. Everyone may
 * add to their own list; only the owner deletes someone else's.
 */
const KIND_META: Record<WishKind, { label: string; tone: 'primary' | 'blue' | 'neutral' }> = {
  must: { label: 'ต้องไป', tone: 'primary' },
  nice: { label: 'ไปได้ก็ดี', tone: 'blue' },
  avoid: { label: 'ไม่เอา', tone: 'neutral' },
};

const COVERAGE_META: Record<
  CoverageState,
  { label: string; icon: typeof Check; className: string }
> = {
  covered: { label: 'อยู่ในแพลนแล้ว', icon: Check, className: 'text-success' },
  partial: { label: 'อยู่บางส่วน', icon: AlertCircle, className: 'text-warning' },
  uncovered: { label: 'ยังไม่ได้ใส่', icon: CircleDashed, className: 'text-danger' },
};

export function WishlistBoard({ tripId }: { tripId: string }) {
  const { data: items = [], isLoading } = useWishlist(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: me } = useMe();
  const removeWish = useRemoveWish(tripId);

  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<WishKind | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const visible = items.filter(
    (w) =>
      (memberFilter === 'all' || w.memberId === memberFilter) &&
      (kindFilter === 'all' || w.kind === kindFilter),
  );

  const isOwner = members.find((m) => m.id === me?.id)?.role === 'owner';

  return (
    <div className="space-y-4">
      {/* filters ------------------------------------------------------- */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <FilterChip active={memberFilter === 'all'} onClick={() => setMemberFilter('all')}>
          ทุกคน
        </FilterChip>
        {members.map((m) => (
          <FilterChip
            key={m.id}
            active={memberFilter === m.id}
            onClick={() => setMemberFilter(m.id)}
          >
            <CharacterAvatar characterId={m.characterId} size="xs" className="-ml-1" />
            {m.name}
          </FilterChip>
        ))}
      </div>

      <div className="flex gap-1.5">
        <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
          ทั้งหมด
        </FilterChip>
        {(Object.keys(KIND_META) as WishKind[]).map((kind) => (
          <FilterChip key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
            {KIND_META[kind].label}
          </FilterChip>
        ))}
      </div>

      {/* list ---------------------------------------------------------- */}
      <div className="space-y-2">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="rounded-brand bg-surface h-24 animate-pulse" />
            ))
          : null}

        {visible.map((item) => {
          const member = members.find((m) => m.id === item.memberId);
          const cov = COVERAGE_META[item.coverage];
          const CovIcon = cov.icon;
          const mine = item.memberId === me?.id;

          return (
            <Card key={item.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <CharacterAvatar characterId={member?.characterId ?? 'shiba'} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'text-ink text-sm font-medium',
                        item.kind === 'avoid' && 'text-muted line-through',
                      )}
                    >
                      {item.title}
                    </span>
                    <Badge tone={KIND_META[item.kind].tone}>{KIND_META[item.kind].label}</Badge>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-muted text-[11px]">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {item.note ? (
                    <p className="text-muted mt-1.5 text-xs leading-relaxed">{item.note}</p>
                  ) : null}

                  <div
                    className={cn(
                      'mt-2 flex items-center gap-1.5 text-[11px] font-medium',
                      cov.className,
                    )}
                  >
                    <CovIcon className="size-3.5" strokeWidth={2.5} />
                    {cov.label}
                    {item.itemId ? (
                      <span className="text-muted font-normal">· ดูในแพลน</span>
                    ) : null}
                  </div>
                </div>

                {mine || isOwner ? (
                  <button
                    aria-label={`ลบ ${item.title}`}
                    onClick={() => removeWish.mutate(item.id)}
                    className="text-muted hover:text-danger hover:bg-surface -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </Card>
          );
        })}

        {!isLoading && visible.length === 0 ? (
          <EmptyState
            image="/brand/empty/empty-wishlist.webp"
            title="ยังไม่มีอะไรตรงนี้"
            hint="ลองเอาตัวกรองออก หรือหย่อนที่อยากไปของตัวเองลงไปสักอย่าง"
          />
        ) : null}
      </div>

      <Button variant="outline" block size="lg" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> เพิ่มที่อยากไปของฉัน
      </Button>

      <AddWishDialog tripId={tripId} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddWishDialog({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const addWish = useAddWish(tripId);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<WishKind>('must');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');

  async function save() {
    if (!title.trim() || !me) return;
    await addWish.mutateAsync({
      memberId: me.id,
      kind,
      title: title.trim(),
      tags: tags
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
      note: note.trim() || undefined,
    });
    setTitle('');
    setTags('');
    setNote('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="เพิ่มที่อยากไป"
      description="เขียนสั้น ๆ ได้เลย — AI จะไปหาสถานที่จริงให้ตอนร่างแพลน"
      footer={
        <Button
          block
          size="lg"
          onClick={() => void save()}
          disabled={addWish.isPending || !title.trim()}
        >
          {addWish.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มลงรายการ'}
        </Button>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <FieldLabel>อยากไปไหน / อยากทำอะไร</FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น กินซูชิที่ตลาดปลา"
          />
        </label>

        <div>
          <FieldLabel>สำคัญแค่ไหน</FieldLabel>
          <div className="flex gap-1.5">
            {(Object.keys(KIND_META) as WishKind[]).map((option) => (
              <button
                key={option}
                onClick={() => setKind(option)}
                className={cn(
                  'flex-1 rounded-full px-3 py-2 text-xs font-medium transition',
                  kind === option ? 'bg-ink text-bg' : 'bg-surface text-muted',
                )}
              >
                {KIND_META[option].label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <FieldLabel>แท็ก (ไม่ใส่ก็ได้)</FieldLabel>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ของกิน ถ่ายรูป"
          />
        </label>

        <label className="block">
          <FieldLabel>โน้ตถึงเพื่อน</FieldLabel>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="เช่น ขอเป็นเช้า ๆ คนจะได้ไม่เยอะ"
          />
        </label>
      </div>
    </Sheet>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
        active ? 'bg-ink text-bg' : 'bg-surface text-muted hover:bg-border',
      )}
    >
      {children}
    </button>
  );
}
