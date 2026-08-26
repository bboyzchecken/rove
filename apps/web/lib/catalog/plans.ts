import type { SubscriptionPlan } from '@/lib/data';

/**
 * The price list, on the web side (M26).
 *
 * It mirrors `domain.Plans()` in the API. Duplicated rather than fetched
 * because the page that has to show it is a public marketing page, and the
 * catalogue endpoint sits behind sign-in — asking an anonymous visitor to log
 * in before being told the price is the opposite of what a pricing page is for.
 *
 * Mock mode reads the same constant, so there is exactly one copy on this side
 * of the wire rather than one per screen. When the API's catalogue changes,
 * this is the file that changes with it.
 */

export const FREE_PLAN_ID = 'free';
export const TRIP_PASS_PLAN_ID = 'trip_pass';
export const ROVE_YEAR_PLAN_ID = 'rove_year';

/** How many trips a free account may have open at once (A26.3). */
export const FREE_ACTIVE_TRIPS = 1;

/** Free drafts per trip (A26.3). */
export const FREE_DRAFTS_PER_TRIP = 3;

/** What a plan reports when drafting is not metered at all. */
export const UNLIMITED_DRAFTS = -1;

export const TRIP_PASS_PRICE_THB = 299;
export const ROVE_YEAR_PRICE_THB = 990;

/** The pass split across a group, rounded up. */
export function splitPerPersonThb(party: number) {
  if (party <= 1) return TRIP_PASS_PRICE_THB;
  return Math.ceil(TRIP_PASS_PRICE_THB / party);
}

/**
 * The order matters and is not alphabetical.
 *
 * Trip Pass is in the middle because that is where the eye lands, and ROVE Year
 * is mostly there to give ฿299 something to be measured against — a reference
 * point, not the row this product expects to sell (W26.1).
 */
export const PLANS: SubscriptionPlan[] = [
  {
    id: FREE_PLAN_ID,
    name: 'ROVE ฟรี',
    tagline: 'วางแผนทริปกับเพื่อนได้ครบ ไม่ต้องใส่บัตร',
    priceThb: 0,
    interval: 'trip',
    perks: [
      `วางแผนพร้อมกันได้ ${FREE_ACTIVE_TRIPS} ทริป`,
      `ให้ AI ร่างแพลนฟรี ${FREE_DRAFTS_PER_TRIP} ครั้ง`,
      'ห้องทริป สมาชิกไม่จำกัด',
      'หารบิล งบ และรายจ่ายจริง',
    ],
    includedDraftsPerPeriod: FREE_DRAFTS_PER_TRIP,
    refundableOnBooking: false,
    available: true,
  },
  {
    id: TRIP_PASS_PLAN_ID,
    name: 'Trip Pass',
    tagline: 'ปลดล็อกทริปนี้ทั้งใบ — จองผ่าน ROVE แล้วได้คืนเต็มจำนวน',
    priceThb: TRIP_PASS_PRICE_THB,
    interval: 'trip',
    perks: [
      'ให้ AI ร่างและปรับแพลนได้ไม่จำกัดในทริปนี้',
      'ใครในห้องซื้อก็ปลดล็อกให้ทั้งทริป',
      `จองผ่าน ROVE แล้วคืนให้เต็ม ฿${TRIP_PASS_PRICE_THB}`,
      `หารกัน 4 คน = ฿${splitPerPersonThb(4)} ต่อคน`,
    ],
    includedDraftsPerPeriod: UNLIMITED_DRAFTS,
    refundableOnBooking: true,
    available: true,
  },
  {
    id: ROVE_YEAR_PLAN_ID,
    name: 'ROVE Year',
    tagline: 'เที่ยวปีละหลายทริป ไม่ต้องซื้อ pass ทีละใบ',
    priceThb: ROVE_YEAR_PRICE_THB,
    interval: 'year',
    perks: [
      'ทุกทริปในหนึ่งปีปลดล็อกอัตโนมัติ',
      `คิดเป็น ฿${Math.floor(ROVE_YEAR_PRICE_THB / 12)} ต่อเดือน`,
      `คุ้มตั้งแต่ทริปที่ ${Math.floor(ROVE_YEAR_PRICE_THB / TRIP_PASS_PRICE_THB) + 1} ของปี`,
    ],
    includedDraftsPerPeriod: UNLIMITED_DRAFTS,
    refundableOnBooking: false,
    available: false,
  },
];
