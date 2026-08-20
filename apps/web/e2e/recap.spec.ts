import { expect, test, type Page } from '@playwright/test';

/**
 * W17.5 / W17.6 — a trip that is over is still worth opening.
 *
 * Two things have to keep working long after the last day: reading back what
 * the group decided, and turning that record into a public plan for points.
 */

async function resetDemoData(page: Page) {
  await page.goto('/home');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
});

test('a past trip opens its recap with the decisions intact', async ({ page }) => {
  await page.goto('/trips');

  await page.getByRole('link', { name: /ปายหนีร้อน/ }).click();

  await expect(page).toHaveURL(/\/recap\/pai$/);
  await expect(page.getByRole('heading', { name: 'ปายหนีร้อน' })).toBeVisible();
  await expect(page.getByText('สิ่งที่ตัดสินใจกันไว้')).toBeVisible();
  await expect(page.getByText(/เสาร์–จันทร์ ไม่ต้องลาเลย/)).toBeVisible();
  await expect(page.getByText(/ขับรถขึ้นเองแทนนั่งรถตู้/)).toBeVisible();
  await expect(page.getByText('แพลนที่เดินจริง')).toBeVisible();
  await expect(page.getByText('ปายแคนยอน')).toBeVisible();
});

test('publishing a finished trip pays the points it promised', async ({ page }) => {
  await page.goto('/recap/danang');

  await expect(page.getByText(/รับ 500 แต้ม/)).toBeVisible();
  await page.getByRole('button', { name: /เปิดเป็นสาธารณะ/ }).click();

  await expect(page.getByText('ทริปนี้เปิดสาธารณะอยู่')).toBeVisible();

  // 1,240 on the seed, plus the 500 the nudge promised.
  await page.goto('/profile');
  await expect(page.getByText('1,740')).toBeVisible();
});

test('a trip that is already public is not offered the reward twice', async ({ page }) => {
  await page.goto('/recap/seoul');

  await expect(page.getByText('เปิดสาธารณะ').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /เปิดเป็นสาธารณะ/ })).toHaveCount(0);
});
