import { daysBetween, thaiDate } from './domain';
import type { Airport, CountryStay, FlightLeg, FlightLegInput, RouteStop, TripRoute } from './types';

/**
 * The route a trip is built on (M1 — A1.3).
 *
 * Twin of `apps/api/pkg/domain/route.go`; the two must agree, because the entry
 * flow builds the route in the browser before the trip exists and the trip room
 * reads it back from the API afterwards.
 *
 * The reason this exists at all: a list of city names could not answer the
 * three questions that decide a plan. "โซล, อูเอโนะ" left all three open — is
 * that two countries, how many nights in each, and how do you get between them.
 * Legs answer all three. Each arrival opens a stop, the next departure closes
 * it, and the nights in between are what the planner has to fill.
 */

type Lookup = (iata: string) => Airport | null | undefined;

/** Accepts saved legs and legs still being typed. */
type AnyLeg = FlightLeg | FlightLegInput;

export function buildRoute(legs: AnyLeg[], lookup: Lookup): TripRoute {
  const ordered = sortLegs(legs);
  const empty: TripRoute = {
    flights: [],
    stops: [],
    countries: [],
    homeAirport: '',
    startDate: '',
    endDate: '',
    days: 0,
    nights: 0,
    roundTrip: false,
  };
  if (ordered.length === 0) return empty;

  const homeAirport = ordered[0]!.from.toUpperCase();
  const startDate = ordered[0]!.depDate;
  const endDate = arrivalDate(ordered[ordered.length - 1]!);

  const stops: RouteStop[] = [];
  let roundTrip = false;

  ordered.forEach((leg, i) => {
    const arr = leg.to.toUpperCase();

    // The last leg landing back where the trip started is the way home, not a
    // place anyone wakes up.
    if (i === ordered.length - 1 && arr === homeAirport) {
      roundTrip = true;
      return;
    }

    const airport = lookup(arr);
    const next = ordered[i + 1];

    stops.push({
      airport: arr,
      city: airport ? (airport.cityTh || airport.city) : arr,
      countryCode: airport?.countryCode ?? '',
      country: airport ? (airport.countryTh || airport.country) : '',
      arriveDate: arrivalDate(leg),
      arriveTime: leg.arrTime,
      departDate: next?.depDate,
      departTime: next?.depTime,
      nights: next ? nightsBetween(arrivalDate(leg), next.depDate) : 0,
      open: !next,
    });
  });

  const days = nightsBetween(startDate, endDate) + 1;

  return {
    flights: ordered.filter(isSaved),
    stops,
    countries: countryStays(stops),
    homeAirport,
    startDate,
    endDate,
    days,
    nights: Math.max(days - 1, 0),
    roundTrip,
  };
}

/** Destinations in visit order, without repeats — what the trip frame stores. */
export function routeCities(route: TripRoute) {
  return [...new Set(route.stops.map((s) => s.city).filter(Boolean))];
}

/* --------------------------------------------------------------- warnings -- */

export type RouteWarningLevel = 'info' | 'warn';

export interface RouteWarning {
  id: string;
  level: RouteWarningLevel;
  text: string;
}

/**
 * What the route builder says out loud while someone types.
 *
 * These are the answers to the questions the old city picker could not answer,
 * so they are deliberately concrete: which two countries, how many nights, and
 * which gap has no leg covering it.
 */
export function routeWarnings(route: TripRoute, legs: AnyLeg[]): RouteWarning[] {
  const out: RouteWarning[] = [];
  const ordered = sortLegs(legs);
  if (ordered.length === 0) return out;

  // A hole in the route: the group is somewhere the next leg does not leave
  // from, and nothing in the trip says how they got across.
  for (let i = 0; i + 1 < ordered.length; i += 1) {
    const landed = ordered[i]!.to.toUpperCase();
    const leaves = ordered[i + 1]!.from.toUpperCase();
    if (landed !== leaves) {
      out.push({
        id: `gap-${landed}-${leaves}`,
        level: 'warn',
        text: `ลง ${landed} แต่เที่ยวถัดไปออกจาก ${leaves} — เพิ่มขาระหว่างเมือง (บินหรือไปเอง) ให้ครบก่อน แพลนจะได้ไม่ขาดช่วง`,
      });
    }
  }

  if (route.countries.length > 1) {
    const line = route.countries.map((c) => `${c.name} ${c.nights} คืน`).join(' · ');
    out.push({
      id: 'multi-country',
      level: 'info',
      text: `ทริปนี้ข้าม ${route.countries.length} ประเทศ: ${line} — ROVE จะแยกแพลนเป็นช่วงตามประเทศให้`,
    });
  }

  // A country reached by air and left the next morning. Legal, usually a
  // mistake, and always worth saying before the plan is drafted.
  for (const stop of route.stops) {
    if (!stop.open && stop.nights <= 1) {
      out.push({
        id: `short-${stop.airport}`,
        level: 'warn',
        text: `${stop.city} ได้แค่ ${stop.nights} คืน — เผื่อวันเพิ่มหรือตัดเมืองนี้ออกดีกว่าไหม`,
      });
    }
  }

  const last = route.stops[route.stops.length - 1];
  if (last?.open) {
    out.push({
      id: 'one-way',
      level: 'info',
      text: `ยังไม่มีขากลับจาก ${last.city} — ใส่ทีหลังได้ แพลนจะจบที่วันที่ใส่ล่าสุดไปก่อน`,
    });
  }

  return out;
}

/* ---------------------------------------------------------------- labels -- */

/** "โตเกียว 6 คืน · โซล 3 คืน" */
export function stayLabel(route: TripRoute) {
  return route.stops.map((s) => `${s.city} ${s.nights} คืน`).join(' · ');
}

/** "4 ธ.ค. ถึง 08:05" — how a leg reads on a card. */
export function legLabel(leg: AnyLeg) {
  const date = thaiDate(arrivalDate(leg));
  return leg.arrTime ? `${date} ถึง ${leg.arrTime} น.` : date;
}

/* ----------------------------------------------------------------- utils -- */

function isSaved(leg: AnyLeg): leg is FlightLeg {
  return typeof (leg as FlightLeg).id === 'string' && (leg as FlightLeg).id !== '';
}

/** Chronological, and without the half-typed legs the builder always has. */
function sortLegs(legs: AnyLeg[]): AnyLeg[] {
  return legs
    .filter((leg) => leg.from && leg.to && leg.depDate)
    .slice()
    .sort((a, b) => a.depDate.localeCompare(b.depDate) || (a.depTime ?? '').localeCompare(b.depTime ?? ''));
}

/** A red-eye is the exception: same-day arrival unless the leg says otherwise. */
function arrivalDate(leg: AnyLeg) {
  return leg.arrDate || leg.depDate;
}

/** daysBetween counts both ends; nights is the gap between them. */
function nightsBetween(from: string, to: string) {
  if (!from || !to) return 0;
  return Math.max(daysBetween(from, to) - 1, 0);
}

function countryStays(stops: RouteStop[]): CountryStay[] {
  const order: string[] = [];
  const byCode = new Map<string, CountryStay>();

  for (const stop of stops) {
    const code = stop.countryCode || stop.airport;
    let stay = byCode.get(code);
    if (!stay) {
      stay = { code, name: stop.country || code, cities: '', nights: 0 };
      byCode.set(code, stay);
      order.push(code);
    }
    stay.nights += stop.nights;
    if (!stay.cities) stay.cities = stop.city;
    else if (!stay.cities.includes(stop.city)) stay.cities += ` · ${stop.city}`;
  }

  return order.map((code) => byCode.get(code)!);
}
