import { describe, expect, it } from 'vitest';

import { groupOrdersByYear, orderAmountLabel } from '../billing';
import { buildOrder, receiptNumber, seedOrders } from '../data/mock/billing';
import type { Order } from '../data/types';

/**
 * Bill & Payment (M20).
 *
 * Two things here are worth pinning down, and both are about a number being
 * honest: what a points purchase costs (not ฿0), and what a year adds up to
 * (cash only — points are not baht).
 */

function order(patch: Partial<Order> = {}): Order {
  return {
    ...buildOrder(
      'ord_test',
      {
        kind: 'ai_credit',
        title: 'ร่างแพลนด้วย AI เพิ่ม 1 ครั้ง',
        lineLabel: 'สิทธิ์ให้ AI ร่างแพลน',
        quantity: 1,
        unitAmountThb: 39,
        method: 'card',
        methodLabel: 'บัตรเครดิต/เดบิต',
        issuedAt: '2026-08-12T09:20:00.000Z',
      },
      [],
    ),
    ...patch,
  };
}

describe('receipt numbering', () => {
  it('counts within the Buddhist year', () => {
    expect(receiptNumber('2026-08-12T00:00:00.000Z', [])).toBe('RV-2569-000001');
  });

  it('takes the next sequence for that year only', () => {
    const existing = [order({ number: 'RV-2569-000001' }), order({ number: 'RV-2568-000009' })];
    expect(receiptNumber('2026-12-31T00:00:00.000Z', existing)).toBe('RV-2569-000002');
  });

  it('never reuses a number across the seeded history', () => {
    const numbers = seedOrders().map((o) => o.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('what an order cost', () => {
  it('keeps the list price on a points purchase and charges nothing', () => {
    const paid = buildOrder(
      'ord_points',
      {
        kind: 'ai_credit',
        title: 'ร่างแพลนด้วย AI เพิ่ม 2 ครั้ง',
        lineLabel: 'สิทธิ์ให้ AI ร่างแพลน',
        quantity: 2,
        unitAmountThb: 39,
        method: 'points',
        methodLabel: '600 แต้ม ROVE',
        pointsSpent: 600,
        issuedAt: '2026-08-18T02:05:00.000Z',
      },
      [],
    );

    expect(paid.subtotalThb).toBe(78);
    expect(paid.discountThb).toBe(78);
    expect(paid.totalThb).toBe(0);
    // Nothing was charged, so nothing may be flagged as an uncharged charge.
    expect(paid.simulated).toBe(false);
  });

  it('reports a points purchase in points, never as ฿0', () => {
    expect(orderAmountLabel(order({ method: 'points', pointsSpent: 600, totalThb: 0 }))).toBe(
      '600 แต้ม',
    );
  });

  it('flags a cash order as simulated while there is no gateway', () => {
    expect(order().simulated).toBe(true);
  });
});

describe('grouping the history', () => {
  const orders = [
    order({ id: 'a', issuedAt: '2026-08-12T09:20:00.000Z', totalThb: 39 }),
    order({ id: 'b', issuedAt: '2026-02-01T09:20:00.000Z', totalThb: 78 }),
    order({ id: 'c', issuedAt: '2025-11-01T09:20:00.000Z', totalThb: 39 }),
    order({
      id: 'd',
      issuedAt: '2026-05-01T09:20:00.000Z',
      method: 'points',
      pointsSpent: 300,
      totalThb: 0,
    }),
  ];

  it('buckets by Buddhist year, newest first', () => {
    expect(groupOrdersByYear(orders).map((g) => g.year)).toEqual([2569, 2568]);
  });

  it('orders each bucket newest first', () => {
    expect(groupOrdersByYear(orders)[0]?.orders.map((o) => o.id)).toEqual(['a', 'd', 'b']);
  });

  it('totals cash only — points are not baht', () => {
    expect(groupOrdersByYear(orders)[0]?.totalThb).toBe(117);
  });

  it('leaves an unpaid order out of the total but not out of the list', () => {
    const withFailure = [
      ...orders,
      order({ id: 'e', issuedAt: '2026-06-01T00:00:00.000Z', status: 'failed', totalThb: 39 }),
    ];
    const current = groupOrdersByYear(withFailure)[0];
    expect(current?.orders).toHaveLength(4);
    expect(current?.totalThb).toBe(117);
  });
});
