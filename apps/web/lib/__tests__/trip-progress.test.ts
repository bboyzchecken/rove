import { describe, expect, it } from 'vitest';

import type { TripOverview } from '@/lib/data';
import { TRIP } from '@/lib/data/mock/seed/trip';
import {
  derivedStatus,
  missingSummary,
  orderedSteps,
  progressSummary,
  stepStatus,
} from '@/lib/trip-progress';

/**
 * Feedback #2 — F0.6. The four statuses are the spine of the trip page, the
 * checklist and the home screen's "กำลังวางแผน" rows, so the rules that derive
 * them are pinned here rather than discovered per screen.
 */
function overview(patch: Partial<TripOverview> = {}): TripOverview {
  return {
    trip: { ...TRIP, startDate: '', endDate: '', startedWith: [], route: undefined, budgetPerPersonThb: 0 },
    members: [
      { id: 'm1', name: 'ตอง', role: 'owner', characterId: 'flower-01', hasWishlist: false, hasDates: false },
    ],
    coverage: { covered: 0, partial: 0, uncovered: 0, total: 0, mustCovered: 0, mustTotal: 0, percent: 0 },
    checklist: [],
    activity: [],
    counts: {
      wishlistItems: 0,
      planDays: 0,
      planItems: 0,
      membersWithoutWishlist: 1,
      bookings: 0,
      openPrep: 0,
      prepTasks: 0,
      documents: 0,
      expenses: 0,
      photos: 0,
      membersSubmittedDates: 0,
    },
    locked: null,
    stepOverrides: {},
    submittedDatesMemberIds: [],
    ...patch,
  };
}

describe('stepStatus', () => {
  it('starts every step as todo in an empty room', () => {
    const o = overview();
    for (const step of ['invite', 'dates', 'wishlist', 'plan', 'bookings', 'prep', 'documents'] as const) {
      expect(stepStatus(o, step)).toBe('todo');
    }
  });

  it('dates typed in are "check"; dates locked are "done"', () => {
    const typed = overview({ trip: { ...TRIP, startedWith: [] } });
    expect(stepStatus(typed, 'dates')).toBe('check');

    const locked = overview({
      trip: { ...TRIP, startedWith: [] },
      locked: { startDate: TRIP.startDate, endDate: TRIP.endDate, days: 8, lockedBy: 'm1', lockedAt: '', memberIds: [] },
    });
    expect(stepStatus(locked, 'dates')).toBe('done');
  });

  it('what the group said they already had needs checking, not doing', () => {
    const o = overview({ trip: { ...overview().trip, startedWith: ['flights', 'stay', 'friends'] } });
    expect(stepStatus(o, 'route')).toBe('check');
    expect(stepStatus(o, 'stay')).toBe('check');
    expect(stepStatus(o, 'invite')).toBe('check');
    expect(stepStatus(o, 'documents')).toBe('check');
  });

  it('a skip overrides todo and check, never done', () => {
    const o = overview({ stepOverrides: { prep: 'skipped', invite: 'skipped' } });
    expect(stepStatus(o, 'prep')).toBe('skipped');

    const withFriends = overview({
      stepOverrides: { invite: 'skipped' },
      members: [
        ...overview().members,
        { id: 'm2', name: 'มายด์', role: 'editor', characterId: 'flower-02', hasWishlist: false, hasDates: false },
      ],
    });
    expect(derivedStatus(withFriends, 'invite')).toBe('done');
    expect(stepStatus(withFriends, 'invite')).toBe('done');
  });

  it('a plan that leaves must-go wishes uncovered is "check"', () => {
    const o = overview({
      counts: { ...overview().counts, planDays: 3, wishlistItems: 4, membersWithoutWishlist: 0 },
      coverage: { covered: 2, partial: 1, uncovered: 1, total: 4, mustCovered: 1, mustTotal: 2, percent: 50 },
    });
    expect(stepStatus(o, 'plan')).toBe('check');
    expect(stepStatus(o, 'wishlist')).toBe('done');
  });
});

describe('orderedSteps', () => {
  it('moves what the group already has to the front, in the order they ticked it', () => {
    const keys = orderedSteps(['flights', 'dates']).map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(['route', 'dates']);
    // Nothing is listed twice, and "stay" only appears when it was ticked.
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('stay');
  });

  it('keeps the canonical order when nothing was ticked', () => {
    const keys = orderedSteps([]).map((s) => s.key);
    expect(keys[0]).toBe('invite');
    expect(keys[1]).toBe('dates');
  });
});

describe('progressSummary', () => {
  it('counts skipped steps out of the total and names the next thing to do', () => {
    const o = overview({ stepOverrides: { prep: 'skipped', photos: 'skipped', expense: 'skipped' } });
    const summary = progressSummary(o);
    expect(summary.total).toBe(orderedSteps([]).length - 3);
    expect(summary.done).toBe(0);
    expect(summary.next?.key).toBe('invite');
  });

  it('reads 100% when everything counted is done', () => {
    const o = overview({
      trip: { ...TRIP, startedWith: [] },
      locked: { startDate: TRIP.startDate, endDate: TRIP.endDate, days: 8, lockedBy: 'm1', lockedAt: '', memberIds: [] },
      members: [
        ...overview().members,
        { id: 'm2', name: 'มายด์', role: 'editor', characterId: 'flower-02', hasWishlist: true, hasDates: true },
      ],
      counts: { ...overview().counts, wishlistItems: 3, membersWithoutWishlist: 0, planDays: 3, bookings: 2, prepTasks: 2, documents: 1, photos: 1 },
      coverage: { covered: 3, partial: 0, uncovered: 0, total: 3, mustCovered: 1, mustTotal: 1, percent: 100 },
      // No tickets on this trip and nothing to spend yet: both skipped.
      stepOverrides: { expense: 'skipped', route: 'skipped' },
    });
    expect(progressSummary(o).percent).toBe(100);
    expect(missingSummary(o)).toEqual([]);
  });
});

describe('missingSummary', () => {
  it('says in words what a planning trip still lacks', () => {
    expect(missingSummary(overview())).toEqual([
      'ยังไม่กำหนดวัน',
      'ยังไม่สรุปสถานที่',
      'ยังไม่คอนเฟิร์มคน',
      'ยังไม่มีแพลน',
    ]);
  });
});
