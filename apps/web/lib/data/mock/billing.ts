import { FREE_DRAFTS_PER_TRIP, FREE_PLAN_ID } from '@/lib/catalog/plans';

import { AI_CREDITS } from './seed/trip';

import type { Order, OrderKind, PayChannel, PaymentMethod, Subscription } from '../types';

/**
 * Bill & Payment (M20) — the mock side.
 *
 * Two things live here: the price list, which is reference data the API owns in
 * live mode, and the receipt bookkeeping the mock repository needs in order to
 * behave like a real one (numbering, totals, the seeded history a UAT tester
 * opens the screen expecting to see).
 *
 * The plan catalogue itself moved to `lib/catalog/plans.ts` in M26 and is
 * re-exported below, so mock mode and the public pricing page read one list.
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

/**
 * The catalogue lives in `lib/catalog/plans.ts` — one copy on this side of the
 * wire, shared with the public pricing page, which cannot fetch it because the
 * catalogue endpoint is behind sign-in.
 */
export {
  FREE_ACTIVE_TRIPS,
  FREE_PLAN_ID,
  PLANS,
  ROVE_YEAR_PLAN_ID,
  TRIP_PASS_PLAN_ID,
  UNLIMITED_DRAFTS,
} from '@/lib/catalog/plans';

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
  includedDraftsPerPeriod: FREE_DRAFTS_PER_TRIP,
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

/** What the old per-draft product cost, before M26 withdrew it. */
const LEGACY_DRAFT_PRICE_THB = 39;

/**
 * The history a UAT tester finds already there: one draft bought back when
 * drafts were sold one at a time, and one Trip Pass that came back because the
 * trip it unlocked ended in a booking.
 *
 * The withdrawn product is in the list on purpose. Receipts are a record of
 * what happened, not of what is currently for sale, and a billing screen that
 * cannot render its own history is one that would have to be repaired every
 * time the price list changes.
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
        unitAmountThb: LEGACY_DRAFT_PRICE_THB,
        method: 'promptpay',
        methodLabel: 'พร้อมเพย์ (QR)',
        tripId: 'demo',
        tripTitle: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569',
        issuedAt: '2026-05-12T09:20:00.000Z',
      },
      out,
    ),
  );

  const refunded = buildOrder(
    'ord_seed_2',
    {
      kind: 'trip_pass',
      title: 'Trip Pass — โซลกับเพื่อนสนิท',
      lineLabel: 'ปลดล็อกทริป (ให้ AI ร่างและปรับแพลนไม่จำกัด)',
      quantity: 1,
      unitAmountThb: AI_CREDITS.passPriceThb,
      method: 'promptpay',
      methodLabel: 'พร้อมเพย์ (QR)',
      tripId: 'seoul',
      tripTitle: 'โซลกับเพื่อนสนิท',
      issuedAt: '2026-01-20T02:05:00.000Z',
    },
    out,
  );
  // Booked through ROVE on 26 Jan, so the pass was paid back (A26.4). The
  // status changes and the row stays: a refund is a new fact about an order,
  // never a receipt quietly rewritten.
  refunded.status = 'refunded';
  refunded.refundedAt = '2026-01-26T09:25:00.000Z';
  out.push(refunded);

  return out;
}
