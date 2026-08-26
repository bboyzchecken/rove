import type { Order, PaymentMethod, Subscription, SubscriptionPlan } from '@/lib/data';
import { formatMoney, formatThaiDate } from '@/lib/format';

/**
 * Bill & Payment (M20) — how an order is worded.
 *
 * Pure functions, no components: the billing list, the receipt and the payment
 * sheet all have to call one thing "the same thing", and a label duplicated
 * across three files drifts within a week.
 */

export const ORDER_KIND_LABEL: Record<Order['kind'], string> = {
  trip_pass: 'Trip Pass — ปลดล็อกทริป',
  // Withdrawn in M26, kept because receipts issued under it are still in the
  // history and a label that goes missing turns a receipt into a blank row.
  ai_credit: 'สิทธิ์ร่างแพลนด้วย AI',
  subscription: 'แพ็กเกจสมาชิก',
  points_topup: 'เติมแต้ม ROVE',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'บัตรเครดิต/เดบิต',
  promptpay: 'พร้อมเพย์ (QR)',
  truemoney: 'TrueMoney Wallet',
  points: 'แต้ม ROVE',
  free: 'ไม่มีค่าใช้จ่าย',
};

export const ORDER_STATUS: Record<
  Order['status'],
  { label: string; tone: 'matcha' | 'sun' | 'danger' | 'neutral' }
> = {
  paid: { label: 'ชำระแล้ว', tone: 'matcha' },
  pending: { label: 'รอชำระ', tone: 'sun' },
  failed: { label: 'ไม่สำเร็จ', tone: 'danger' },
  refunded: { label: 'คืนเงินแล้ว', tone: 'neutral' },
};

/**
 * What the row on the right says.
 *
 * An order paid with points has a total of ฿0, and printing "฿0" next to a
 * purchase reads like a bug. It cost something — it cost points — so that is
 * what the number says.
 */
export function orderAmountLabel(order: Order) {
  if (order.method === 'points' && order.pointsSpent > 0) {
    return `${order.pointsSpent.toLocaleString('th-TH')} แต้ม`;
  }
  if (order.totalThb === 0) return 'ฟรี';
  return formatMoney(order.totalThb, order.currency);
}

const INTERVAL_LABEL: Record<SubscriptionPlan['interval'], string> = {
  trip: 'ทริป',
  month: 'เดือน',
  year: 'ปี',
};

export function planPriceLabel(plan: SubscriptionPlan) {
  if (plan.priceThb === 0) return 'ฟรี';
  return `${formatMoney(plan.priceThb, 'THB')} / ${INTERVAL_LABEL[plan.interval]}`;
}

/**
 * How many drafts a plan hands out, in words. Unlimited is a sentinel rather
 * than a big number (`-1`), so it has to be spelled out rather than printed.
 */
export function planDraftsLabel(plan: SubscriptionPlan) {
  if (plan.includedDraftsPerPeriod < 0) return 'ให้ AI ร่างได้ไม่จำกัด';
  return `ให้ AI ร่างได้ ${plan.includedDraftsPerPeriod} ครั้ง`;
}

/** The line under the plan name — renewal, expiry, or the reason there is none. */
export function subscriptionStatusLine(subscription: Subscription) {
  switch (subscription.status) {
    case 'active':
      return subscription.currentPeriodEnd
        ? subscription.cancelAtPeriodEnd
          ? `ใช้ได้ถึง ${formatThaiDate(subscription.currentPeriodEnd)} แล้วจะไม่ต่ออายุ`
          : `ต่ออายุอัตโนมัติ ${formatThaiDate(subscription.currentPeriodEnd)}`
        : 'กำลังใช้งาน';
    case 'past_due':
      return 'เก็บเงินรอบล่าสุดไม่สำเร็จ — อัปเดตวิธีจ่ายเพื่อใช้ต่อ';
    case 'canceled':
      return 'ยกเลิกแล้ว';
    default:
      return 'ไม่มีค่าใช้จ่ายรายเดือน จ่ายเป็นทริป ๆ ไปตอนปลดล็อก';
  }
}

/**
 * History grouped by Buddhist year, newest first.
 *
 * A flat list of receipts stops being readable at about a dozen rows, and the
 * question people bring to this screen is almost always "ปีนี้จ่ายไปเท่าไหร่".
 */
export function groupOrdersByYear(orders: Order[]) {
  const groups = new Map<number, Order[]>();

  for (const order of orders) {
    const year = new Date(order.issuedAt).getFullYear() + 543;
    const bucket = groups.get(year);
    if (bucket) bucket.push(order);
    else groups.set(year, [order]);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      orders: [...items].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
      /** Cash only: points are not baht and adding them together says nothing. */
      totalThb: items.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.totalThb, 0),
    }));
}
