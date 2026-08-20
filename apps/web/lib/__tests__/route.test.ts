import { describe, expect, it } from 'vitest';

import { searchAirports } from '@/lib/data/airports';
import { buildRoute, routeCities, routeWarnings, stayLabel } from '@/lib/data/route';
import type { Airport, FlightLegInput } from '@/lib/data';

/**
 * The twin of `apps/api/pkg/domain/route_test.go` — same legs, same numbers.
 * Mock mode derives the route in the browser and live mode receives it from the
 * API, and a UAT tester must not be able to tell which one drew the screen.
 */

function airport(iata: string, cityTh: string, cc: string, countryTh: string): Airport {
  return {
    iata,
    name: `${cityTh} Airport`,
    city: cityTh,
    cityTh,
    countryCode: cc,
    country: cc,
    countryTh,
    timezone: 'Asia/Bangkok',
    lat: 0,
    lon: 0,
    major: true,
  };
}

const INDEX: Record<string, Airport> = {
  BKK: airport('BKK', 'กรุงเทพ', 'TH', 'ไทย'),
  NRT: airport('NRT', 'โตเกียว', 'JP', 'ญี่ปุ่น'),
  KIX: airport('KIX', 'โอซาก้า', 'JP', 'ญี่ปุ่น'),
  ICN: airport('ICN', 'โซล', 'KR', 'เกาหลีใต้'),
};

const lookup = (iata: string) => INDEX[iata] ?? null;

function leg(patch: Partial<FlightLegInput>): FlightLegInput {
  return { direction: 'out', mode: 'flight', from: '', to: '', depDate: '', ...patch };
}

