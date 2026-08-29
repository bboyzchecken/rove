'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarPlus, Minus, Plus, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useAdaptPreview, useCloneAdapted } from '@/features/public/queries';
import type { AdaptChange, AdaptDiff, Trip } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * "ปรับให้เข้ากับทริปฉัน" (A11.4).
 *
 * The published plan was built for somebody else's dates, group and budget.
 * This is where you say what yours are, see exactly what that would change,
 * and only then take the copy — the preview writes nothing, so changing your
 * mind costs nothing.
 */
export function AdaptDialog({
  open,
  onClose,
  tokenOrSlug,
  source,
}: {
  open: boolean;
  onClose: () => void;
  tokenOrSlug: string;
  source: Trip;
}) {
  const router = useRouter();

  const [days, setDays] = useState(source.nights + 1);
  const [partySize, setPartySize] = useState(source.partySize);
  const [budget, setBudget] = useState(source.budgetPerPersonThb || 0);
  const [startDate, setStartDate] = useState(source.startDate);

  const input = {
    days,
    partySize,
    budgetPerPersonThb: budget || undefined,
    startDate: startDate || undefined,
  };

  const preview = useAdaptPreview(tokenOrSlug, input, open);
  const take = useCloneAdapted();

  const diff = preview.data;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ปรับให้เข้ากับทริปของคุณ"
      description="บอกกรอบของกลุ่มคุณ แล้วดูว่าแพลนนี้จะเปลี่ยนตรงไหนบ้าง — ยังไม่บันทึกอะไรจนกว่าจะกดยืนยัน"
      footer={
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={onClose} disabled={take.isPending}>
            ยกเลิก
          </Button>
          <Button
            className="flex-1"
            disabled={take.isPending || preview.isLoading}
            onClick={() =>
              take.mutate(
                { tokenOrSlug, input },
                { onSuccess: ({ trip }) => router.push(`/t/${trip.id}` as never) },
              )
            }
          >
            {take.isPending ? 'กำลังปรับ…' : 'เอาแพลนนี้ไป'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>กี่วัน</FieldLabel>
          <Stepper value={days} min={1} max={30} onChange={setDays} suffix="วัน" />
        </div>
        <div>
          <FieldLabel>ไปกี่คน</FieldLabel>
          <Stepper value={partySize} min={1} max={30} onChange={setPartySize} suffix="คน" />
        </div>
        <div>
          <FieldLabel>เริ่มวันไหน</FieldLabel>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>งบต่อคน (บาท)</FieldLabel>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={budget || ''}
            placeholder="ไม่จำกัด"
            onChange={(e) => setBudget(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="mt-5">
        {preview.isLoading && !diff ? (
          <div className="rounded-brand bg-surface h-28 animate-pulse" />
        ) : null}

        {preview.isError ? (
          <p className="text-warning text-xs">ดูตัวอย่างไม่สำเร็จ — ลองเปลี่ยนตัวเลขแล้วลองใหม่</p>
        ) : null}

        {diff ? <AdaptSummary diff={diff} /> : null}
      </div>

      {take.isError ? (
        <p className="text-warning mt-3 text-xs">ปรับแพลนไม่สำเร็จ — ลองใหม่อีกครั้ง</p>
      ) : null}
    </Sheet>
  );
}

function AdaptSummary({ diff }: { diff: AdaptDiff }) {
  const money = (n: number) => `${Math.round(n).toLocaleString('th-TH')} ${diff.currency}`;

  return (
    <div>
      <div className="bg-surface rounded-brand flex items-center justify-around p-3 text-center">
        <Column label="วัน" from={diff.before.days} to={diff.after.days} />
        <ArrowRight className="text-muted size-4 shrink-0" />
        <Column label="ที่เที่ยว" from={diff.before.items} to={diff.after.items} />
        <ArrowRight className="text-muted size-4 shrink-0" />
        <Column
          label="ต่อคน"
          from={money(diff.before.costPerPersonDest)}
          to={money(diff.after.costPerPersonDest)}
        />
      </div>

      {diff.warnings.map((warning) => (
        <p key={warning} className="text-warning mt-3 text-xs leading-relaxed">
          {warning}
        </p>
      ))}

      {diff.changes.length === 0 ? (
        <p className="text-muted mt-3 text-xs">
          กรอบของคุณตรงกับแพลนนี้อยู่แล้ว — ก๊อปไปได้เลยโดยไม่ต้องตัดอะไร
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {diff.changes.map((change, i) => (
            <ChangeLine key={`${change.kind}-${change.itemTitle}-${i}`} change={change} />
          ))}
        </ul>
      )}
    </div>
  );
}

const CHANGE_META: Record<AdaptChange['kind'], { icon: typeof Plus; tone: string }> = {
  day_added: { icon: CalendarPlus, tone: 'text-green' },
  day_removed: { icon: Minus, tone: 'text-muted' },
  item_removed: { icon: Minus, tone: 'text-muted' },
  item_moved: { icon: Wand2, tone: 'text-primary' },
};

function ChangeLine({ change }: { change: AdaptChange }) {
  const { icon: Icon, tone } = CHANGE_META[change.kind];
  const what = change.itemTitle || change.dayLabel;

  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed">
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', tone)} />
      <span className="text-ink">
        {what}
        <span className="text-muted"> — {change.reason}</span>
      </span>
    </li>
  );
}

function Column({
  label,
  from,
  to,
}: {
  label: string;
  from: string | number;
  to: string | number;
}) {
  const changed = from !== to;
  return (
    <div className="min-w-0">
      <p className="text-muted text-[11px]">{label}</p>
      <p className="nums text-ink text-sm font-medium">
        {changed ? (
          <>
            <span className="text-muted line-through">{from}</span> {to}
          </>
        ) : (
          to
        )}
      </p>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (next: number) => void;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));

  return (
    <div className="bg-field border-field-border flex items-center justify-between rounded-2xl border px-2 py-1.5">
      <button
        type="button"
        aria-label={`ลด${suffix}`}
        className="text-ink hover:bg-surface rounded-full p-1.5 transition disabled:opacity-40"
        onClick={() => step(-1)}
        disabled={value <= min}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="nums text-ink text-sm font-medium">
        {value} {suffix}
      </span>
      <button
        type="button"
        aria-label={`เพิ่ม${suffix}`}
        className="text-ink hover:bg-surface rounded-full p-1.5 transition disabled:opacity-40"
        onClick={() => step(1)}
        disabled={value >= max}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
