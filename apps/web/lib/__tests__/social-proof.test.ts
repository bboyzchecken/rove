import { describe, expect, it } from 'vitest';

import type { PlatformStats } from '@/lib/data';
import {
  SOCIAL_PROOF_MIN,
  missingForPlatformStats,
  showsAverageRating,
  showsPlatformStats,
} from '@/lib/social-proof';

/**
 * M24 — W24.1's one rule: real numbers or no section.
 *
 * This is the rule most likely to be quietly broken later, because breaking it
 * looks like an improvement — "the landing page is empty, let's show the
 * numbers anyway" ends with a front page advertising four users. The threshold
 * is tested rather than trusted, and the admin console reads the same
 * functions so what it reports and what the page does cannot disagree.
 */
const stats = (over: Partial<PlatformStats> = {}): PlatformStats => ({
  planners: 0,
  publicTrips: 0,
  clones: 0,
  reviews: 0,
  averageRating: 0,
  computedAt: '2026-08-26T00:00:00.000Z',
  ...over,
});

describe('whether the landing page shows its statistics', () => {
  it('stays hidden on a young install', () => {
    expect(showsPlatformStats(stats({ planners: 4, publicTrips: 2 }))).toBe(false);
  });

  it('stays hidden while either half is short', () => {
    // One busy creator publishing ten plans is not a platform, and neither is
    // a hundred people who never published anything — both conditions hold or
    // the section does not appear.
    expect(showsPlatformStats(stats({ planners: 400, publicTrips: 2 }))).toBe(false);
    expect(showsPlatformStats(stats({ planners: 4, publicTrips: 90 }))).toBe(false);
  });

  it('appears exactly at the threshold, not one past it', () => {
    expect(
      showsPlatformStats(
        stats({ planners: SOCIAL_PROOF_MIN.planners, publicTrips: SOCIAL_PROOF_MIN.publicTrips }),
      ),
    ).toBe(true);
  });

  it('is hidden while the numbers have not loaded', () => {
    expect(showsPlatformStats(undefined)).toBe(false);
  });
});

describe('whether it quotes an average rating', () => {
  it('waits for enough reviews before averaging them out loud', () => {
    expect(showsAverageRating(stats({ reviews: 3, averageRating: 5 }))).toBe(false);
    expect(showsAverageRating(stats({ reviews: SOCIAL_PROOF_MIN.reviews, averageRating: 4.6 }))).toBe(
      true,
    );
  });

  it('says nothing when nobody has rated anything', () => {
    // Enough reviews but a zero average means the figures disagree; showing
    // "0.0 ดาว" as social proof would be worse than showing nothing.
    expect(showsAverageRating(stats({ reviews: 50, averageRating: 0 }))).toBe(false);
  });
});

describe('what the admin console reports as missing', () => {
  it('names both gaps with the numbers still needed', () => {
    expect(missingForPlatformStats(stats({ planners: 2, publicTrips: 1 }))).toEqual([
      `คนวางแพลน ${SOCIAL_PROOF_MIN.planners - 2} คน`,
      `แพลนสาธารณะ ${SOCIAL_PROOF_MIN.publicTrips - 1} ใบ`,
    ]);
  });

  it('names only the half that is short', () => {
    const missing = missingForPlatformStats(stats({ planners: 500, publicTrips: 1 }));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('แพลนสาธารณะ');
  });

  it('is empty once the section is showing', () => {
    expect(missingForPlatformStats(stats({ planners: 500, publicTrips: 90 }))).toEqual([]);
  });
});
