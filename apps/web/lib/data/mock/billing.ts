import { AI_CREDITS } from '@/lib/mock/trip';

import type {
  Order,
  OrderKind,
  PayChannel,
  PaymentMethod,
  Subscription,
  SubscriptionPlan,
} from '../types';

/**
 * Bill & Payment (M20) — the mock side.
 *
 * Two things live here: the price list, which is reference data the API owns in
 * live mode, and the receipt bookkeeping the mock repository needs in order to
 * behave like a real one (numbering, totals, the seeded history a UAT tester
 * opens the screen expecting to see).
 *
 * The plan catalogue is already three rows even though none of them is on sale.
 * A billing screen that has to be rebuilt the day subscriptions ship is a
 * billing screen that was designed for one product; this one is designed for
 * the second one too.
 */

/**
 * What a paid draft can be paid with. Listed in the paywall so nobody has to
 * tap "ซื้อ" to find out whether their method is accepted — and the id, not the
 * label, is what the receipt records.
 */
export const AI_PAY_CHANNELS: PayChannel[] = [
  { id: 'card', label: 'บัตรเครดิต/เดบิต' },
  { id: 'promptpay', label: 'พร้อมเพย์ (QR)' },
  { id: 'truemoney', label: 'TrueMoney Wallet' },
];

export const FREE_PLAN_ID = 'free';

export const PLANS: SubscriptionPlan[] = [
  {
    id: FREE_PLAN_ID,
    name: 'ROVE ฟรี',
    tagline: 'ทุกอย่างที่ต้องใช้วางแผนทริปกับเพื่อน',
    priceThb: 0,
    interval: 'month',
    perks: [
      `ให้ AI ร่างแพลนฟรี ${AI_CREDITS.freePerTrip} ครั้งต่อทริป`,
      'ห้องทริป สมาชิกไม่จำกัด',
      'หารบิล งบ และรายจ่ายจริง',
      `ร่างเพิ่มครั้งละ ฿${AI_CREDITS.priceThb} หรือ ${AI_CREDITS.pointsPerRun} แต้ม`,
    ],
    includedDraftsPerPeriod: 0,
    available: true,
  },
  {
    id: 'rove_plus_monthly',
    name: 'ROVE Plus รายเดือน',
    tagline: 'ร่างด้วย AI ได้ทุกทริปโดยไม่ต้องซื้อทีละครั้ง',
    priceThb: 129,
    interval: 'month',
    perks: [
      'ให้ AI ร่างแพลน 15 ครั้งต่อเดือน ใช้ได้ทุกทริป',
      'ปรับแพลนซ้ำได้ไม่จำกัด',
      'เอกสารและ export ไม่มีลายน้ำ',
    ],
    includedDraftsPerPeriod: 15,
    available: false,
  },
  {
    id: 'rove_plus_yearly',
    name: 'ROVE Plus รายปี',
    tagline: 'จ่ายทีเดียว ถูกกว่ารายเดือนสองเดือน',
    priceThb: 1_290,
    interval: 'year',
    perks: ['ทุกอย่างของรายเดือน', 'คิดเป็น ฿107 ต่อเดือน', 'ล็อกราคาไว้ทั้งปี'],
    includedDraftsPerPeriod: 15,
    available: false,
  },
];

/**
 * Everyone is on the free plan until a gateway exists. It is a real
 * subscription record in shape — status, period, interval — so the screen that
 * renders a paid one is already the screen being rendered today.
 */
export const FREE_SUBSCRIPTION: Subscription = {
  id: null,
  planId: FREE_PLAN_ID,
  planName: 'ROVE ฟรี',
  status: 'none',
  interval: null,
  priceThb: 0,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  includedDraftsPerPeriod: 0,
};

/* ------------------------------------------------------------- numbering -- */

/**
 * "RV-2569-000004" — Buddhist year, then a per-year sequence.
 *
 * A receipt number is what a person quotes when they write in about a charge,
 * so it is short, spoken out loud without ambiguity, and never reused. Mock
 * mode counts the orders it already has for that year; the API does the same
 * count inside a transaction and leans on a unique index (§4.2).
 */
