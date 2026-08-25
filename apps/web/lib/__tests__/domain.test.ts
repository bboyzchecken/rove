import { describe, expect, it } from 'vitest';

import {
  addDays,
  budgetFromPlan,
  computeExpenses,
  computeWindows,
  daysBetween,
  membersFreeInRange,
  monthStartDow,
  settle,
  thaiRangeLabel,
  validateDays,
} from '@/lib/data/domain';
import type { AvailabilityEntry, ExpenseEntry, Member, PlanDay } from '@/lib/data';

/**
 * These are the rules the Go API has to agree with (`pkg/domain/*.go`). If one
 * of these numbers changes, the API's twin has to change with it — that is the
 * whole reason they are pinned here.
 */

const MEMBERS: Member[] = [
  { id: 'm1', name: 'ตอง', role: 'owner', characterId: 'shiba', hasWishlist: true },
  { id: 'm2', name: 'มายด์', role: 'editor', characterId: 'cat', hasWishlist: true },
  { id: 'm3', name: 'ปอนด์', role: 'editor', characterId: 'capybara', hasWishlist: true },
  { id: 'm4', name: 'จูน', role: 'editor', characterId: 'penguin', hasWishlist: false },
];

function free(memberId: string, days: number[]): AvailabilityEntry[] {
  return days.map((d) => ({
    memberId,
    date: `2026-12-${String(d).padStart(2, '0')}`,
    mark: 'free' as const,
  }));
}

describe('dates', () => {
  it('counts an inclusive range', () => {
    expect(daysBetween('2026-12-04', '2026-12-08')).toBe(5);
    expect(daysBetween('2026-12-04', '2026-12-04')).toBe(1);
  });

  it('walks across a month boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('knows December 2026 starts on a Tuesday', () => {
    expect(monthStartDow('2026-12-01')).toBe(2);
  });

  it('collapses a shared month in the range label', () => {
    expect(thaiRangeLabel('2026-12-04', '2026-12-08')).toBe('4–8 ธ.ค.');
    expect(thaiRangeLabel('2026-12-28', '2027-01-02')).toBe('28 ธ.ค. – 2 ม.ค.');
  });
});

describe('computeWindows', () => {
  // The four-person overlap the date board demo is built on.
  const entries = [
    ...free('m1', [4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22]),
    ...free('m2', [4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 23, 24, 25]),
    ...free('m3', [3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22]),
    ...free('m4', [4, 5, 6, 7, 8, 9, 18, 19, 20, 21, 22, 23, 24]),
  ];

  it('finds every window where all four overlap', () => {
    const everyone = computeWindows(entries, MEMBERS).filter((w) => w.everyone);
    expect(everyone.map((w) => `${w.startDate}..${w.endDate}`)).toEqual(
      expect.arrayContaining(['2026-12-04..2026-12-08', '2026-12-20..2026-12-22']),
    );
  });

  it('ranks the longer full-group window first', () => {
    const [best] = computeWindows(entries, MEMBERS);
    expect(best?.startDate).toBe('2026-12-04');
    expect(best?.days).toBe(5);
    expect(best?.everyone).toBe(true);
  });

  it('keeps only maximal runs per member set', () => {
    const windows = computeWindows(entries, MEMBERS);
    const fullGroup = windows.filter((w) => w.everyone && w.startDate === '2026-12-04');
    // 4–5, 4–6, 4–7 are all real overlaps but only 4–8 is worth suggesting.
    expect(fullGroup).toHaveLength(1);
    expect(fullGroup[0]?.endDate).toBe('2026-12-08');
  });

  it('returns nothing when fewer than two people overlap', () => {
    expect(computeWindows(free('m1', [1, 2, 3]), MEMBERS)).toEqual([]);
  });

  it('treats "maybe" as available-but-flagged, never as free', () => {
    const withMaybe: AvailabilityEntry[] = [
      ...free('m1', [4, 5]),
      ...free('m2', [4, 5]),
      { memberId: 'm3', date: '2026-12-04', mark: 'maybe' },
      { memberId: 'm3', date: '2026-12-05', mark: 'maybe' },
    ];
    const [window] = computeWindows(withMaybe, MEMBERS);
    expect(window?.memberIds.sort()).toEqual(['m1', 'm2']);
    expect(window?.maybeMemberIds).toEqual(['m3']);
    expect(window?.everyone).toBe(false);
  });
});

