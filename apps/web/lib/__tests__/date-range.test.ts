import { describe, expect, it } from 'vitest';

import { shiftEndOnStartChange, shiftEndTimeOnStartChange } from '@/lib/date-range';

describe('shiftEndOnStartChange', () => {
  it('leaves the end alone when the new start is still before it', () => {
    const out = shiftEndOnStartChange('2026-12-04', '2026-12-10', '2026-12-05');
    expect(out).toEqual({ start: '2026-12-05', end: '2026-12-10', shifted: false });
  });

  it('shifts the end forward keeping the same number of nights', () => {
    // 4–10 Dec is 6 nights; pushing start past the old end, to 12 Dec, should
    // land the new end on 18 Dec — six nights later again.
    const out = shiftEndOnStartChange('2026-12-04', '2026-12-10', '2026-12-12');
    expect(out).toEqual({ start: '2026-12-12', end: '2026-12-18', shifted: true });
  });

  it('leaves a blank end blank — picking a start first is not a shift', () => {
    const out = shiftEndOnStartChange('', '', '2026-12-04');
    expect(out).toEqual({ start: '2026-12-04', end: '', shifted: false });
  });

  it('falls back to the given night count when the previous start is unknown', () => {
    const out = shiftEndOnStartChange('', '2026-12-10', '2026-12-15', 3);
    expect(out).toEqual({ start: '2026-12-15', end: '2026-12-18', shifted: true });
  });

  it('does nothing for an empty next start', () => {
    const out = shiftEndOnStartChange('2026-12-04', '2026-12-10', '');
    expect(out).toEqual({ start: '', end: '2026-12-10', shifted: false });
  });
});

describe('shiftEndTimeOnStartChange', () => {
  it('leaves the end alone when the new start is still before it', () => {
    const out = shiftEndTimeOnStartChange('09:00', '11:00', '09:30');
    expect(out).toEqual({ start: '09:30', end: '11:00', shifted: false });
  });

  it('shifts the end forward keeping the same duration', () => {
    // 09:00–11:00 is 120 minutes; moving start to 12:00 keeps that length.
    const out = shiftEndTimeOnStartChange('09:00', '11:00', '12:00');
    expect(out).toEqual({ start: '12:00', end: '14:00', shifted: true });
  });

  it('never carries an item past midnight — clamps to 23:59', () => {
    // 22:00–23:30 is 90 minutes; pushing start past that to 23:40 would land
    // the end at 01:10 the next day, which this clamps to 23:59 instead.
    const out = shiftEndTimeOnStartChange('22:00', '23:30', '23:40');
    expect(out).toEqual({ start: '23:40', end: '23:59', shifted: true });
  });

  it('falls back to the given duration when the previous start is unknown', () => {
    const out = shiftEndTimeOnStartChange('', '10:00', '11:00', 30);
    expect(out).toEqual({ start: '11:00', end: '11:30', shifted: true });
  });

  it('does nothing when there is no end to shift yet', () => {
    const out = shiftEndTimeOnStartChange('09:00', '', '10:00');
    expect(out).toEqual({ start: '10:00', end: '', shifted: false });
  });
});