export function receiptNumber(issuedAt: string, existing: Order[]) {
  const year = new Date(issuedAt).getFullYear() + 543;
  const prefix = `RV-${year}-`;
  const taken = existing.filter((o) => o.number.startsWith(prefix)).length;
  return `${prefix}${String(taken + 1).padStart(6, '0')}`;
}

/* ---------------------------------------------------------------- orders -- */

export interface DraftOrderInput {
  kind: OrderKind;
  title: string;
  quantity: number;
  unitAmountThb: number;
  method: PaymentMethod;
  methodLabel: string;
  lineLabel: string;
  pointsSpent?: number;
  tripId?: string | null;
  tripTitle?: string | null;
  issuedAt: string;
}

/**
 * Builds a completed order. Points and cash produce the *same* record — one
 * with a total of ฿0 and a points figure, one the other way round — because
 * "what have I spent on ROVE" is a question about both.
 */
export function buildOrder(id: string, input: DraftOrderInput, existing: Order[]): Order {
  const amount = input.unitAmountThb * input.quantity;
  const paidWithPoints = input.method === 'points';

  return {
    id,
    number: receiptNumber(input.issuedAt, existing),
    kind: input.kind,
    status: 'paid',
    title: input.title,
    lines: [
      {
        label: input.lineLabel,
        quantity: input.quantity,
        unitAmountThb: input.unitAmountThb,
        amountThb: amount,
      },
    ],
    subtotalThb: amount,
    // Points do not reduce a price, they replace it: the line keeps its list
    // price and the whole of it is discounted away, so the receipt still says
    // what the thing was worth.
    discountThb: paidWithPoints ? amount : 0,
    totalThb: paidWithPoints ? 0 : amount,
    currency: 'THB',
    method: input.method,
    methodLabel: input.methodLabel,
    pointsSpent: input.pointsSpent ?? 0,
    tripId: input.tripId ?? null,
    tripTitle: input.tripTitle ?? null,
    provider: null,
    providerRef: null,
    // No gateway in Phase 1: a cash order is recorded, not charged.
    simulated: !paidWithPoints,
    periodStart: null,
    periodEnd: null,
    issuedAt: input.issuedAt,
    paidAt: input.issuedAt,
    refundedAt: null,
  };
}

/**
 * The history a UAT tester finds already there: one draft bought with a card,
 * one paid for with points. Two rows is enough to show that the list groups,
 * totals and links to receipts — and that points purchases are in it too.
 */
export function seedOrders(): Order[] {
  const out: Order[] = [];

  out.push(
    buildOrder(
      'ord_seed_1',
      {
        kind: 'ai_credit',
        title: 'ร่างแพลนด้วย AI เพิ่ม 1 ครั้ง',
        lineLabel: 'สิทธิ์ให้ AI ร่างแพลน (ทริปญี่ปุ่นใบไม้เปลี่ยนสี 2569)',
        quantity: 1,
        unitAmountThb: AI_CREDITS.priceThb,
        method: 'promptpay',
        methodLabel: 'พร้อมเพย์ (QR)',
        tripId: 'demo',
        tripTitle: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569',
        issuedAt: '2026-08-12T09:20:00.000Z',
      },
      out,
    ),
  );

  out.push(
    buildOrder(
      'ord_seed_2',
      {
        kind: 'ai_credit',
        title: 'ร่างแพลนด้วย AI เพิ่ม 2 ครั้ง',
        lineLabel: 'สิทธิ์ให้ AI ร่างแพลน (แลกด้วยแต้ม ROVE)',
        quantity: 2,
        unitAmountThb: AI_CREDITS.priceThb,
        method: 'points',
        methodLabel: `${AI_CREDITS.pointsPerRun * 2} แต้ม ROVE`,
        pointsSpent: AI_CREDITS.pointsPerRun * 2,
        tripId: 'demo',
        tripTitle: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569',
        issuedAt: '2026-08-18T02:05:00.000Z',
      },
      out,
    ),
  );

  return out;
}