describe('buildRoute', () => {
  // The trip from the brief: BKK→NRT 4 ธ.ค. ถึง 08:05, NRT→BKK 10 ธ.ค. ถึง 22:05.
  it('turns a return ticket into a frame', () => {
    const route = buildRoute(
      [
        leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-04', arrTime: '08:05' }),
        leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-10', arrTime: '22:05' }),
      ],
      lookup,
    );

    expect(route.roundTrip).toBe(true);
    expect(route.startDate).toBe('2026-12-04');
    expect(route.endDate).toBe('2026-12-10');
    expect(route.days).toBe(7);
    expect(route.nights).toBe(6);
    expect(route.stops).toHaveLength(1);
    expect(route.stops[0]).toMatchObject({ city: 'โตเกียว', nights: 6, arriveTime: '08:05' });
    expect(routeCities(route)).toEqual(['โตเกียว']);
  });

  // "โซล อูเอโนะ" used to be unanswerable. As legs it is two countries with a
  // night count each.
  it('splits a two-country route by nights', () => {
    const route = buildRoute(
      [
        leg({ from: 'BKK', to: 'ICN', depDate: '2026-12-04' }),
        leg({ direction: 'inter', from: 'ICN', to: 'NRT', depDate: '2026-12-07' }),
        leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-11' }),
      ],
      lookup,
    );

    expect(route.countries).toEqual([
      { code: 'KR', name: 'เกาหลีใต้', cities: 'โซล', nights: 3 },
      { code: 'JP', name: 'ญี่ปุ่น', cities: 'โตเกียว', nights: 4 },
    ]);
    expect(stayLabel(route)).toBe('โซล 3 คืน · โตเกียว 4 คืน');
  });

  it('keeps two cities of one country on one country line', () => {
    const route = buildRoute(
      [
        leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-04' }),
        leg({ direction: 'inter', mode: 'ground', from: 'NRT', to: 'KIX', depDate: '2026-12-08' }),
        leg({ direction: 'back', from: 'KIX', to: 'BKK', depDate: '2026-12-11' }),
      ],
      lookup,
    );

    expect(route.countries).toHaveLength(1);
    expect(route.countries[0]).toMatchObject({ code: 'JP', nights: 7, cities: 'โตเกียว · โอซาก้า' });
  });

  it('leaves the last stop open on a one-way ticket', () => {
    const route = buildRoute([leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-04' })], lookup);

    expect(route.roundTrip).toBe(false);
    expect(route.stops[0]?.open).toBe(true);
    expect(route.stops[0]?.nights).toBe(0);
  });

  it('sorts by date and ignores half-typed legs', () => {
    const route = buildRoute(
      [
        leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-10' }),
        leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-04' }),
        leg({ from: 'BKK', to: '', depDate: '2026-12-04' }),
        leg({ from: 'BKK', to: 'KIX' }),
      ],
      lookup,
    );

    expect(route.startDate).toBe('2026-12-04');
    expect(route.stops.map((s) => s.airport)).toEqual(['NRT']);
  });

  it('counts an overnight flight against the arrival date', () => {
    const route = buildRoute(
      [
        leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-03', depTime: '23:59', arrDate: '2026-12-04', arrTime: '08:05' }),
        leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-10' }),
      ],
      lookup,
    );

    expect(route.stops[0]).toMatchObject({ arriveDate: '2026-12-04', nights: 6 });
  });

  it('keeps an airport the index has never heard of', () => {
    const route = buildRoute(
      [
        leg({ from: 'BKK', to: 'ZZZ', depDate: '2026-12-04' }),
        leg({ direction: 'back', from: 'ZZZ', to: 'BKK', depDate: '2026-12-08' }),
      ],
      lookup,
    );

    expect(route.stops[0]).toMatchObject({ city: 'ZZZ', nights: 4 });
  });

  it('is empty for no legs', () => {
    const route = buildRoute([], lookup);
    expect(route.stops).toHaveLength(0);
    expect(route.days).toBe(0);
  });
});

describe('routeWarnings', () => {
  it('names the gap when the next leg leaves from somewhere else', () => {
    const legs = [
      leg({ from: 'BKK', to: 'ICN', depDate: '2026-12-04' }),
      leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-10' }),
    ];
    const warnings = routeWarnings(buildRoute(legs, lookup), legs);

    expect(warnings.some((w) => w.id === 'gap-ICN-NRT' && w.level === 'warn')).toBe(true);
  });

  it('says how many countries and how many nights each gets', () => {
    const legs = [
      leg({ from: 'BKK', to: 'ICN', depDate: '2026-12-04' }),
      leg({ direction: 'inter', from: 'ICN', to: 'NRT', depDate: '2026-12-07' }),
      leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-11' }),
    ];
    const warnings = routeWarnings(buildRoute(legs, lookup), legs);
    const multi = warnings.find((w) => w.id === 'multi-country');

    expect(multi?.text).toContain('2 ประเทศ');
    expect(multi?.text).toContain('เกาหลีใต้ 3 คืน');
  });

  it('flags a stop that gets one night', () => {
    const legs = [
      leg({ from: 'BKK', to: 'ICN', depDate: '2026-12-04' }),
      leg({ direction: 'inter', from: 'ICN', to: 'NRT', depDate: '2026-12-05' }),
      leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-11' }),
    ];
    const warnings = routeWarnings(buildRoute(legs, lookup), legs);

    expect(warnings.some((w) => w.id === 'short-ICN')).toBe(true);
  });

  it('says nothing about a clean return trip', () => {
    const legs = [
      leg({ from: 'BKK', to: 'NRT', depDate: '2026-12-04' }),
      leg({ direction: 'back', from: 'NRT', to: 'BKK', depDate: '2026-12-10' }),
    ];

    expect(routeWarnings(buildRoute(legs, lookup), legs)).toEqual([]);
  });
});

/**
 * The index itself. It is the same JSON the Go service embeds, so these are the
 * searches a Thai group actually types.
 */
describe('searchAirports', () => {
  it('puts the exact IATA code first', async () => {
    const found = await searchAirports('NRT', 5);
    expect(found[0]?.iata).toBe('NRT');
    expect(found[0]?.cityTh).toBe('โตเกียว');
    expect(found[0]?.countryTh).toBe('ญี่ปุ่น');
  });

  it('searches in Thai', async () => {
    const found = await searchAirports('โตเกียว', 5);
    expect(found.map((a) => a.iata)).toContain('HND');
  });

  it('reaches every continent, not only the ones we seeded', async () => {
    for (const [query, iata] of [
      ['queenstown', 'ZQN'],
      ['cape town', 'CPT'],
      ['lisbon', 'LIS'],
      ['reykjavik', 'RKV'],
    ] as const) {
      const found = await searchAirports(query, 8);
      expect(found.map((a) => a.iata)).toContain(iata);
    }
  });

  it('answers an empty query with the hubs', async () => {
    const found = await searchAirports('', 6);
    expect(found).toHaveLength(6);
    expect(found[0]?.iata).toBe('BKK');
  });
});
