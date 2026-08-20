import { describe, expect, it } from 'vitest';

import { formatDuration, formatMoney, formatTripTime } from '../format';

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
