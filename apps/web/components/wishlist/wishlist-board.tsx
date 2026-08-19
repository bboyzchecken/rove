'use client';

import { useState } from 'react';
import { AlertCircle, Check, CircleDashed, Plus } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { MEMBERS, WISHLIST, type CoverageState, type WishKind } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * Wishlist editor + Coverage Board in one surface (M3 — W3.2, W3.3).
 *
 * The coverage state is the whole point of the screen: it answers "is my thing
 * actually in the plan?", which is what starts group arguments.
 */
const KIND_META: Record<WishKind, { label: string; tone: 'primary' | 'sky' | 'neutral' }> = {
  must: { label: 'ต้องไป', tone: 'primary' },
  nice: { label: 'ไปได้ก็ดี', tone: 'sky' },
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

export function WishlistBoard() {
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<WishKind | 'all'>('all');

  const items = WISHLIST.filter(
    (w) =>
      (memberFilter === 'all' || w.memberId === memberFilter) &&
      (kindFilter === 'all' || w.kind === kindFilter),
  );

  return (
    <div className="space-y-4">
      {/* filters ------------------------------------------------------- */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <FilterChip active={memberFilter === 'all'} onClick={() => setMemberFilter('all')}>
          ทุกคน
        </FilterChip>
        {MEMBERS.map((m) => (
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
        {items.map((item) => {
          const member = MEMBERS.find((m) => m.id === item.memberId)!;
          const cov = COVERAGE_META[item.coverage];
          const CovIcon = cov.icon;

          return (
            <Card key={item.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <CharacterAvatar characterId={member.characterId} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'text-espresso text-sm font-semibold',
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
                      'mt-2 flex items-center gap-1.5 text-[11px] font-semibold',
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
              </div>
            </Card>
          );
        })}

        {items.length === 0 ? (
          <EmptyState
            image="/brand/empty/empty-wishlist.webp"
            title="ยังไม่มีอะไรตรงนี้"
            hint="ลองเอาตัวกรองออก หรือหย่อนที่อยากไปของตัวเองลงไปสักอย่าง"
          />
        ) : null}
      </div>

      <Button variant="outline" block size="lg">
        <Plus className="size-4" /> เพิ่มที่อยากไปของฉัน
      </Button>
    </div>
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
        active ? 'bg-espresso text-bg' : 'bg-surface text-muted hover:bg-border',
      )}
    >
      {children}
    </button>
  );
}
