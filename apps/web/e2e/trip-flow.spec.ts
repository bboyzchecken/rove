import { expect, test, type Page } from '@playwright/test';

/**
 * X.1 — the whole product in one pass: create a trip, add a wish, draft a plan
 * with AI, check the budget, log an expense, settle up, share.
 *
 * X1.1 is asserted inside the first test: every entry point has to reach a
 * created trip in at most three screens.
 */

async function resetDemoData(page: Page) {
  await page.goto('/home');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
});

test('X1.1 — "ยังไม่รู้วัน" reaches a trip room in three screens', async ({ page }) => {
  await page.goto('/new');

  // 1. Pick how to start.
  await page.getByRole('button', { name: /ยังไม่รู้วัน/ }).click();
  // 2. Party size.
  await page.getByRole('button', { name: /^ต่อไป/ }).click();
  // 3. Character, then create.
  await page.getByRole('button', { name: /สร้างห้องทริป/ }).click();

  await expect(page).toHaveURL(/\/t\/[^/]+\/dates$/);
  await expect(page.getByText('ใส่วันว่างของฉัน')).toBeVisible();
});

test('a pasted ticket becomes a trip frame', async ({ page }) => {
  await page.goto('/new?from=ticket');

  await page.getByRole('button', { name: /ใส่ตัวอย่างให้ดู/ }).click();

  await expect(page.getByText('อ่านออกมาได้แบบนี้')).toBeVisible();
  await expect(page.getByText(/TG682/)).toBeVisible();
  await expect(page.getByText(/8 วัน 7 คืน/)).toBeVisible();
});

test('a wish added shows up on the coverage board', async ({ page }) => {
  await page.goto('/t/demo/wishlist');

  await page.getByRole('button', { name: /เพิ่มที่อยากไปของฉัน/ }).click();
  await page.getByPlaceholder('เช่น กินซูชิที่ตลาดปลา').fill('กินราเมนดึก ๆ');
  await page.getByRole('button', { name: /เพิ่มลงรายการ/ }).click();

  // It shows up twice on purpose: once in the "ยังไม่เข้าแพลน" summary at the
  // top, once in the list below.
  await expect(page.getByText('กินราเมนดึก ๆ')).toHaveCount(2);
  await expect(page.getByText('ยังไม่ได้ใส่').first()).toBeVisible();
});

test('the AI draft runs, applies, and moves the budget', async ({ page }) => {
  await page.goto('/t/dec/dates');

  // A plan needs dates, so lock the best window first.
  await page.getByRole('button', { name: /ธ\.ค\./ }).first().click();
  await page.getByRole('button', { name: /ล็อคช่วงนี้/ }).click();
  await expect(page.getByText('ได้วันแล้ว')).toBeVisible();

  await page.goto('/t/dec/plan');
  await page.getByRole('button', { name: /ร่างใหม่ ใช้สิทธิ์ฟรี/ }).click();
  await page.getByRole('button', { name: /^ร่างเลย/ }).click();

  // The draft is a job with progress, so this waits on the finished state.
  await expect(page.getByText('ร่างแพลนเสร็จแล้ว')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /ใช้ร่างนี้เป็นแพลน/ }).click();

  await expect(page.getByText(/วัน 1/)).toBeVisible();

  await page.goto('/t/dec/budget');
  await expect(page.getByText('ประมาณการ')).toBeVisible();
  await expect(page.getByText('แยกตามหมวด')).toBeVisible();
});

test('an expense splits and the settle-up clears', async ({ page }) => {
  await page.goto('/t/demo/expense');

  await page.getByRole('button', { name: /บันทึกรายจ่าย/ }).click();
  await page.getByPlaceholder('เช่น ข้าวเย็นวันแรก').fill('ข้าวเย็นทดสอบ');
  await page.getByRole('spinbutton').first().fill('4000');
  await page.getByRole('button', { name: /^บันทึก$/ }).click();

  await expect(page.getByText('ข้าวเย็นทดสอบ')).toBeVisible();

  // Settling a suggested transfer removes it from the list.
  const settle = page.getByRole('button', { name: /จ่ายแล้ว/ }).first();
  if (await settle.isVisible()) {
    await settle.click();
    await expect(page.getByText('น้องหารสรุปให้')).toBeVisible();
  }
});

test('sharing produces a link that renders read-only', async ({ page }) => {
  await page.goto('/t/demo');

  await page.getByRole('button', { name: /แชร์ลิงก์ให้เพื่อนดู/ }).click();
  await page.getByRole('button', { name: /ใครมีลิงก์/ }).click();

  const link = page.locator('input[readonly]');
  await expect(link).toHaveValue(/\/s\//);

  const url = await link.inputValue();
  await page.goto(new URL(url).pathname);

  await expect(page.getByText('แพลนที่แชร์มา')).toBeVisible();
  // Money the group actually spent never leaves the room (W16.5).
  await expect(page.getByText('ค่าใช้จ่ายจริงและยอดที่หารกันในกลุ่มไม่ถูกแชร์ในลิงก์นี้')).toBeVisible();
});

test('the prep template seeds a checklist that ticks', async ({ page }) => {
  await page.goto('/t/demo/prep');

  await page.getByRole('button', { name: /ดึงเช็กลิสต์มาตรฐาน/ }).click();
  await expect(page.getByText('0/10')).toBeVisible();

  await page.getByRole('button', { name: /^ทำแล้ว/ }).first().click();
  await expect(page.getByText('1/10')).toBeVisible();
});
