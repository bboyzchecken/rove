import { describe, expect, it } from 'vitest';

import { CITY_OPTIONS, addDays, suggestDays } from '../use-entry';

describe('suggestDays', () => {
  it('adds up the suggested days for each city', () => {
    // yokohama 2 + kamakura 1 + fuji 2 = 5
    expect(suggestDays(['yokohama', 'kamakura', 'fujikawaguchiko'])).toBe(5);
  });

  // A one-day suggestion for a trip from Bangkok is nonsense once flights are
  // counted, so the floor is three.
  it('never suggests fewer than three days', () => {
    expect(suggestDays(['kamakura'])).toBe(3);
    expect(suggestDays([])).toBe(3);
  });

  it('ignores a city it does not know', () => {
    expect(suggestDays(['atlantis'])).toBe(3);
  });

  it('covers every offered city', () => {
    for (const city of CITY_OPTIONS) {
      expect(suggestDays([city.key])).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('addDays', () => {
  it('returns an ISO date the given number of days later', () => {
    expect(addDays('2026-04-06', 4)).toBe('2026-04-10');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-04-29', 3)).toBe('2026-05-02');
  });

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});
