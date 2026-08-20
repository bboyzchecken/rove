import { expect, test } from '@playwright/test';

/**
 * X1.1 — every entry flow must reach a created trip in at most three screens.
 *
 * These run against a live stack (docker compose up), so they are the only
 * tests that prove the API and the web app agree about anything.
 */

test.describe('entry points (M1)', () => {
  test('landing offers all three ways in', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /เริ่มจากวันที่ลาได้/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /เริ่มจากเมืองที่อยากไป/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /วางข้อความตั๋ว/ })).toBeVisible();
  });

  test('date flow reaches a trip in three screens', async ({ page }) => {
    await page.goto('/');

    // Screen 1: the landing card.
    await page.getByRole('button', { name: /เริ่มจากวันที่ลาได้/ }).click();

    // Screen 2: the dialog.
    await page.getByLabel('วันไป').fill('2026-04-06');
    await page.getByLabel('วันกลับ').fill('2026-04-10');
    await page.getByRole('button', { name: 'สร้างทริป' }).click();

    // Screen 3: the trip room.
    await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}/);
    await expect(page.getByRole('link', { name: /ที่อยากไป/ }).first()).toBeVisible();
  });

  test('city flow suggests a day count from the chosen cities', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /เริ่มจากเมืองที่อยากไป/ }).click();

    await page.getByRole('button', { name: 'โตเกียว', exact: true }).click();
    await expect(page.getByText(/น่าจะใช้เวลาราว 5 วัน/)).toBeVisible();

    await page.getByLabel('วันไป').fill('2026-04-06');
    await page.getByRole('button', { name: 'สร้างทริป' }).click();

    await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}/);
  });
});

test.describe('trip room (M2)', () => {
  test('shows the onboarding checklist in a fresh trip', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /เริ่มจากวันที่ลาได้/ }).click();
    await page.getByLabel('วันไป').fill('2026-04-06');
    await page.getByLabel('วันกลับ').fill('2026-04-10');
    await page.getByRole('button', { name: 'สร้างทริป' }).click();

    await expect(page.getByText('เริ่มต้นทริปนี้')).toBeVisible();
    await expect(page.getByText('ชวนเพื่อนเข้าห้อง')).toBeVisible();
  });
});
