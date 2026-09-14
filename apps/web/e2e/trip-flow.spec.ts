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

test('X1.1 — knowing nothing yet reaches a trip room in three screens', async ({ page }) => {
  await page.goto('/new');

  // 1. "ตอนนี้มีอะไรแล้วบ้าง" — tick nothing (Feedback #2, D-9).
  await expect(page.getByRole('heading', { name: 'ตอนนี้มีอะไรแล้วบ้าง' })).toBeVisible();
  await page.getByRole('button', { name: /^ต่อไป/ }).click();
  // 2. Party size — starts at one (D-8).
  await expect(page.getByRole('heading', { name: 'ไปกันกี่คน' })).toBeVisible();
  await page.getByRole('button', { name: /^ต่อไป/ }).click();
  // 3. Character, then create.
  await page.getByRole('button', { name: /สร้างห้องทริป/ }).click();

  await expect(page).toHaveURL(/\/t\/[^/]+\/dates$/);
});

test('what the group already has is asked for first, and nothing is prefilled', async ({ page }) => {
  await page.goto('/new');

  await page.getByRole('button', { name: /รู้วันแล้ว/ }).click();
  await page.getByRole('button', { name: /จองที่พักแล้ว/ }).click();
  await page.getByRole('button', { name: /^ต่อไป/ }).click();

  // Dates first, blank, in dd/mm/yyyy (D-7 / D-8) — and no day count until both exist.
  await expect(page.getByRole('heading', { name: 'ไปวันไหน' })).toBeVisible();
  const start = page.getByRole('textbox', { name: 'ไปวันที่' });
  await expect(start).toHaveValue('');
  await expect(page.getByText(/46365/)).toHaveCount(0);

  await start.fill('04/12/2026');
  await page.getByRole('textbox', { name: 'กลับวันที่' }).fill('10/12/2026');
  await expect(page.getByText(/7 วัน 6 คืน/)).toBeVisible();

  // The hotel field only exists because it was ticked.
  await expect(page.getByPlaceholder('ชื่อโรงแรม หรือย่านที่พัก')).toBeVisible();
});

test('a pasted ticket fills in the route', async ({ page }) => {
  // The ticket door folded into the route door (M1): pasting is a shortcut that
  // fills the same legs someone would otherwise type.
  await page.goto('/new?from=ticket');

  await page.getByRole('button', { name: /วางมาเลย/ }).click();
  await page.getByRole('button', { name: /ใส่ตัวอย่างให้ดู/ }).click();

  await expect(page.getByText(/อ่านได้ 2 เที่ยวบิน/)).toBeVisible();
  await expect(page.getByText('ทริปนี้จะเป็นแบบนี้')).toBeVisible();
  await expect(page.getByText(/7 วัน 6 คืน/)).toBeVisible();
});

/** The picker only answers once React owns the field, so open it first. */
async function pickAirport(page: Page, index: number, query: string, option: RegExp) {
  const field = page.getByPlaceholder('ค้นหาสนามบินทั่วโลก — รหัส เมือง หรือประเทศ').nth(index);
  await field.click();
  // The first open pays for the airport index; in dev that can take a while.
  await expect(page.getByText('ที่คนไทยไปบ่อย').first()).toBeVisible({ timeout: 15_000 });

  await field.fill(query);
  await page.getByRole('button', { name: option }).first().click();
}

test('the route door searches airports worldwide and counts the nights', async ({ page }) => {
  await page.goto('/new?from=route');

  // Nothing is prefilled any more (D-8): the home airport and the flight
  // date are typed too, and the summary only appears once a leg has both.
  // Search by IATA code, the way a booking site works.
  await pickAirport(page, 0, 'BKK', /Suvarnabhumi/);
  await pickAirport(page, 0, 'NRT', /Narita/);
  await page.getByRole('textbox', { name: 'บินวันที่' }).first().fill('04/12/2026');

  await expect(page.getByText('ทริปนี้จะเป็นแบบนี้')).toBeVisible();
  await expect(page.getByText(/โตเกียว/).first()).toBeVisible();
});

test('two countries in one route are spelled out', async ({ page }) => {
  await page.goto('/new?from=route&to=ICN');

  // Seoul is already the destination; nothing else is (D-8), so the home
  // airport and the dates are typed too. Then add a hop to Tokyo after Seoul.
  await pickAirport(page, 0, 'BKK', /Suvarnabhumi/);
  await page.getByRole('button', { name: /เพิ่มเมือง\/ประเทศระหว่างทาง/ }).click();
  await pickAirport(page, 0, 'NRT', /Narita/);
  const dates = page.getByRole('textbox', { name: 'บินวันที่' });
  await dates.nth(0).fill('04/12/2026');
  await dates.nth(1).fill('07/12/2026');

  await expect(page.getByText(/ข้าม 2 ประเทศ/)).toBeVisible();
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
  // The seeded rooms hold a Trip Pass (D-10), so the button no longer counts free drafts.
  await page.getByRole('button', { name: /^ร่างใหม่/ }).click();
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

  // The Japan template carries eleven tasks (lib/data/mock/catalog.ts).
  await page.getByRole('button', { name: /ดึงเช็กลิสต์มาตรฐาน/ }).click();
  await expect(page.getByText('0/11')).toBeVisible();

  await page.getByRole('button', { name: /^ทำแล้ว/ }).first().click();
  await expect(page.getByText('1/11')).toBeVisible();
});
