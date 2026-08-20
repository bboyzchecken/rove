import { beforeEach, describe, expect, it } from 'vitest';

import { mockRepo } from '@/lib/data/mock/repo';
import { resetDb } from '@/lib/data/mock/db';

/**
 * W17.5 — a finished trip has to stay readable.
 *
 * The recap is the only screen whose value is measured in months: it exists so
 * that "ตอนนั้นเราตัดสินใจยังไง" still has an answer long after the room went
 * quiet. These pin the two sources it is built from — an archived card with no
 * room left, and a room that simply ended — to the same shape.
 */
beforeEach(() => {
  resetDb();
});

describe('recap of an archived trip', () => {
  it('keeps the decisions the group made', async () => {
    const recap = await mockRepo.trips.recap('seoul');

    expect(recap.title).toBe('โซลกับเพื่อนสนิท');
    expect(recap.days).toBe(5);
    expect(recap.decisions.map((d) => d.kind)).toContain('dates');
    expect(recap.decisions.some((d) => d.kind === 'rationale')).toBe(true);
    // The vote that settled ล็อตเต้เวิลด์ is the point of keeping the record.
    expect(recap.decisions.some((d) => d.detail.includes('ล็อตเต้เวิลด์'))).toBe(true);
  });

  it('reads back the plan that was actually walked', async () => {
    const recap = await mockRepo.trips.recap('danang');

    expect(recap.itinerary).toHaveLength(4);
    expect(recap.itinerary[0]?.items.length).toBeGreaterThan(0);
    expect(recap.spending.reduce((sum, line) => sum + line.amountThb, 0)).toBeGreaterThan(0);
  });

  it('offers publishing until the trip is public, then stops', async () => {
    const draft = await mockRepo.trips.recap('pai');
    expect(draft.canPublish).toBe(true);
    expect(draft.pointsPerPublish).toBeGreaterThan(0);

    // Already published on the seed — the nudge must not offer the same points
    // twice.
    const published = await mockRepo.trips.recap('seoul');
    expect(published.share.visibility).toBe('public');
    expect(published.canPublish).toBe(false);
  });

  it('pays the publish reward once', async () => {
    const before = (await mockRepo.auth.me())?.points ?? 0;

    await mockRepo.share.setVisibility('pai', 'public');
    const afterFirst = (await mockRepo.auth.me())?.points ?? 0;
    expect(afterFirst).toBe(before + (await mockRepo.trips.recap('pai')).pointsPerPublish);

    // Setting it public again is not a second award.
    await mockRepo.share.setVisibility('pai', 'public');
    expect((await mockRepo.auth.me())?.points ?? 0).toBe(afterFirst);

    const recap = await mockRepo.trips.recap('pai');
    expect(recap.canPublish).toBe(false);
    expect(recap.share.publicSlug).toBeTruthy();
  });
});

describe('recap of a room that ended', () => {
  it('derives the record from the room itself', async () => {
    const recap = await mockRepo.trips.recap('demo');

    expect(recap.tripId).toBe('demo');
    expect(recap.itinerary.length).toBeGreaterThan(0);
    expect(recap.places).toBe(recap.itinerary.flatMap((day) => day.items).length);
    expect(recap.decisions.some((d) => d.kind === 'dates')).toBe(true);
    expect(recap.decisions.some((d) => d.kind === 'plan')).toBe(true);
    // Money is summed the same way the Expense tab sums it.
    const summary = await mockRepo.expense.summary('demo');
    expect(recap.spentThb).toBe(summary.totalThb);
  });
});
