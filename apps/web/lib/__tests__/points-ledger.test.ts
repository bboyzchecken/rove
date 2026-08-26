import { describe, expect, it } from 'vitest';

import { mockRepo } from '@/lib/data/mock/repo';
import { CURRENT_USER, POINTS_LEDGER } from '@/lib/data/mock/seed/user';

/**
 * M23 — the points ledger, checked on the mock half.
 *
 * The property under test is the one the whole feature rests on: a balance is
 * a SUM of the rows and never a second number kept alongside them. The API
 * gets that for free from `SUM(delta)`; mock mode has to keep it deliberately,
 * and nothing else in a UAT run would notice if it drifted — the profile would
 * simply show a total that its own history does not add up to, which is the
 * exact failure this feature exists to prevent.
 */
describe('the seeded points ledger', () => {
  it('adds up to the balance the profile shows', () => {
    const sum = POINTS_LEDGER.reduce((total, row) => total + row.delta, 0);
    expect(sum).toBe(CURRENT_USER.points);
  });

  it('is newest first, like the API returns it', () => {
    const dates = POINTS_LEDGER.map((row) => row.occurredAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('has both sides of the ledger in it', () => {
    // A seed with only awards in it makes the "ใช้ไปแล้ว" figure untestable by
    // hand, and hides the negative-row styling from every UAT run.
    expect(POINTS_LEDGER.some((row) => row.delta > 0)).toBe(true);
    expect(POINTS_LEDGER.some((row) => row.delta < 0)).toBe(true);
  });
});

describe('reading the ledger back through the repository', () => {
  it('reports a balance and an earned total that differ by what was spent', async () => {
    const page = await mockRepo.rewards.pointsHistory();
    const spent = POINTS_LEDGER.filter((row) => row.delta < 0).reduce(
      (total, row) => total + row.delta,
      0,
    );

    expect(page.balance).toBe(CURRENT_USER.points);
    // Spending points is not un-earning them: the two figures move apart, and
    // the profile card reports both.
    expect(page.earned).toBe(page.balance - spent);
  });

  it('names the trip behind a row instead of printing its id', async () => {
    const page = await mockRepo.rewards.pointsHistory();
    const fromATrip = page.entries.filter((entry) => entry.tripId);

    expect(fromATrip.length).toBeGreaterThan(0);
    for (const entry of fromATrip) {
      expect(entry.tripTitle).not.toBe('');
      expect(entry.tripTitle).not.toBe(entry.tripId);
    }
  });

  it('pages with a cursor rather than capping the history', async () => {
    const first = await mockRepo.rewards.pointsHistory();

    // The seed is one page long, so "there is no more" is the honest answer —
    // and the empty cursor is how the UI knows to stop asking.
    expect(first.nextCursor).toBe('');
    expect(first.entries).toHaveLength(POINTS_LEDGER.length);
  });
});

describe('the audience card in mock mode', () => {
  it('counts published trips and the points they earned', async () => {
    const audience = await mockRepo.rewards.audience();

    expect(audience.publicTrips).toBeGreaterThan(0);
    expect(audience.topTripId).not.toBe('');
    // Every trip on the card is one the demo user actually published, and the
    // totals are the sum of the rows shown — not a separate figure.
    expect(audience.totalClones).toBe(
      audience.trips.reduce((sum, trip) => sum + trip.clones, 0),
    );
    expect(audience.pointsEarned).toBe(
      audience.trips.reduce((sum, trip) => sum + trip.pointsEarned, 0),
    );
  });

  it('never claims more awarded copies than copies', async () => {
    const audience = await mockRepo.rewards.audience();

    for (const trip of audience.trips) {
      expect(trip.awardedClones).toBeLessThanOrEqual(trip.clones);
    }
  });
});
