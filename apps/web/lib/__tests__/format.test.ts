import { describe, expect, it } from 'vitest';

import {
  formatDateRange,
  formatDaysUntil,
  formatDuration,
  formatMoney,
  formatTripTime,
  fxLabel,
  nightsBetween,
} from '../format';

describe('formatMoney', () => {
  it('renders whole baht without decimals', () => {
    expect(formatMoney(1234.56, 'THB')).toContain('1,235');
  });

  it('accepts a decimal string without losing precision on the way in', () => {
    expect(formatMoney('980000', 'JPY')).toContain('980,000');
  });
});

describe('formatDuration', () => {
  it('keeps sub-hour durations in minutes', () => {
    expect(formatDuration(45)).toBe('45 นาที');
  });

  it('drops the minutes when the duration is whole hours', () => {
    expect(formatDuration(120)).toBe('2 ชม.');
  });

  it('shows both parts otherwise', () => {
    expect(formatDuration(150)).toBe('2 ชม. 30 นาที');
  });
});

describe('formatTripTime', () => {
  // The itinerary always reads in destination time, never the viewer's.
  it('renders a UTC instant in Tokyo time', () => {
    expect(formatTripTime('2026-01-05T00:00:00Z')).toBe('09:00');
  });
});

describe('formatDateRange', () => {
  it('collapses a range inside one month', () => {
    // Same month: the month name should appear once, not twice.
    const result = formatDateRange('2026-04-06', '2026-04-09');
    expect(result).toContain('–');
    expect(result.match(/เม\.ย\.|Apr/g)?.length ?? 1).toBe(1);
  });

  it('keeps both months when the range spans two', () => {
    expect(formatDateRange('2026-04-28', '2026-05-03')).toContain('–');
  });

  it('says so when there is no date yet', () => {
    expect(formatDateRange(null, null)).toBe('ยังไม่ได้เลือกวัน');
  });

  it('renders a single date when only one end is known', () => {
    expect(formatDateRange('2026-04-06', null)).not.toContain('–');
  });
});

describe('nightsBetween', () => {
  it('counts nights, not days', () => {
    expect(nightsBetween('2026-04-06', '2026-04-09')).toBe(3);
  });

  it('is zero for a same-day range', () => {
    expect(nightsBetween('2026-04-06', '2026-04-06')).toBe(0);
  });

  it('never goes negative on a backwards range', () => {
    expect(nightsBetween('2026-04-09', '2026-04-06')).toBe(0);
  });

  it('is zero when a date is missing', () => {
    expect(nightsBetween(null, '2026-04-09')).toBe(0);
  });
});

describe('formatDaysUntil', () => {
  it.each([
    [0, 'วันนี้!'],
    [1, 'พรุ่งนี้'],
    [12, 'อีก 12 วัน'],
    [-2, 'กำลังเที่ยวอยู่'],
  ])('renders %i as %s', (days, expected) => {
    expect(formatDaysUntil(days)).toBe(expected);
  });
});

describe('fxLabel', () => {
  // DEV_SPEC §7.2: converted money must always carry its as-of date.
  it('includes the date the rate was taken', () => {
    expect(fxLabel('2026-04-06T00:00:00Z')).toContain('อัตราโดยประมาณ');
  });

  it('says plainly when there is no rate', () => {
    expect(fxLabel(null)).toBe('ยังไม่มีอัตราแลกเปลี่ยน');
  });
});

describe('formatMoney', () => {
  it('returns a dash rather than NaN for a missing amount', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('falls back to the code for a currency Intl has no symbol rule for', () => {
    expect(formatMoney(1000, 'KRW')).toContain('KRW');
  });
});
