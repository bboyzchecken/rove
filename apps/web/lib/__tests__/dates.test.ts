import { describe, expect, it } from 'vitest';

import { daysBetween, formatDmy, parseDmy, shiftMonth } from '@/lib/data/domain';

/** Feedback #2 — D-7 / F0.2: one written form for a date, and no 1970. */
describe('formatDmy / parseDmy', () => {
  it('writes dd/mm/yyyy with the Gregorian year', () => {
    expect(formatDmy('2026-12-04')).toBe('04/12/2026');
    expect(formatDmy('')).toBe('');
    expect(formatDmy(undefined)).toBe('');
  });

  it('reads the forms a hand actually types', () => {
    expect(parseDmy('04/12/2026')).toBe('2026-12-04');
    expect(parseDmy('4/12/2026')).toBe('2026-12-04');
    expect(parseDmy('04122026')).toBe('2026-12-04');
    expect(parseDmy('4-12-2026')).toBe('2026-12-04');
  });

  it('takes a Buddhist year and moves it back', () => {
    expect(parseDmy('04/12/2569')).toBe('2026-12-04');
  });

  it('refuses a day that does not exist', () => {
    expect(parseDmy('31/02/2026')).toBeNull();
    expect(parseDmy('00/12/2026')).toBeNull();
    expect(parseDmy('hello')).toBeNull();
    expect(parseDmy('')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('is zero when either end is missing — never a span from 1970', () => {
    expect(daysBetween('', '2026-12-10')).toBe(0);
    expect(daysBetween('2026-12-04', '')).toBe(0);
    expect(daysBetween('2026-12-04', '2026-12-10')).toBe(7);
  });
});

describe('shiftMonth', () => {
  it('crosses the year', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  });
});
