'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { monthDates, monthStartDow, parseIsoDate, shiftMonth, thaiMonthLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * The one month grid (Feedback #2 — F0.2, F3.7).
 *
 * The date field's popover and the availability calendar used to be two
 * calendars that agreed by luck. They now share the weekday row, the padding
 * and the month arithmetic here, and differ only in what a day cell renders —
 * which is the caller's `renderDay`.
 *
 * Sunday first, Thai weekday initials: the way a Thai wall calendar is printed.
 */
export const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

export function MonthGrid({
  month,
  renderDay,
  gap = 'gap-1',
  className,
}: {
  /** "yyyy-mm-01". */
  month: string;
  renderDay: (iso: string, day: number) => React.ReactNode;
  gap?: string;
  className?: string;
}) {
  const dates = monthDates(month);
  const pad = monthStartDow(month);

  return (
    <div className={className}>
      <div className={cn('grid grid-cols-7', gap)}>
        {WEEKDAYS_TH.map((label, index) => (
          <div
            key={label}
            className={cn(
              'pb-1 text-center text-[11px] font-medium',
              index === 0 || index === 6 ? 'text-ink/70' : 'text-muted',
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div className={cn('grid grid-cols-7', gap)}>
        {Array.from({ length: pad }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {dates.map((iso) => renderDay(iso, parseIsoDate(iso).getDate()))}
      </div>
    </div>
  );
}

/** ‹ พฤศจิกายน 2569 › — the month stepper both calendars wear. */
export function MonthNav({
  month,
  onChange,
  canPrev = true,
  canNext = true,
  className,
}: {
  month: string;
  onChange: (month: string) => void;
  canPrev?: boolean;
  canNext?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-1', className)}>
      <button
        type="button"
        aria-label="เดือนก่อนหน้า"
        disabled={!canPrev}
        onClick={() => onChange(shiftMonth(month, -1))}
        className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="font-display text-ink text-sm font-medium">{thaiMonthLabel(month)}</span>
      <button
        type="button"
        aria-label="เดือนถัดไป"
        disabled={!canNext}
        onClick={() => onChange(shiftMonth(month, 1))}
        className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
