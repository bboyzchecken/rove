'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Lock,
  LockOpen,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAiVariants } from '@/features/ai/queries';
import {
  useAdoptVariant,
  useForkVariant,
  useFreezePlan,
  useRemoveVariant,
  useTripConflicts,
  useVariants,
  useVoteVariant,
} from '@/features/plan/queries';
import { useMe } from '@/features/auth/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { PlanVariant, VariantMetrics } from '@/lib/data';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Compare page (M6 — W6.1/W6.2): the live plan as the baseline column, every
 * candidate beside it, and the group's thumbs deciding which one the owner
 * adopts. Variants are read-only on purpose — adopting one is what makes it
 * editable, as the live plan.
 */
export function CompareScreen({ tripId }: { tripId: string }) {
  const { data } = useVariants(tripId);
  const { data: conflicts = [] } = useTripConflicts(tripId);
  const { data: me } = useMe();
  const { data: members = [] } = useTripMembers(tripId);

  const generation = useAiVariants(tripId);
  const fork = useForkVariant(tripId);
  const freeze = useFreezePlan(tripId);

  const isOwner = members.find((m) => m.id === me?.id)?.role === 'owner';
  const frozen = data?.frozen ?? false;
  const variants = data?.variants ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/t/${tripId}/plan` as never}
          className="text-muted hover:text-ink flex items-center gap-1.5 text-sm font-medium"
        >
          <ArrowLeft className="size-4" />
          กลับไปที่แพลน
        </Link>

        {isOwner ? (
          <Button
            variant={frozen ? 'soft' : 'ink'}
            size="sm"
            onClick={() => freeze.mutate(!frozen)}
            disabled={freeze.isPending}
          >
            {frozen ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
            {frozen ? 'ปลดล็อกแพลน' : 'ตกลงตามนี้ — สรุปแพลน'}
          </Button>
        ) : null}
      </div>

      {frozen ? (
        <Card accent="yellow" className="flex items-center gap-3 p-4">
          <Lock className="text-ink size-4 shrink-0" />
          <p className="text-ink text-sm">
            แพลนถูกสรุปแล้ว — แก้ไทม์ไลน์และสลับแพลนไม่ได้จนกว่าเจ้าของทริปจะปลดล็อก
          </p>
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <section>
          <SectionHeader label="เช็คก่อนร่าง — กลุ่มยังเห็นไม่ตรงกัน" />
          <div className="space-y-2">
            {conflicts.map((conflict, i) => (
              <Card
                key={`${conflict.kind}-${i}`}
                accent={conflict.severity === 'error' ? 'primary' : 'yellow'}
                className="flex items-start gap-3 p-3.5"
              >
                <AlertTriangle className="text-ink mt-0.5 size-4 shrink-0" />
                <p className="text-ink text-xs leading-relaxed">{conflict.message}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader label="สร้างตัวเลือกมาเทียบ" />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void generation.start({ count: 2 })}
            disabled={generation.isRunning || frozen}
          >
            <Sparkles className="size-3.5" />
            ให้ AI ร่าง 2 แบบ
          </Button>
          <Button
            size="sm"
            variant="soft"
            onClick={() => void generation.start({ count: 3 })}
            disabled={generation.isRunning || frozen}
          >
            <Sparkles className="size-3.5" />
            ร่าง 3 แบบ
          </Button>
          <Button
            size="sm"
            variant="outline"
            // "แพลนเดิม", not "แพลนปัจจุบัน": the moment it is forked it is the
            // OLD plan, and the baseline column already owns the other name.
            onClick={() => fork.mutate({ label: 'แพลนเดิม (เก็บไว้)' })}
            disabled={fork.isPending}
          >
            <CopyPlus className="size-3.5" />
            เก็บแพลนปัจจุบันไว้ก่อน
          </Button>
        </div>
        <p className="text-muted mt-1.5 text-[11px]">
          ร่างหลายแบบใช้สิทธิ์ AI ตามจำนวนแบบ — เก็บแพลนปัจจุบันเป็นตัวเลือกก่อนสลับ จะได้ย้อนกลับได้เสมอ
        </p>

        {generation.isRunning && generation.job ? (
          <Card className="mt-3 p-4">
            <p className="text-ink text-sm font-medium">{generation.job.step}</p>
            <Progress value={generation.job.progress} tone="ink" className="mt-2" />
          </Card>
        ) : null}
        {generation.error ? (
          <Card accent="primary" className="mt-3 p-3.5">
            <p className="text-ink text-xs">{generation.error}</p>
          </Card>
        ) : null}
      </section>

      {variants.length > 0 && data ? (
        <section>
          <SectionHeader label={`เทียบกันชัดๆ (${variants.length + 1} แพลน)`} />
          <CompareTable current={data.current} variants={variants} />
        </section>
      ) : null}

      {variants.length === 0 && !generation.isRunning ? (
        <Card className="p-6 text-center">
          <p className="text-ink text-sm font-medium">ยังไม่มีตัวเลือกให้เทียบ</p>
          <p className="text-muted mt-1 text-xs leading-relaxed">
            ให้ AI ร่าง 2–3 แบบตามจังหวะต่างกัน แล้วชวนเพื่อนมาโหวตว่าไปทางไหนดี
          </p>
        </Card>
      ) : null}

      {variants.map((variant) => (
        <VariantCard
          key={variant.id}
          tripId={tripId}
          variant={variant}
          isOwner={isOwner}
          frozen={frozen}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the table -- */

const METRIC_ROWS: {
  key: keyof VariantMetrics | 'must';
  label: string;
  render: (m: VariantMetrics) => string;
}[] = [
  { key: 'itemCount', label: 'จำนวนที่', render: (m) => `${m.itemCount} ที่ / ${m.dayCount} วัน` },
  {
    key: 'perPersonThb',
    label: 'ค่าใช้จ่ายต่อคน*',
    render: (m) => `฿${m.perPersonThb.toLocaleString('th-TH')}`,
  },
  { key: 'travelMinutes', label: 'เวลาเดินทางรวม', render: (m) => formatDuration(m.travelMinutes) },
  { key: 'coveragePercent', label: 'ตรงกับที่อยากไป', render: (m) => `${m.coveragePercent}%` },
  { key: 'must', label: 'must-do ที่ได้ไป', render: (m) => `${m.mustCovered}/${m.mustTotal}` },
  { key: 'warningCount', label: 'จุดที่ควรดูอีกที', render: (m) => `${m.warningCount}` },
];

function CompareTable({
  current,
  variants,
}: {
  current: VariantMetrics;
  variants: PlanVariant[];
}) {
  const columns = [{ id: 'current', label: 'แพลนปัจจุบัน', metrics: current }].concat(
    variants.map((v) => ({ id: v.id, label: v.label, metrics: v.metrics })),
  );

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-border border-b">
            <th className="text-muted p-3 font-medium">ตัวชี้วัด</th>
            {columns.map((col, i) => (
              <th
                key={col.id}
                className={cn('text-ink p-3 font-medium', i === 0 && 'text-muted')}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => (
            <tr key={row.key} className="border-border border-b last:border-0">
              <td className="text-muted p-3">{row.label}</td>
              {columns.map((col) => (
                <td key={col.id} className="text-ink nums p-3 font-medium">
                  {row.render(col.metrics)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted px-3 pb-3 text-[10px]">
        *ประมาณการจากรายการในแพลน อัตราแลกเปลี่ยนโดยประมาณ
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------- variant card -- */

function VariantCard({
  tripId,
  variant,
  isOwner,
  frozen,
}: {
  tripId: string;
  variant: PlanVariant;
  isOwner: boolean;
  frozen: boolean;
}) {
  const vote = useVoteVariant(tripId);
  const adopt = useAdoptVariant(tripId);
  const remove = useRemoveVariant(tripId);
  const [showDays, setShowDays] = useState(false);

  const castVote = (value: -1 | 1) => {
    // Tapping the same thumb again clears it.
    vote.mutate({ variantId: variant.id, value: variant.votes.mine === value ? 0 : value });
  };

  return (
    <Card accent={variant.source === 'ai' ? 'blue' : 'pink'} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">
            {variant.label}
            {variant.source === 'fork' ? (
              <span className="text-muted ml-2 text-[10px] font-medium">เก็บไว้จากแพลนจริง</span>
            ) : null}
          </p>
          {variant.keyDecision ? (
            <p className="text-muted mt-0.5 text-xs">{variant.keyDecision}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => castVote(1)}
            aria-label="โหวตให้แพลนนี้"
            className={cn(
              'flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition',
              variant.votes.mine === 1
                ? 'bg-ink text-bg'
                : 'bg-bg/70 text-ink hover:bg-bg',
            )}
          >
            <ThumbsUp className="size-3.5" />
            {variant.votes.up}
          </button>
          <button
            onClick={() => castVote(-1)}
            aria-label="ไม่เอาแพลนนี้"
            className={cn(
              'flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition',
              variant.votes.mine === -1
                ? 'bg-ink text-bg'
                : 'bg-bg/70 text-ink hover:bg-bg',
            )}
          >
            <ThumbsDown className="size-3.5" />
            {variant.votes.down}
          </button>
        </div>
      </div>

      {(variant.pros.length > 0 || variant.cons.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {variant.pros.length > 0 ? (
            <ul className="space-y-1">
              {variant.pros.map((pro) => (
                <li key={pro} className="text-ink flex items-start gap-1.5 text-xs">
                  <Check className="text-success mt-0.5 size-3 shrink-0" strokeWidth={3} />
                  {pro}
                </li>
              ))}
            </ul>
          ) : null}
          {variant.cons.length > 0 ? (
            <ul className="space-y-1">
              {variant.cons.map((con) => (
                <li key={con} className="text-muted flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {con}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <button
        onClick={() => setShowDays((s) => !s)}
        className="text-muted hover:text-ink mt-3 flex items-center gap-1 text-xs font-medium"
      >
        {showDays ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {showDays ? 'ซ่อนไทม์ไลน์' : `ดูไทม์ไลน์ (${variant.metrics.dayCount} วัน)`}
      </button>

      {showDays ? (
        <div className="mt-2 space-y-3">
          {variant.days.map((day) => (
            <div key={day.id} className="bg-bg/70 rounded-2xl p-3">
              <p className="text-ink text-xs font-medium">
                {day.label} · {day.city}
              </p>
              <ul className="mt-1.5 space-y-1">
                {day.items.map((item) => (
                  <li key={item.id} className="text-ink flex gap-2 text-xs">
                    <span className="text-muted nums w-10 shrink-0">{item.start}</span>
                    {item.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={() => remove.mutate(variant.id)}
          aria-label="ลบตัวเลือกนี้"
          className="text-muted hover:text-ink flex items-center gap-1 text-xs"
        >
          <Trash2 className="size-3.5" />
          ลบ
        </button>

        {isOwner ? (
          <Button
            size="sm"
            onClick={() => adopt.mutate(variant.id)}
            disabled={adopt.isPending || frozen}
          >
            ใช้แพลนนี้
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
