'use client';

import { useMemo } from 'react';

import { CharacterAvatar } from '@/components/ui/character-avatar';
import type { AvailabilityBoard, AvailabilityMark } from '@/lib/data';
import { daysInMonth, monthDates, monthStartDow, parseIsoDate } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * The month grid every member paints their own days on, and the owner picks
 * the trip window from (M2.5 — W2.8).
 *
 * One grid, two modes:
 *   mine   tapping a day cycles my own answer  ว่าง → ไม่ค่อยสะดวก → ไม่ว่าง
 *   range  tapping picks the start, then the end of the trip window
 *
 * The background is a heat map of how many people are free that day, so the
 * good weeks are visible before anyone reads a number.
 */

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export interface DaySelection {
  start: string;
  end: string | null;
}

/**
 * Free-member ratio → colour block. Nobody free stays neutral.
 *
 * A heat scale is the one thing in the product that genuinely needs more than
 * two steps of a colour, and v3 gives it one hue to do it in: the room's own.
 * Ramping the light colour by opacity keeps every step the same yellow, so the
 * grid reads as one measurement rather than as five states — v2 ramped
 * `--brand-primary`, which under v3 is black and would have turned the calendar
 * into a greyscale chart.
 *
 * The top of the ramp is the SOLID half rather than more of the light one: at
 * a 40px cell it is well inside §2.3's small-and-loud budget, and "everyone is
 * free" is the one cell the eye is supposed to land on.
 *
 * Black type the whole way up (§2.4) — including on the solid, where it is
 * 14.6:1. Only the empty cells drop to muted, because there the number is
 * genuinely secondary.
 */
function heatClass(free: number, total: number, selected: boolean) {
  // Selection is not part of the scale — it is ink, so a chosen day reads as
  // chosen no matter how many people were free on it.
  if (selected) return 'bg-ink text-bg';
  if (total === 0 || free === 0) return 'bg-surface text-muted';
  const ratio = free / total;
  if (ratio === 1) return 'bg-feature-solid text-ink';
  if (ratio >= 0.66) return 'bg-feature text-ink';
  if (ratio >= 0.34) return 'bg-feature/55 text-ink';
  return 'bg-feature/25 text-ink';
}

export function AvailabilityCalendar({
  board,
  meId,
  mode,
  selection,
  onCycleDay,
  onPickRangeDay,
}: {
  board: AvailabilityBoard;
  meId: string;
  mode: 'mine' | 'range';
  selection: DaySelection | null;
  onCycleDay: (date: string, next: AvailabilityMark | null) => void;
  onPickRangeDay: (date: string) => void;
}) {
  const total = board.members.length;

  const byDate = useMemo(() => {
    const map = new Map<string, { free: string[]; maybe: string[] }>();
    for (const entry of board.entries) {
      const row = map.get(entry.date) ?? { free: [], maybe: [] };
      if (entry.mark === 'free') row.free.push(entry.memberId);
      else if (entry.mark === 'maybe') row.maybe.push(entry.memberId);
      map.set(entry.date, row);
    }
    return map;
  }, [board.entries]);

  const dates = monthDates(board.month);
  const pad = monthStartDow(board.month);
  const locked = board.locked;

  const inSelection = (date: string) => {
    if (!selection) return false;
    const end = selection.end ?? selection.start;
    const from = selection.start <= end ? selection.start : end;
    const to = selection.start <= end ? end : selection.start;
    return date >= from && date <= to;
  };

  const inLocked = (date: string) =>
    Boolean(locked && date >= locked.startDate && date <= locked.endDate);

  /** ว่าง → ไม่ค่อยสะดวก → ล้าง. Busy is the absence of a mark, not a third tap. */
  const nextMark = (current: AvailabilityMark | null): AvailabilityMark | null =>
    current === 'free' ? 'maybe' : current === 'maybe' ? null : 'free';

  return (
    <div className="rounded-brand bg-surface overflow-hidden">
      <div className="grid grid-cols-7 gap-1 px-2 pt-3 pb-1">
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className={cn(
              'text-center text-[11px] font-medium',
              index === 0 || index === 6 ? 'text-ink/70' : 'text-muted',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {Array.from({ length: pad }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {dates.map((date) => {
          const row = byDate.get(date) ?? { free: [], maybe: [] };
          const mine: AvailabilityMark | null = row.free.includes(meId)
            ? 'free'
            : row.maybe.includes(meId)
              ? 'maybe'
              : null;

          const selected = inSelection(date);
          const isEdge =
            selected &&
            (date === selection?.start || date === (selection?.end ?? selection?.start));
          const day = parseIsoDate(date).getDate();
          const everyone = total > 0 && row.free.length === total;

          return (
            <button
              key={date}
              type="button"
              onClick={() =>
                mode === 'mine' ? onCycleDay(date, nextMark(mine)) : onPickRangeDay(date)
              }
              aria-pressed={mode === 'mine' ? mine !== null : selected}
              aria-label={`${day} — ว่าง ${row.free.length} จาก ${total} คน`}
              className={cn(
                'relative flex min-h-16 flex-col items-center gap-1 rounded-[0.75rem] px-0.5 py-1.5 transition',
                heatClass(row.free.length, total, selected),
                isEdge && 'ring-ink ring-2',
                inLocked(date) && !selected && 'ring-ink/40 ring-2',
                mode === 'mine' && mine === 'free' && 'ring-ink ring-2',
                mode === 'mine' && mine === 'maybe' && 'ring-feature-solid ring-dashed ring-2',
                'active:scale-[0.97]',
              )}
            >
              <span className="nums text-[13px] leading-none font-medium">{day}</span>

              <span className="flex flex-wrap justify-center gap-0.5">
                {board.members.map((member) => {
                  const isFree = row.free.includes(member.id);
                  const isMaybe = row.maybe.includes(member.id);
                  return (
                    <CharacterAvatar
                      key={member.id}
                      characterId={member.characterId}
                      size="xs"
                      className={cn(
                        'size-4',
                        isFree ? 'opacity-100' : isMaybe ? 'opacity-60 grayscale' : 'opacity-15',
                      )}
                    />
                  );
                })}
              </span>

              {everyone ? (
                <span className="bg-ink absolute top-1 right-1 size-1.5 rounded-full" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-4 py-2.5">
        <span className="text-muted text-[11px] font-medium">ว่างกัน</span>
        {/* These four MUST stay in step with `heatClass` above — a legend that
            has drifted from its scale is worse than no legend. */}
        {[
          { label: 'ไม่มี', className: 'bg-surface border border-border' },
          { label: 'บางคน', className: 'bg-feature/55' },
          { label: 'เกือบครบ', className: 'bg-feature' },
          { label: 'ครบทุกคน', className: 'bg-feature-solid' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded', item.className)} />
            <span className="text-muted text-[11px]">{item.label}</span>
          </span>
        ))}
        <span className="text-muted/70 ml-auto text-[11px]">
          {daysInMonth(board.month)} วันในเดือนนี้
        </span>
      </div>
    </div>
  );
}
