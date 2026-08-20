import { describe, expect, it } from 'vitest';

import { moveItemLocally } from '../queries';
import type { Item, PlanDetail } from '@/types/api';

/**
 * The optimistic reorder IS the drag-and-drop UI — the server response only
 * confirms it. If this is wrong, cards land in the wrong place and then snap,
 * which is the single worst thing a timeline editor can do.
 */

function item(id: string, dayId: string, sortOrder: number): Item {
  return {
    id,
    day_id: dayId,
    plan_id: 'plan-1',
    sort_order: sortOrder,
    type: 'place',
    poi_id: null,
    title: id,
    notes: '',
    start_time: '',
    end_time: '',
    duration_min: 0,
    travel_mode: '',
    travel_min: 0,
    travel_note: '',
    cost_amount: null,
    cost_currency: 'JPY',
    cost_basis: 'per_person',
    cost_status: 'estimate',
    cost_note: '',
    is_prepaid: false,
    booking_partner: '',
    booking_url: '',
    booking_status: 'none',
    verified: 'unverified',
    lat: null,
    lng: null,
  };
}

function plan(): PlanDetail {
  return {
    plan: {
      id: 'plan-1',
      trip_id: 'trip-1',
      name: 'test',
      parent_plan_id: null,
      version: 1,
      is_final: false,
      created_by: 'ai',
      created_by_user_id: null,
      summary: '',
      pros: null,
      cons: null,
      key_decision: '',
      status: 'ready',
      created_at: '2026-04-01T00:00:00Z',
    },
    days: [
      {
        id: 'day-1',
        plan_id: 'plan-1',
        date: '2026-04-06',
        day_index: 0,
        title: '',
        theme: '',
        sort_order: 0,
        items: [item('a', 'day-1', 0), item('b', 'day-1', 1), item('c', 'day-1', 2)],
      },
      {
        id: 'day-2',
        plan_id: 'plan-1',
        date: '2026-04-07',
        day_index: 1,
        title: '',
        theme: '',
        sort_order: 1,
        items: [item('d', 'day-2', 0)],
      },
    ],
    rationales: [],
    warnings: [],
    pois: {},
  };
}

const idsIn = (result: PlanDetail, dayId: string) =>
  result.days.find((d) => d.id === dayId)!.items.map((i) => i.id);

describe('moveItemLocally', () => {
  it('reorders within a day', () => {
    const result = moveItemLocally(plan(), 'c', 'day-1', 0);
    expect(idsIn(result, 'day-1')).toEqual(['c', 'a', 'b']);
  });

  it('moves an item to another day at the given position', () => {
    const result = moveItemLocally(plan(), 'a', 'day-2', 0);

    expect(idsIn(result, 'day-1')).toEqual(['b', 'c']);
    expect(idsIn(result, 'day-2')).toEqual(['a', 'd']);
  });

  it('reassigns day_id on the moved item', () => {
    const result = moveItemLocally(plan(), 'a', 'day-2', 1);
    const moved = result.days.find((d) => d.id === 'day-2')!.items.find((i) => i.id === 'a');

    expect(moved?.day_id).toBe('day-2');
  });

  it('renumbers sort_order densely in the target day', () => {
    const result = moveItemLocally(plan(), 'c', 'day-1', 0);
    const orders = result.days.find((d) => d.id === 'day-1')!.items.map((i) => i.sort_order);

    expect(orders).toEqual([0, 1, 2]);
  });

  // dnd-kit can report an index past the end when a card is dropped in the gap
  // below the last one.
  it('clamps a position past the end to the end', () => {
    const result = moveItemLocally(plan(), 'a', 'day-1', 99);
    expect(idsIn(result, 'day-1')).toEqual(['b', 'c', 'a']);
  });

  it('clamps a negative position to the start', () => {
    const result = moveItemLocally(plan(), 'c', 'day-1', -5);
    expect(idsIn(result, 'day-1')).toEqual(['c', 'a', 'b']);
  });

  it('leaves the plan untouched for an unknown item', () => {
    const original = plan();
    const result = moveItemLocally(original, 'nope', 'day-1', 0);

    expect(result).toBe(original);
  });

  it('does not mutate the input', () => {
    const original = plan();
    moveItemLocally(original, 'a', 'day-2', 0);

    expect(original.days[0]!.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(original.days[1]!.items.map((i) => i.id)).toEqual(['d']);
  });
});
