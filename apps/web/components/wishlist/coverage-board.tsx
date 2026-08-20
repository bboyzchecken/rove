'use client';

import Link from 'next/link';
import { AlertTriangle, Check, CircleDashed, MinusCircle } from 'lucide-react';

import { useCoverage } from '@/features/wishlist/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, SkeletonList } from '@/components/ui/states';
import type { CoverageRow, CoverageStatus, MemberView } from '@/types/api';

/**
 * W3.3 — the Coverage Board. This is the screen the whole product is built
 * around: it answers "did my wish actually make it into the plan?" without
 * anyone reading a seven-day itinerary line by line (DEV_SPEC §1).
 *
 * An `avoid` wish inverts: uncovered means the plan violated it, which is a
 * problem, not a gap.
 */

const STATUS: Record<
  CoverageStatus,
  { icon: typeof Check; label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  covered: { icon: Check, label: 'อยู่ในแพลนแล้ว', tone: 'success' },
  partial: { icon: CircleDashed, label: 'มีใกล้เคียง', tone: 'warning' },
  uncovered: { icon: AlertTriangle, label: 'ยังไม่อยู่ในแพลน', tone: 'danger' },
  na: { icon: MinusCircle, label: 'เลี่ยงให้แล้ว', tone: 'neutral' },
};

export function CoverageBoard({
  tripId,
  planId,
  members,
}: {
  tripId: string;
  planId?: string;
  members: MemberView[];
}) {
  const { data, isLoading } = useCoverage(tripId, planId);

  if (isLoading) return <SkeletonList rows={3} />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีที่อยากไปให้เทียบ"
        description="พอทุกคนใส่ที่อยากไปแล้ว ตรงนี้จะบอกว่าของใครได้ลงแพลนบ้าง"
      />
    );
  }

  if (!data.plan_id) {
    return (
      <EmptyState
        title="ยังไม่มีแพลนให้เทียบ"
        description="กดให้ AI ร่างแพลนก่อน แล้วกลับมาดูว่าที่อยากไปของแต่ละคนได้ลงครบไหม"
        action={
          <Link
            href={`/t/${tripId}/plan`}
            className="rounded-brand bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
          >
            ไปหน้าแพลน
          </Link>
        }
      />
    );
  }

  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const { stats } = data;

  // Problems first: an uncovered must-do is the reason to open this screen.
  const sorted = [...data.items].sort((a, b) => rank(a) - rank(b));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ที่อยากไป vs แพลนจริง</CardTitle>
          <CardDescription>
            ลงแล้ว {Math.round(stats.covered_percent)}% ของทั้งหมด {stats.total} รายการ
          </CardDescription>
        </div>
        {stats.must_uncovered > 0 ? (
          <Badge tone="danger">ตกหล่น {stats.must_uncovered} รายการสำคัญ</Badge>
        ) : (
          <Badge tone="success">ครบทุกรายการสำคัญ</Badge>
        )}
      </CardHeader>

      <div
        className="mb-4 h-2 overflow-hidden rounded-full bg-espresso/8"
        role="progressbar"
        aria-valuenow={Math.round(stats.covered_percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="สัดส่วนที่อยากไปที่ได้ลงแพลน"
      >
        <div
          className="h-full rounded-full bg-matcha transition-all"
          style={{ width: `${stats.covered_percent}%` }}
        />
      </div>

      <ul className="space-y-1">
        {sorted.map((row) => {
          const config = STATUS[row.status];
          return (
            <li key={row.wishlist_item_id} className="flex items-start gap-3 rounded-brand px-1 py-2">
              <config.icon
                className={
                  row.status === 'covered'
                    ? 'mt-0.5 h-4 w-4 shrink-0 text-matcha'
                    : row.status === 'uncovered'
                      ? 'mt-0.5 h-4 w-4 shrink-0 text-danger'
                      : 'mt-0.5 h-4 w-4 shrink-0 text-muted'
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-espresso">
                  {row.text}
                  {row.kind === 'must' ? (
                    <span className="ml-1.5 text-xs text-primary">ต้องไปให้ได้</span>
                  ) : row.kind === 'avoid' ? (
                    <span className="ml-1.5 text-xs text-danger">ขอเลี่ยง</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {names.get(row.member_id) ?? 'สมาชิก'} · {row.note || config.label}
                </p>
              </div>
              {row.item_ids.length > 0 && planId ? (
                <Link
                  href={`/t/${tripId}/plan#item-${row.item_ids[0]}`}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  ดูในแพลน
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Uncovered must-dos first, then other gaps, then the things that are fine. */
function rank(row: CoverageRow): number {
  if (row.status === 'uncovered' && row.kind === 'must') return 0;
  if (row.status === 'uncovered' && row.kind === 'avoid') return 1;
  if (row.status === 'uncovered') return 2;
  if (row.status === 'partial') return 3;
  if (row.status === 'covered') return 4;
  return 5;
}
