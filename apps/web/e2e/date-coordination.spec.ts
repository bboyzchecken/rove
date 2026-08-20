import { expect, test, type Page } from '@playwright/test';

/**
 * M2.5 — หาวันที่ตรงกัน, end to end.
 *
 * This is the flow the whole feature exists for: a room with no dates, four
 * people's availability, and a window everyone can live with. It asserts the
 * *numbers* as well as the screens, because a date board that renders but
 * suggests the wrong week is worse than one that fails.
 */

// Each test starts from the seeded demo data rather than whatever the previous
// one left behind.
async function resetDemoData(page: Page) {
  await page.goto('/home');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
});

test('the board finds the windows everyone shares and locks one', async ({ page }) => {
  await page.goto('/t/dec/dates');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('ทริปสิ้นปีของแก๊ง');
  await expect(page.getByText('ยังไม่ได้ล็อควัน')).toBeVisible();

  // 4–8 Dec is the longest run all four share; it has to be the top suggestion.
  const suggestions = page.getByRole('button', { name: /ธ\.ค\./ });
  await expect(suggestions.first()).toContainText('4–8 ธ.ค.');
  await expect(suggestions.first()).toContainText('ทุกคนว่าง');

  await suggestions.first().click();

  await expect(page.getByText('ทุกคนว่างครบช่วงนี้')).toBeVisible();
  await page.getByRole('button', { name: /ล็อคช่วงนี้/ }).click();

  // Locking is what turns a room into a trip: the header takes the dates on.
  await expect(page.getByText('ได้วันแล้ว')).toBeVisible();
  await expect(page.getByText('4–8 ธ.ค. · 5 วัน 4 คืน')).toBeVisible();
  await expect(page.getByText('5 วัน 4 คืน').first()).toBeVisible();

  // …and the destination step appears, ranked for a five-day trip.
  await expect(page.getByText('ไปไหนดีกับ 5 วันนี้')).toBeVisible();
  await expect(page.getByText('แนะนำสำหรับกลุ่มคุณ')).toBeVisible();
});

test('painting my own days survives a reload', async ({ page }) => {
  await page.goto('/t/dec/dates');

  // 14 Dec is a day nobody has answered for yet — the seed leaves the middle of
  // the month empty on purpose, which is what makes it usable here.
  const day14 = page.getByRole('button', { name: /^14 — ว่าง 0 จาก 4 คน$/ });
  await expect(day14).toBeVisible();
  await day14.click();

  await expect(page.getByRole('button', { name: /^14 — ว่าง 1 จาก 4 คน$/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^14 — ว่าง 1 จาก 4 คน$/ })).toBeVisible();
});

test('a day cycles free → maybe → clear', async ({ page }) => {
  await page.goto('/t/dec/dates');

  const day = () => page.getByRole('button', { name: /^13 — / });

  await day().click(); // free
  await expect(page.getByRole('button', { name: /^13 — ว่าง 1 จาก 4 คน$/ })).toBeVisible();

  await day().click(); // maybe — no longer counted as free
  await expect(page.getByRole('button', { name: /^13 — ว่าง 0 จาก 4 คน$/ })).toBeVisible();

  await day().click(); // cleared
  await expect(page.getByRole('button', { name: /^13 — ว่าง 0 จาก 4 คน$/ })).toBeVisible();
});

test('unlocking puts the trip back on the board', async ({ page }) => {
  await page.goto('/t/demo/dates');

  await expect(page.getByText('ได้วันแล้ว')).toBeVisible();
  await page.getByRole('button', { name: /เปลี่ยนวัน/ }).click();

  await expect(page.getByText('ใส่วันว่างของฉัน')).toBeVisible();
});
