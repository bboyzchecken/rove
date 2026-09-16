import { addDays, daysBetween, isIsoDate } from '@/lib/data/domain';

/**
 * The one rule every start–end pair in the app follows (Feedback #4 D-1/D-2):
 * a form never lets you pick an end before its own start (that half lives in
 * each field's own `min`/`max`), and if you go back and move the *start*
 * past an end you already chose, the end slides forward to keep the group's
 * plans intact instead of quietly becoming invalid.
 *
 * "Keep the group's plans intact" means the same length, not a fixed jump —
 * five nights stays five nights. `fallbackNights` only fires the first time
 * an end is chosen at all, which is not a shift and is why every call site
 * above this still decides for itself whether to leave a blank end blank.
 */
export interface ShiftedDateRange {
  start: string;
  end: string;
  /** True when `end` actually moved — the caller can say so. */
  shifted: boolean;
}

export function shiftEndOnStartChange(
  prevStart: string,
  prevEnd: string,
  nextStart: string,
  fallbackNights = 4,
): ShiftedDateRange {
  if (!nextStart || !isIsoDate(nextStart)) return { start: nextStart, end: prevEnd, shifted: false };
  if (!prevEnd || nextStart <= prevEnd) return { start: nextStart, end: prevEnd, shifted: false };

  const nights =
    prevStart && isIsoDate(prevStart) ? Math.max(daysBetween(prevStart, prevEnd) - 1, 0) : fallbackNights;
  return { start: nextStart, end: addDays(nextStart, nights), shifted: true };
}

/** `shiftEndOnStartChange` for a start–end pair of clock times ("HH:mm") on
 *  the same day — a plan item's start/end. Crossing midnight is not
 *  represented here (Feedback #4 F1): an item that runs past 00:00 leaves its
 *  end blank rather than lying about which day it lands on. */
export interface ShiftedTimeRange {
  start: string;
  end: string;
  shifted: boolean;
}

export function shiftEndTimeOnStartChange(
  prevStart: string,
  prevEnd: string,
  nextStart: string,
  fallbackMinutes = 60,
): ShiftedTimeRange {
  const next = toMinutes(nextStart);
  if (next === null) return { start: nextStart, end: prevEnd, shifted: false };

  const prevEndMin = toMinutes(prevEnd);
  if (prevEndMin === null || next <= prevEndMin) return { start: nextStart, end: prevEnd, shifted: false };

  const prevStartMin = toMinutes(prevStart);
  const duration = prevStartMin !== null ? Math.max(prevEndMin - prevStartMin, 0) : fallbackMinutes;
  const shiftedEnd = Math.min(next + duration, 23 * 60 + 59);
  return { start: nextStart, end: fromMinutes(shiftedEnd), shifted: true };
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
