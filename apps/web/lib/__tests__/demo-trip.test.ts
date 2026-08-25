import { describe, expect, it } from 'vitest';

import { mockRepo } from '@/lib/data/mock/repo';
import { DEMO_PUBLIC_PATH, DEMO_PUBLIC_SLUG } from '@/lib/demo-trip';

/**
 * The landing page's "ดูทริปตัวอย่าง" button must resolve in BOTH data modes.
 *
 * It used to point at `/t/demo`, which was a redirect to /login in live mode
 * (the trip room is behind the sign-in wall) and a 404 in the database (the id
 * only ever existed in this browser seed). The replacement is one published
 * slug served by the public plan page — mock mode publishes its demo trip under
 * it, and `apps/api/data/demo-trip.json` seeds the same itinerary into MySQL.
 *
 * Three files have to agree on that slug, and nothing else would notice if one
 * of them drifted: the mock half is checked here, the live half by the seeder
 * logging the slug it wrote.
 */
describe('the published example trip', () => {
  it('is reachable by slug in mock mode', async () => {
    const payload = await mockRepo.share.publicTrip(DEMO_PUBLIC_SLUG);

    expect(payload).not.toBeNull();
    expect(payload!.days.length).toBeGreaterThan(0);
    expect(payload!.days.flatMap((day) => day.items).length).toBeGreaterThan(0);
    // A read-only page with no author is a page that looks broken.
    expect(payload!.creator.name).toBeTruthy();
  });

  it('is offered at the path the landing page links to', () => {
    expect(DEMO_PUBLIC_PATH).toBe(`/p/${DEMO_PUBLIC_SLUG}`);
  });
});