describe('membersFreeInRange', () => {
  const entries = [...free('m1', [4, 5, 6]), ...free('m2', [4, 5]), ...free('m3', [5, 6])];

  it('requires every day of the range, not just one', () => {
    const { free: available } = membersFreeInRange(entries, MEMBERS, '2026-12-04', '2026-12-06');
    expect(available.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('expenses', () => {
  const entries: ExpenseEntry[] = [
    {
      id: 'e1',
      date: '2026-11-15',
      title: 'ตั๋วรถไฟ',
      category: 'เดินทาง',
      scope: 'shared',
      amount: 4_000,
      currency: 'JPY',
      paidBy: 'm1',
      participants: ['m1', 'm2', 'm3', 'm4'],
    },
    {
      id: 'e2',
      date: '2026-11-15',
      title: 'ของฝากส่วนตัว',
      category: 'ช้อปปิ้ง',
      scope: 'personal',
      amount: 1_000,
      currency: 'THB',
      paidBy: 'm2',
      participants: [],
    },
  ];

  it('splits shared spending and leaves personal alone', () => {
    const summary = computeExpenses(entries, MEMBERS, 0.25);
    expect(summary.sharedTotalThb).toBe(1_000);
    expect(summary.personalTotalThb).toBe(1_000);

    const tong = summary.perMember.find((r) => r.member.id === 'm1')!;
    expect(tong.paidThb).toBe(1_000);
    expect(tong.shareThb).toBe(250);
    expect(tong.balanceThb).toBe(750);

    const mind = summary.perMember.find((r) => r.member.id === 'm2')!;
    expect(mind.personalThb).toBe(1_000);
    expect(mind.balanceThb).toBe(-250);
  });

  it('settles a group of four in at most three transfers', () => {
    const summary = computeExpenses(entries, MEMBERS, 0.25);
    expect(summary.settlements.length).toBeLessThanOrEqual(3);
    expect(summary.settlements.every((s) => s.toMemberId === 'm1')).toBe(true);
  });

  it('drops a settlement once it has been paid back', () => {
    const summary = computeExpenses(entries, MEMBERS, 0.25, [
      { fromMemberId: 'm2', toMemberId: 'm1' },
    ]);
    expect(summary.settlements.some((s) => s.fromMemberId === 'm2')).toBe(false);
  });

  it('nets balances to zero', () => {
    const rows = [
      { member: { id: 'a' }, balanceThb: 300 },
      { member: { id: 'b' }, balanceThb: -100 },
      { member: { id: 'c' }, balanceThb: -200 },
    ];
    const total = settle(rows).reduce((sum, s) => sum + s.amountThb, 0);
    expect(total).toBe(300);
  });

  /* ------------------------------------------- minimal settle-up (A16.5) -- */

  it('finds the subgroups that already clear among themselves', () => {
    // Two people owe 500 and two are owed 500. Greedy pairing needs three
    // transfers here; splitting the group into two pairs needs two.
    const got = settle([
      { member: { id: 'a' }, balanceThb: -500 },
      { member: { id: 'b' }, balanceThb: 500 },
      { member: { id: 'c' }, balanceThb: -500 },
      { member: { id: 'd' }, balanceThb: 500 },
    ]);

    expect(got).toHaveLength(2);
    expect(got.every((t) => t.amountThb === 500)).toBe(true);
  });

  it('still needs k-1 transfers when nothing splits', () => {
    const got = settle([
      { member: { id: 'a' }, balanceThb: 900 },
      { member: { id: 'b' }, balanceThb: -300 },
      { member: { id: 'c' }, balanceThb: -300 },
      { member: { id: 'd' }, balanceThb: -300 },
    ]);

    expect(got).toHaveLength(3);
    expect(got.every((t) => t.toMemberId === 'a')).toBe(true);
  });

  it('leaves every balance exactly cleared', () => {
    const rows = [
      { member: { id: 'a' }, balanceThb: -1200 },
      { member: { id: 'b' }, balanceThb: 700 },
      { member: { id: 'c' }, balanceThb: -800 },
      { member: { id: 'd' }, balanceThb: 1300 },
      { member: { id: 'e' }, balanceThb: 0 },
    ];

    const net: Record<string, number> = {};
    for (const t of settle(rows)) {
      net[t.fromMemberId] = (net[t.fromMemberId] ?? 0) - t.amountThb;
      net[t.toMemberId] = (net[t.toMemberId] ?? 0) + t.amountThb;
    }
    for (const row of rows) {
      expect(net[row.member.id] ?? 0).toBe(row.balanceThb);
    }
  });

  it('absorbs per-member rounding into the largest balance', () => {
    const got = settle([
      { member: { id: 'a' }, balanceThb: -333 },
      { member: { id: 'b' }, balanceThb: -333 },
      { member: { id: 'c' }, balanceThb: 667 },
    ]);

    expect(got.reduce((sum, t) => sum + t.amountThb, 0)).toBe(666);
  });

  it('falls back to greedy above the exact limit and still clears', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => ({
        member: { id: `m${i}` },
        balanceThb: -100,
      })),
      { member: { id: 'z' }, balanceThb: 1200 },
    ];

    const got = settle(rows);
    expect(got).toHaveLength(12);
    expect(got.reduce((sum, t) => sum + t.amountThb, 0)).toBe(1200);
  });
});

describe('plan', () => {
  const days: PlanDay[] = [
    {
      id: 'd1',
      index: 1,
      date: '2026-11-15',
      label: 'วันที่ 1',
      city: 'โตเกียว',
      items: [
        {
          id: 'i1',
          type: 'poi',
          start: '09:00',
          end: '10:00',
          title: 'สวนชินจูกุ',
          costJpy: 500,
          travel: { minutes: 40, mode: 'train' },
        },
        { id: 'i2', type: 'meal', start: '10:20', title: 'ข้าวเที่ยง', costJpy: 1_800 },
      ],
    },
  ];

  it('flags an item that cannot be reached in time', () => {
    const [day] = validateDays(days);
    expect(day?.items[1]?.warning).toContain('เวลาชนกับ');
  });

  it('rolls plan costs up by category and keeps manual lines the plan is silent on', () => {
    const manual = [
      { category: 'ที่พัก', icon: '🏠', accent: 'joyfull' as const, totalJpy: 268_000, perPersonJpy: 67_000, prepaid: true },
      { category: 'อาหาร', icon: '🍜', accent: 'primary' as const, totalJpy: 999, perPersonJpy: 999 },
    ];
    const lines = budgetFromPlan(days, 4, manual);

    expect(lines.find((l) => l.category === 'อาหาร')?.perPersonJpy).toBe(1_800);
    expect(lines.find((l) => l.category === 'ตั๋ว/กิจกรรม')?.totalJpy).toBe(2_000);
    // Nothing in the plan is a hotel, so the prepaid estimate survives.
    expect(lines.find((l) => l.category === 'ที่พัก')?.perPersonJpy).toBe(67_000);
  });

  it('keeps the manual estimate when no item has a price yet', () => {
    const manual = [
      { category: 'ที่พัก', icon: '🏠', accent: 'joyfull' as const, totalJpy: 1, perPersonJpy: 1 },
    ];
    const empty: PlanDay[] = [{ ...days[0]!, items: [] }];
    expect(budgetFromPlan(empty, 4, manual)).toBe(manual);
  });
});
