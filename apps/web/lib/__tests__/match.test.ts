import { describe, expect, it } from 'vitest';

import {
  adaptPlan,
  matchBudget,
  monthDistance,
  scoreMatch,
  sharedTags,
  tagCoverage,
} from '@/lib/data/domain';
import type { MatchProfile } from '@/lib/data/domain';
import type { PlanDay } from '@/lib/data';

/**
 * The public match score (A11.3) and the plan adapter (A11.4).
 *
 * Twins of `pkg/domain/match.go` and `pkg/domain/adapt.go`, pinned to the same
 * numbers by `match_test.go` and `adapt_test.go`. A plan that reads 100% here
 * must read 100% when the API scores it.
 */

const PROFILE: MatchProfile = {
  country: 'JP',
  startDate: '2026-12-04',
  days: 6,
  budgetPerPersonThb: 45000,
  partySize: 4,
  tags: ['ของกิน', 'วัด', 'ช้อปปิ้ง'],
};

describe('match score', () => {
  it('gives an identical trip full marks, with a reason per component', () => {
    const got = scoreMatch(PROFILE, PROFILE);
    expect(got.score).toBe(100);
    expect(got.reasons).toHaveLength(4);
  });

  it('treats a different country as no match at all', () => {
    expect(scoreMatch(PROFILE, { ...PROFILE, country: 'KR' }).score).toBe(0);
  });

  it('lets a cheaper trip fit and pushes an expensive one away', () => {
    const under = scoreMatch(PROFILE, { ...PROFILE, budgetPerPersonThb: 30000 }).score;
    const over = scoreMatch(PROFILE, { ...PROFILE, budgetPerPersonThb: 90000 }).score;

    expect(under).toBeGreaterThan(over);
    expect(under).toBeGreaterThanOrEqual(90);
    expect(over).toBeLessThanOrEqual(80);
  });

  it('hits zero on budget at double and full at parity', () => {
    expect(matchBudget(1000, 2000)).toBe(0);
    expect(matchBudget(1000, 1000)).toBe(1);
    expect(matchBudget(0, 1000)).toBe(0.5);
  });

  it('measures months circularly', () => {
    expect(monthDistance(12, 1)).toBe(1);
    expect(monthDistance(1, 7)).toBe(6);
  });

  it('ranks the same month above the opposite season', () => {
    const far = scoreMatch(PROFILE, { ...PROFILE, startDate: '2026-06-04' }).score;
    expect(scoreMatch(PROFILE, PROFILE).score).toBeGreaterThan(far);
  });

  it('asks how much of what I want is there, not how alike the sets are', () => {
    const want = ['ของกิน', 'วัด'];
    const have = ['ของกิน', 'วัด', 'ออนเซ็น', 'ช้อปปิ้ง', 'สกี'];

    expect(tagCoverage(want, have)).toBe(1);
    expect(tagCoverage(want, ['ของกิน'])).toBe(0.5);
  });

  it('keeps the caller spelling of shared tags and stops at three', () => {
    const got = sharedTags(
      ['ของกิน', 'วัด', 'ช้อปปิ้ง', 'ออนเซ็น'],
      ['  ของกิน', 'วัด', 'ช้อปปิ้ง!', 'ออนเซ็น'],
    );
    expect(got).toEqual(['ของกิน', 'วัด', 'ช้อปปิ้ง']);
  });

  it('lands in the middle when nothing is known', () => {
    const blank: MatchProfile = { country: 'JP' };
    const got = scoreMatch(blank, blank);
    expect(got.score).toBe(50);
    expect(got.reasons).toEqual([]);
  });
});

/* ----------------------------------------------------------------- adapt -- */

function item(
  id: string,
  title: string,
  type: PlanDay['items'][number]['type'],
  costJpy?: number,
  bookable?: boolean,
) {
  return { id, type, start: '09:00', title, costJpy, bookable };
}

