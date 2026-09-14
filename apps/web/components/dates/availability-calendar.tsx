'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';

import { MonthGrid } from '@/components/ui/month-grid';
import { useVariant } from '@/components/uat/variant-provider';
import type { AvailabilityBoard } from '@/lib/data';
import { daysInMonth, parseIsoDate, toIsoDate } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * The month grid every member paints their own days on (M2.5 — W2.8), redrawn
 * for Feedback #2 (D-13, F3.7, หน้า 20, 14:42–16:05).
 *
 * ONE grid, ONE gesture: tap a day and it is yours, tap again and it is not.
 * The old two-tab board ("ใส่วันว่างของฉัน" / "เลือกช่วงทริป") made the
 * tester hunt for which mode they were in; the range is now something the
 * board suggests and the owner locks, not something anybody paints.
 *
 * The colour of a day is HOW MANY people are free on it, in four steps and
 * with no borders — the borders were what made the old grid look like a form.
 * Two colour sets ship behind the UAT switcher (`avail-colors`): the tester's
 * own pick of four brand colours, and one green in four depths.
 *
 * My own days carry a mark ON TOP of the colour (a black tick), so a person
 * sees both what the group looks like and what they themselves said.
 */

export type HeatLevel = 'none' | 'few' | 'most' | 'all';

/** Free-member ratio → step. Four steps, because the tester asked for four. */
export function heatLevel(free: number, total: number): HeatLevel {
  if (total === 0 || free === 0) return 'none';
  if (free >= total) return 'all';
  return free / total < 0.5 ? 'few' : 'most';
}

export const HEAT_LABEL: Record<HeatLevel, string> = {
  none: 'ยังไม่มีใครว่าง',
  few: 'ว่างไม่ถึงครึ่ง',
  most: 'ว่างเกินครึ่ง',
  all: 'ว่างครบทุกคน',
};

/**
 * The two sets (D-13). Set 1 is the tester's — four hues, each a brand token,
 * read as four distinct states. Set 2 is one hue read as a scale. Both are
 * §2.3-safe: the loudest cell is the solid half, everything else is light.
 */
export const HEAT_SETS = {
  multi: {
    label: 'ส้ม / ฟ้า / ชมพู / เขียว',
    none: 'bg-surface',
    few: 'bg-orange-light',
    most: 'bg-blue-light',
    all: 'bg-green-solid',
    legendAll: 'bg-green-solid',
  },
  mono: {
    label: 'เขียวไล่เข้ม',
    none: 'bg-surface',
    few: 'bg-green-light/50',
    most: 'bg-green-light',
    all: 'bg-green-solid',
    legendAll: 'bg-green-solid',
  },
} as const;

export function AvailabilityCalendar({
  board,
  meId,
  onToggleDay,
  highlight,
  readOnly = false,
}: {
  board: AvailabilityBoard;
  meId: string;
  /** Tap = my day on or off. */
  onToggleDay: (date: string, free: boolean) => void;
  /** A window to outline — the suggestion the owner is looking at. */
  highlight?: { start: string; end: string } | null;
  readOnly?: boolean;
}) {
  const set = HEAT_SETS[useVariant('avail-colors')];
  const total = board.members.length;

  const byDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of board.entries) {
      if (entry.mark !== 'free') continue;
      const row = map.get(entry.date) ?? new Set<string>();
      row.add(entry.memberId);
      map.set(entry.date, row);
    }
    return map;
  }, [board.entries]);

  const locked = board.locked;
  const today = toIsoDate(new Date());
  const inLocked = (date: string) =>
    Boolean(locked && date >= locked.startDate && date <= locked.endDate);
  const inHighlight = (date: string) =>
    Boolean(highlight && date >= highlight.start && date <= highlight.end);

  return (
    <div className="rounded-brand bg-bg border-border overflow-hidden border">
      <MonthGrid
        month={board.month}
        className="px-2 pt-3 pb-2"
        renderDay={(date, day) => {
          const free = byDate.get(date) ?? new Set<string>();
          const mine = free.has(meId);
          const level = heatLevel(free.size, total);
          const past = date < today;

          return (
            <button
              key={date}
              type="button"
              disabled={readOnly || past}
              onClick={() => onToggleDay(date, !mine)}
              aria-pressed={mine}
              aria-label={`${day} — ว่าง ${free.size} จาก ${total} คน${mine ? ' (ฉันว่าง)' : ''}`}
              title={`${HEAT_LABEL[level]} · ${free.size}/${total}`}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center rounded-[0.85rem] transition',
                set[level],
                past && 'opacity-40',
                !readOnly && !past && 'active:scale-[0.96]',
                inLocked(date) && 'ring-ink ring-2 ring-inset',
                !inLocked(date) && inHighlight(date) && 'ring-ink/50 ring-2 ring-inset',
              )}
            >
              <span
                className={cn(
                  'nums text-[13px] leading-none font-medium',
                  level === 'none' ? 'text-muted' : 'text-ink',
                  parseIsoDate(date).getDay() % 6 === 0 && level === 'none' && 'text-ink/60',
                )}
              >
                {day}
              </span>
              {/* "n/4" only once somebody is free — a row of zeroes is noise. */}
              {free.size > 0 ? (
                <span className="text-ink/70 nums mt-1 text-[9px] leading-none">
                  {free.size}/{total}
                </span>
              ) : null}
              {/* My own mark rides on top of the group colour (D-13). */}
              {mine ? (
                <span className="bg-ink text-bg absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
              ) : null}
            </button>
          );
        }}
      />

      <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5">
        {(['none', 'few', 'most', 'all'] as HeatLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded-full', set[level], level === 'none' && 'border-border border')} />
            <span className="text-muted text-[11px]">{HEAT_LABEL[level]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="bg-ink text-bg flex size-3 items-center justify-center rounded-full">
            <Check className="size-2" strokeWidth={4} />
          </span>
          <span className="text-muted text-[11px]">วันที่ฉันเลือก</span>
        </span>
        <span className="text-muted/70 ml-auto text-[11px]">
          {daysInMonth(board.month)} วันในเดือนนี้
        </span>
      </div>
    </div>
  );
}
