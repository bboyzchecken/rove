/**
 * The published example trip.
 *
 * The landing page offers "ดูทริปตัวอย่าง" to someone who has not signed in,
 * which rules out `/t/:id` — the trip room is the signed-in half of the
 * product and the proxy sends an anonymous visitor to `/login`. The public
 * plan page is the read-only surface that already exists for exactly this, so
 * the sample is a *published* trip rather than a private one with the wall
 * quietly removed.
 *
 * One slug, both data modes: mock mode publishes its seeded demo trip under
 * this slug (`lib/data/mock/db.ts`), and `apps/api/data/demo-trip.json` seeds
 * the same itinerary into MySQL for live mode. If you rename it, rename it in
 * all three places or the button starts 404-ing in one mode only.
 */
export const DEMO_PUBLIC_SLUG = 'japan-autumn-8d';

export const DEMO_PUBLIC_PATH = `/p/${DEMO_PUBLIC_SLUG}`;