/** The same fixture as adapt_test.go — six days with an obviously quiet middle. */
function sixDays(): PlanDay[] {
  return [
    {
      id: 'd1', index: 0, date: '2026-04-06', label: 'วันที่ 1', city: 'โตเกียว',
      items: [
        item('a1', 'เช็คอินโรงแรม', 'stay', 6000),
        item('a2', 'ชิบูย่าสกาย', 'poi', 2500, true),
      ],
    },
    {
      id: 'd2', index: 1, date: '2026-04-07', label: 'วันที่ 2', city: 'โตเกียว',
      items: [item('b1', 'teamLab', 'poi', 3800, true), item('b2', 'ราเมงอิจิรัน', 'meal', 1200)],
    },
    {
      id: 'd3', index: 2, date: '2026-04-08', label: 'วันที่ 3', city: 'โตเกียว',
      items: [item('c1', 'เดินเล่นย่านบ้าน', 'free')],
    },
    {
      id: 'd4', index: 3, date: '2026-04-09', label: 'วันที่ 4', city: 'เกียวโต',
      items: [item('d1', 'ชินคันเซ็น', 'transport', 13000), item('d2', 'ฟุชิมิอินาริ', 'poi', 0)],
    },
    {
      id: 'd5', index: 4, date: '2026-04-10', label: 'วันที่ 5', city: 'เกียวโต',
      items: [item('e1', 'อาราชิยามะ', 'poi', 800), item('e2', 'ไคเซกิ', 'meal', 4500)],
    },
    {
      id: 'd6', index: 5, date: '2026-04-11', label: 'วันที่ 6', city: 'โอซาก้า',
      items: [item('f1', 'บินกลับ', 'flight')],
    },
  ];
}

const ids = (days: PlanDay[]) => days.flatMap((d) => d.items.map((i) => i.id));

describe('adapting a copied plan', () => {
  it('changes nothing when nothing is asked', () => {
    const got = adaptPlan(sixDays(), {});
    expect(got.changes).toEqual([]);
    expect(got.after).toEqual(got.before);
  });

  it('shrinks from the quietest middle day and keeps the ends', () => {
    const got = adaptPlan(sixDays(), { days: 5 });

    expect(got.days).toHaveLength(5);
    expect(got.days[0]?.items[0]?.id).toBe('a1');
    expect(got.days[4]?.items[0]?.id).toBe('f1');
    expect(ids(got.days)).not.toContain('c1');
    expect(got.changes[0]).toMatchObject({ kind: 'day_removed', dayLabel: 'วันที่ 3' });
  });

  it('rescues a highlight off a day it is about to remove', () => {
    const days = sixDays();
    days[2]!.items = [item('c1', 'ตลาดปลา', 'poi', 500)];

    const got = adaptPlan(days, { days: 5 });

    expect(ids(got.days)).toContain('c1');
    expect(got.changes.filter((c) => c.kind === 'item_moved')).toHaveLength(1);
  });

  it('stretches with empty days before the last one', () => {
    const got = adaptPlan(sixDays(), { days: 8 });

    expect(got.days).toHaveLength(8);
    expect(got.days[7]?.items[0]?.id).toBe('f1');
    expect(got.days[6]?.items).toEqual([]);
    expect(got.days[3]?.label).toBe('วันที่ 4');
  });

  it('cuts to budget without touching the hotel or the meals', () => {
    const got = adaptPlan(sixDays(), { budgetPerPersonDest: 26000 });

    expect(got.after.costPerPersonDest).toBeLessThanOrEqual(26000);
    expect(ids(got.days)).not.toContain('b1');
    for (const id of ['a1', 'd1', 'b2', 'e2', 'e1']) {
      expect(ids(got.days)).toContain(id);
    }
  });

  it('says so when it cannot reach the budget', () => {
    const got = adaptPlan(sixDays(), { budgetPerPersonDest: 1000 });
    expect(got.warnings).toHaveLength(1);
    expect(got.after.costPerPersonDest).toBeGreaterThan(1000);
  });

  it('slows a day down for a bigger group, cheapest stop first', () => {
    const days = sixDays();
    days[1]!.items.push(
      item('b3', 'ตลาดอะเมโยโกะ', 'poi', 100),
      item('b4', 'อาซากุสะ', 'poi', 200),
      item('b5', 'ล่องเรือ', 'poi', 900),
    );

    const got = adaptPlan(days, { partySize: 10, fromPartySize: 4 });

    for (const day of got.days) {
      const stops = day.items.filter(
        (i) => i.type !== 'stay' && i.type !== 'flight' && i.type !== 'transport',
      );
      expect(stops.length).toBeLessThanOrEqual(3);
    }
    expect(ids(got.days)).not.toContain('b3');
  });

  it('leaves a smaller group alone', () => {
    expect(adaptPlan(sixDays(), { partySize: 2, fromPartySize: 6 }).changes).toEqual([]);
  });

  it('never edits the published plan in place', () => {
    const source = sixDays();
    adaptPlan(source, { days: 3, budgetPerPersonDest: 5000 });
    expect(source).toHaveLength(6);
    expect(source[1]?.items).toHaveLength(2);
  });
});
