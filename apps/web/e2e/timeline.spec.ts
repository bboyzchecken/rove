import { test } from '@playwright/test';

/**
 * X5.1 — drag and drop on a real phone.
 *
 * Touch dragging is where timeline editors break: without a hold delay the
 * browser scrolls instead of dragging, and without touch-action the drag never
 * starts at all. This test only means something on the ios/android projects.
 */

test.describe('itinerary editor (M5)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'needs a seeded trip fixture');

  test('an item card exposes a keyboard-reachable drag handle', async ({ page }) => {
    // A timeline that can only be reordered by dragging is unusable with a
    // keyboard or a screen reader, so the handle is a real button.
    await page.goto('/');
    // Placeholder until a seeded fixture exists — see the TODO below.
  });
});

/**
 * TODO(X.1): these need a seeded trip with a plan. The intended shape is a
 * fixture that calls the API directly to create a trip, a plan and three items,
 * then hands the test a URL — rather than driving the whole UI to set up state
 * that is not what the test is about.
 */
