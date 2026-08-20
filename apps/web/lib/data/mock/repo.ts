import { getCharacter, CHARACTERS } from '@/lib/mock/characters';
import { DAYS } from '@/lib/mock/trip';
import { PAST_TRIP_ARCHIVES, POINTS_PER_PUBLISH } from '@/lib/mock/user';

import { getAirport, getAirports, searchAirports } from '../airports';
import { buildRoute, routeCities } from '../route';

import {
  addDays,
  budgetFromPlan,
  computeBudget,
  computeCoverage,
  computeExpenses,
  computeWindows,
  daysBetween,
  membersFreeInRange,
  parseIsoDate,
  recomputeCoverage,
  thaiRangeLabel,
  toIsoDate,
  toThb,
  validateDays,
} from '../domain';
import type { RoveRepo } from '../repo';
import type {
  ActivityEvent,
  AiJob,
  AvailabilityBoard,
  BookingEntry,
  Comment,
  CurrentUser,
  DreamItem,
  ExpenseEntry,
  ExportResult,
  FlightLeg,
  FlightLegInput,
  ParsedTicket,
  PastTrip,
  PlanDay,
  PlanItem,
  PrepTask,
  RecapDecision,
  ShareState,
  Trip,
  TripRecap,
  TripRoute,
  TripSummary,
  Vote,
  WishlistItem,
} from '../types';
import { BOOKING_OFFERS, POIS, PREP_TEMPLATE, rankDestinations } from './catalog';
import {
  AI_META,
  loadDb,
  mockId,
  mutate,
  nowIso,
  tripRecord,
  type MockDb,
  type TripRecord,
} from './db';

/**
 * The mock repository — a working backend that happens to live in the browser.
 *
 * Rules it holds itself to:
 *  - every write really is written (localStorage), so a UAT tester can reload
 *    and find their edit still there;
 *  - everything computed is computed by the same domain functions live mode
 *    uses, never hard-coded;
 *  - the steps that need a third party are *simulated*, and every simulated
 *    result says so in its payload so the UI can label it.
 */

const LATENCY = 140;

function delay<T>(value: T, ms = LATENCY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function log(record: TripRecord, memberId: string, text: string) {
  const event: ActivityEvent = { id: mockId('act'), memberId, text, createdAt: nowIso() };
  record.activity.unshift(event);
  record.activity = record.activity.slice(0, 40);
}

function meId() {
  return loadDb().user.id;
}

function daysUntil(startDate: string) {
  if (!startDate) return 0;
  const diff = parseIsoDate(startDate).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86_400_000);
}

/* -------------------------------------------------------------- ai engine -- */

const runningJobs = new Map<string, AiJob>();
const jobTimers = new Map<string, ReturnType<typeof setInterval>>();
const jobListeners = new Map<string, Set<(job: AiJob) => void>>();

const AI_STEPS = [
  'อ่านที่อยากไปของทุกคน',
  'จับกลุ่มสถานที่ตามโซน',
  'เช็กเวลาเปิด-ปิดและเวลาเดินทาง',
  'จัดวันและมื้ออาหาร',
  'ตรวจงบให้อยู่ในกรอบ',
];

/** Re-dates the seeded itinerary onto whatever window this trip has locked. */
function draftFor(record: TripRecord): PlanDay[] {
  const start = record.trip.startDate || record.locked?.startDate;
  const length = record.locked?.days ?? record.trip.nights + 1;
  const source = clone(DAYS).slice(0, Math.max(1, length));

  return source.map((day, index) => ({
    ...day,
    index: index + 1,
    date: start ? addDays(start, index) : day.date,
    label: `วันที่ ${index + 1}`,
    items: day.items.map((item) => ({ ...item, id: mockId('it') })),
  }));
}

function emit(job: AiJob) {
  runningJobs.set(job.id, job);
  for (const listener of jobListeners.get(job.id) ?? []) listener(clone(job));
}

function startJob(record: TripRecord, job: AiJob) {
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    const current = runningJobs.get(job.id);
    if (!current) return;

    if (tick >= AI_STEPS.length + 1) {
      clearInterval(timer);
      jobTimers.delete(job.id);
      emit({
        ...current,
        status: 'done',
        progress: 1,
        step: 'เสร็จแล้ว',
        finishedAt: nowIso(),
        result: {
          days: draftFor(record),
          rationales: AI_META.rationales,
          openQuestions: AI_META.openQuestions,
        },
      });
      return;
    }

    emit({
      ...current,
      status: 'running',
      progress: tick / (AI_STEPS.length + 1),
      step: AI_STEPS[Math.min(tick - 1, AI_STEPS.length - 1)]!,
    });
  }, 900);

  jobTimers.set(job.id, timer);
}

/* ----------------------------------------------------------------- route -- */

/**
 * Rebuilds the route of a trip from its legs (M1 — A1.3).
 *
 * The airport index is loaded lazily, so this is async where the rest of the
 * mock repo is not — worth it: a 320 kB dataset has no business in the bundle
 * of someone who never opens the picker.
 */
async function routeOf(record: TripRecord): Promise<TripRoute> {
  const found = await getAirports(record.flights.flatMap((leg) => [leg.from, leg.to]));
  return buildRoute(record.flights, (iata) => found[iata] ?? null);
}

/**
 * Pushes what the legs imply back onto the frame: the dates the tickets already
 * decided, and the destinations in visit order. Dates that come from a ticket
 * are locked dates — there is nothing left to coordinate once a seat is paid
 * for (M2.5).
 */
function applyRoute(record: TripRecord, route: TripRoute, memberId: string) {
  if (route.flights.length === 0 && route.stops.length === 0) return;

  const cities = routeCities(route);
  record.trip = {
    ...record.trip,
    startDate: route.startDate || record.trip.startDate,
    endDate: route.endDate || record.trip.endDate,
    nights: route.nights,
    cities: cities.length > 0 ? cities : record.trip.cities,
  };

  if (route.startDate && route.endDate) {
    record.locked = {
      startDate: route.startDate,
      endDate: route.endDate,
      days: route.days,
      lockedBy: memberId,
      lockedAt: nowIso(),
      memberIds: record.members.map((m) => m.id),
    };
  }
}

function withIds(legs: FlightLegInput[]): FlightLeg[] {
  return legs.map((leg) => ({
    ...leg,
    id: mockId('fl'),
    from: leg.from.toUpperCase(),
    to: leg.to.toUpperCase(),
  }));
}

/* ------------------------------------------------------------------ repo -- */

export const mockRepo: RoveRepo = {
  /* ------------------------------------------------------------- auth -- */
  auth: {
    async me() {
      return delay(clone(loadDb().user));
    },
    async startLogin(provider) {
      // No OAuth round trip in mock mode: the seeded user is simply signed in.
      const user = mutate((db) => {
        db.user = { ...db.user, email: `${provider}@rove.app` };
        return clone(db.user);
      });
      return delay({ redirectUrl: null, user });
    },
    async logout() {
      return delay(undefined, 80);
    },
    async updateMe(patch) {
      const user = mutate((db) => {
        db.user = { ...db.user, ...patch } as CurrentUser;
        return clone(db.user);
      });
      return delay(user);
    },
  },

  /* ---------------------------------------------------------- airports -- */
  // Not simulated: this is the same worldwide index the API embeds, searched
  // in the browser instead of over HTTP.
  airports: {
    async search(query, limit) {
      return delay(await searchAirports(query, limit), 90);
    },
    async get(iata) {
      return getAirport(iata);
    },
    async resolve(codes) {
      return getAirports(codes);
    },
  },

  /* ------------------------------------------------------------- trips -- */
  trips: {
    async list() {
      const db = loadDb();
      const out: TripSummary[] = db.trips.map((record) => ({
        ...clone(record.trip),
        role: record.role,
        memberIds: record.members.map((m) => m.id),
        characterIds: record.members.map((m) => m.characterId),
        daysUntil: daysUntil(record.trip.startDate),
      }));
      return delay(out);
    },

    async get(tripId) {
      const record = mutate((db) => clone(tripRecord(db, tripId)));
      const trip = { ...record.trip, route: await routeOf(record) };
      return delay(trip);
    },

    async overview(tripId) {
      const route = await routeOf(mutate((db) => clone(tripRecord(db, tripId))));
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const coverage = computeCoverage(record.wishlist);
          const planItems = record.days.reduce((sum, d) => sum + d.items.length, 0);
          const withoutWishlist = record.members.filter((m) => !m.hasWishlist).length;

          const checklist = [
            { key: 'room', label: 'สร้างห้องทริป', done: true },
            {
              key: 'invite',
              label: 'ชวนเพื่อนเข้าห้อง',
              done: record.members.length > 1,
              hint: `${record.members.length} คนแล้ว`,
            },
            {
              key: 'dates',
              label: 'ล็อควันเดินทาง',
              done: Boolean(record.locked),
              hint: record.locked
                ? thaiRangeLabel(record.locked.startDate, record.locked.endDate)
                : 'ยังไม่ได้เลือกวัน',
            },
            {
              key: 'wishlist',
              label: 'ทุกคนใส่ที่อยากไป',
              done: withoutWishlist === 0,
              hint: withoutWishlist > 0 ? `เหลืออีก ${withoutWishlist} คน` : undefined,
            },
            {
              key: 'plan',
              label: 'ให้ AI ร่างแพลน',
              done: record.days.length > 0,
              hint: record.days.length > 0 ? `ร่างแล้ว ${record.days.length} วัน` : undefined,
            },
          ];

          return {
            trip: { ...clone(record.trip), route },
            members: clone(record.members),
            coverage,
            checklist,
            activity: clone(record.activity).slice(0, 8),
            counts: {
              wishlistItems: record.wishlist.length,
              planDays: record.days.length,
              planItems,
              membersWithoutWishlist: withoutWishlist,
              bookings: record.bookings.filter((b) => b.status === 'booked').length,
              openPrep: record.prep.filter((p) => !p.done).length,
            },
            locked: clone(record.locked),
          };
        }),
      );
    },

    async create(input) {
      // The route decides the frame, so it is resolved before the record is
      // written — a trip is never stored with dates its tickets disagree with.
      const legs = withIds(input.flights ?? []);
      const found = await getAirports(legs.flatMap((leg) => [leg.from, leg.to]));
      const route = buildRoute(legs, (iata) => found[iata] ?? null);

      const trip = mutate((db) => {
        const id = mockId('trip');
        const start = route.startDate || (input.startDate ?? '');
        const end = route.endDate || (input.endDate ?? '');
        const cities = routeCities(route);
        const record: TripRecord = {
          trip: {
            id,
            title: input.title,
            cities: cities.length > 0 ? cities : (input.cities ?? []),
            startDate: start,
            endDate: end,
            nights: start && end ? Math.max(0, daysBetween(start, end) - 1) : 0,
            partySize: input.partySize ?? 1,
            status: 'planning',
            cover: '/brand/covers/cover-japan.webp',
            homeCurrency: 'THB',
            destCurrency: 'JPY',
            fxRate: 0.235,
            fxAsOf: toIsoDate(new Date()),
            budgetPerPersonThb: input.budgetPerPersonThb ?? 40_000,
          },
          role: 'owner',
          members: [
            {
              id: db.user.id,
              name: db.user.name,
              role: 'owner',
              characterId: db.user.characterId,
              hasWishlist: false,
            },
          ],
          availability: [],
          submittedMemberIds: [],
          months: nextMonths(start || toIsoDate(new Date()), 6),
          locked:
            start && end
              ? {
                  startDate: start,
                  endDate: end,
                  days: daysBetween(start, end),
                  lockedBy: db.user.id,
                  lockedAt: nowIso(),
                  memberIds: [db.user.id],
                }
              : null,
          destinationId: null,
          flights: legs,
          wishlist: [],
          days: [],
          budgetLines: [],
          itemsWithoutCost: 0,
          expenses: [],
          settled: [],
          prep: [],
          prepNote: '',
          versions: [],
          bookings: [],
          comments: [],
          votes: [],
          activity: [],
          ai: { used: 0, included: 2, extra: 0 },
          share: {
            visibility: 'private',
            shareToken: null,
            shareUrl: null,
            publicSlug: null,
            viewCount: 0,
            cloneCount: 0,
          },
        };
        log(record, db.user.id, 'สร้างห้องทริป');
        db.trips.unshift(record);
        return clone(record.trip);
      });
      return delay({ ...trip, route }, 320);
    },

    async update(tripId, patch) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.trip = { ...record.trip, ...patch } as Trip;
          if (patch.startDate && patch.endDate) {
            record.trip.nights = Math.max(0, daysBetween(patch.startDate, patch.endDate) - 1);
          }
          log(record, db.user.id, 'แก้กรอบทริป');
          return clone(record.trip);
        }),
      );
    },

    async remove(tripId) {
      mutate((db) => {
        db.trips = db.trips.filter((t) => t.trip.id !== tripId);
      });
      return delay(undefined);
    },

    async clone(tripId) {
      return delay(
        mutate((db) => {
          const source = tripRecord(db, tripId);
          const copy = clone(source);
          copy.trip = { ...copy.trip, id: mockId('trip'), title: `${copy.trip.title} (คัดลอก)` };
          copy.expenses = [];
          copy.comments = [];
          copy.activity = [];
          copy.share = { ...copy.share, shareToken: null, shareUrl: null, visibility: 'private' };
          source.share.cloneCount += 1;
          log(copy, db.user.id, `คัดลอกทริปจาก "${source.trip.title}"`);
          db.trips.unshift(copy);
          return clone(copy.trip);
        }),
        320,
      );
    },

    /**
     * No model call in mock mode: the paste is read with a regex that handles
     * the shape airline confirmations actually use — a route line with two
     * airport codes and a date. Enough for UAT to reach a real trip frame.
     */
    async parseTicket(text) {
      const MONTHS: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
      };
      const flights: ParsedTicket['flights'] = [];
      // carrier + number … origin … destination … "15 Nov 2026"
      const line = new RegExp(
        String.raw`([A-Z]{2})\s?(\d{2,4})\s+\b([A-Z]{3})\b\s*(\d{2}:\d{2})?[^A-Za-z0-9]*(?:→|->|to)?\s*\b([A-Z]{3})\b[^\n]*?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})`,
        'g',
      );

      for (const match of text.matchAll(line)) {
        const [, carrier, number, from, time, to, day, monthName, year] = match;
        const month = MONTHS[(monthName ?? '').slice(0, 3).toLowerCase()];
        if (!month) continue;
        flights.push({
          code: `${carrier}${number}`,
          from: from!,
          to: to!,
          date: `${year}-${String(month).padStart(2, '0')}-${day!.padStart(2, '0')}`,
          time,
          direction: flights.length === 0 ? 'out' : 'back',
        });
      }

      const dates = flights.map((f) => f.date).sort();
      const party = Number(/(?:passengers?|ผู้โดยสาร)\D*(\d+)/i.exec(text)?.[1] ?? '');

      // Destinations come from the worldwide index, so a ticket to anywhere
      // resolves — not only to the dozen cities this used to know by heart.
      const found = await getAirports(flights.map((f) => f.to));
      const home = flights[0]?.from.toUpperCase();
      const cities = [
        ...new Set(
          flights
            .filter((f) => f.to.toUpperCase() !== home)
            .map((f) => found[f.to.toUpperCase()])
            .filter(Boolean)
            .map((airport) => airport!.cityTh || airport!.city),
        ),
      ];

      return delay(
        {
          flights,
          startDate: dates[0] ?? null,
          endDate: dates[dates.length - 1] ?? null,
          partySize: Number.isFinite(party) && party > 0 ? party : null,
          cities,
          simulated: true,
        } satisfies ParsedTicket,
        480,
      );
    },

    async route(tripId) {
      const record = mutate((db) => clone(tripRecord(db, tripId)));
      return delay(await routeOf(record), 90);
    },

    /**
     * Replacing the route re-derives the frame: new legs, new dates, new
     * destinations, all in one write so the room never shows half of a change.
     */
    async setRoute(tripId, legs) {
      const withRouteIds = withIds(legs);
      const found = await getAirports(withRouteIds.flatMap((leg) => [leg.from, leg.to]));
      const route = buildRoute(withRouteIds, (iata) => found[iata] ?? null);

      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.flights = withRouteIds;
        applyRoute(record, route, db.user.id);
        log(record, db.user.id, 'แก้เส้นทางบิน');
      });

      return delay(route, 200);
    },

    async upcoming() {
      const db = loadDb();
      return delay(clone(db.upcoming).map((trip) => ({ ...trip, characterIds: facesOf(db, trip) })));
    },
    async past() {
      const db = loadDb();
      return delay(
        clone(db.past)
          .map((trip) => ({ ...trip, characterIds: facesOf(db, trip) }))
          .sort((a, b) => b.endDate.localeCompare(a.endDate)),
      );
    },

    async recap(tripId) {
      const db = loadDb();
      // A finished trip may be an archived card with no room left (the seeded
      // ones) or a room that simply ended. Both answer the same question, so
      // both produce the same shape.
      const archived = db.past.find((t) => t.id === tripId);
      if (archived) return delay(recapOfArchive(db, archived));
      return delay(mutate((current) => recapOfRecord(tripRecord(current, tripId))));
    },
    async stats() {
      return delay(clone(loadDb().stats));
    },
  },

  /* ----------------------------------------------------------- members -- */
  members: {
    async list(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).members)));
    },

    async invite(tripId, role) {
      const token = mockId('inv');
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      return delay({
        token,
        url: `${typeof window === 'undefined' ? '' : window.location.origin}/invite/${token}?trip=${tripId}&role=${role}`,
        expiresAt: expires.toISOString(),
        role,
      });
    },

    async join(token) {
      // Mock mode has nobody to authenticate, so joining adds a new seat to the
      // trip the token points at (falling back to the demo trip).
      const tripId = mutate((db) => {
        const record = db.trips[0]!;
        const seat = record.members.length + 1;
        const character = CHARACTERS[seat % CHARACTERS.length]!;
        record.members.push({
          id: `m${seat}`,
          name: `เพื่อนใหม่ ${seat}`,
          role: 'editor',
          characterId: character.id,
          hasWishlist: false,
        });
        record.trip.partySize = record.members.length;
        log(record, db.user.id, `มีคนเข้าห้องผ่านลิงก์เชิญ (${token.slice(0, 8)})`);
        return record.trip.id;
      });
      return delay({ tripId }, 260);
    },

    async updateRole(tripId, memberId, role) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const member = record.members.find((m) => m.id === memberId)!;
          member.role = role;
          log(record, db.user.id, `เปลี่ยนสิทธิ์ของ ${member.name} เป็น ${role}`);
          return clone(member);
        }),
      );
    },

    async remove(tripId, memberId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.members = record.members.filter((m) => m.id !== memberId);
        record.trip.partySize = record.members.length;
      });
      return delay(undefined);
    },
  },

  /* ------------------------------------------------------------- dates -- */
  dates: {
    async board(tripId, month) {
      return delay(mutate((db) => boardOf(tripRecord(db, tripId), month)));
    },

    async setAvailability(tripId, memberId, dates, mark) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const wanted = new Set(dates);
          record.availability = record.availability.filter(
            (e) => !(e.memberId === memberId && wanted.has(e.date)),
          );
          if (mark) {
            for (const date of dates) record.availability.push({ memberId, date, mark });
          }
          return boardOf(record, monthOf(dates[0] ?? ''));
        }),
        90,
      );
    },

    async submit(tripId, memberId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          if (!record.submittedMemberIds.includes(memberId)) {
            record.submittedMemberIds.push(memberId);
          }
          const member = record.members.find((m) => m.id === memberId);
          log(record, memberId, `${member?.name ?? 'สมาชิก'} ใส่วันว่างเรียบร้อย`);
          return boardOf(record);
        }),
      );
    },

    async windows(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          return computeWindows(record.availability, record.members);
        }),
      );
    },

    async lock(tripId, startDate, endDate) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const { free } = membersFreeInRange(record.availability, record.members, startDate, endDate);
          const locked = {
            startDate,
            endDate,
            days: daysBetween(startDate, endDate),
            lockedBy: db.user.id,
            lockedAt: nowIso(),
            memberIds: free.map((m) => m.id),
          };
          record.locked = locked;
          record.trip.startDate = startDate;
          record.trip.endDate = endDate;
          record.trip.nights = locked.days - 1;
          log(record, db.user.id, `ล็อควัน ${thaiRangeLabel(startDate, endDate)}`);
          return clone(locked);
        }),
        260,
      );
    },

    async unlock(tripId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.locked = null;
        record.trip.startDate = '';
        record.trip.endDate = '';
        record.trip.nights = 0;
        log(record, db.user.id, 'ปลดล็อควันเพื่อเลือกใหม่');
      });
      return delay(undefined);
    },

    async destinations(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const days = record.locked?.days ?? Math.max(1, record.trip.nights + 1);
          const start = record.locked?.startDate ?? record.trip.startDate ?? toIsoDate(new Date());
          return rankDestinations(
            days,
            parseIsoDate(start).getMonth() + 1,
            record.trip.budgetPerPersonThb,
          );
        }),
        220,
      );
    },

    async chooseDestination(tripId, destinationId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const days = record.locked?.days ?? record.trip.nights + 1;
          const start = record.locked?.startDate ?? record.trip.startDate ?? toIsoDate(new Date());
          const pick = rankDestinations(
            days,
            parseIsoDate(start).getMonth() + 1,
            record.trip.budgetPerPersonThb,
          ).find((d) => d.id === destinationId);
          if (pick) {
            record.destinationId = pick.id;
            record.trip.cities = pick.cities;
            record.trip.title =
              record.trip.title.includes(pick.name) ? record.trip.title : `${pick.name} ${parseIsoDate(start).getFullYear() + 543}`;
            log(record, db.user.id, `เลือกปลายทาง ${pick.name}`);
          }
          return clone(record.trip);
        }),
        240,
      );
    },
  },

  /* ---------------------------------------------------------- wishlist -- */
  wishlist: {
    async list(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).wishlist)));
    },

    async coverage(tripId) {
      return delay(mutate((db) => computeCoverage(tripRecord(db, tripId).wishlist)));
    },

    async add(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const item: WishlistItem = { ...input, id: mockId('w'), coverage: 'uncovered' };
          record.wishlist.push(item);
          const member = record.members.find((m) => m.id === input.memberId);
          if (member) member.hasWishlist = true;
          log(record, input.memberId, `เพิ่ม "${item.title}" ลงที่อยากไป`);
          return clone(item);
        }),
      );
    },

    async update(tripId, wishId, patch) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const index = record.wishlist.findIndex((w) => w.id === wishId);
          record.wishlist[index] = { ...record.wishlist[index]!, ...patch };
          return clone(record.wishlist[index]!);
        }),
      );
    },

    async remove(tripId, wishId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.wishlist = record.wishlist.filter((w) => w.id !== wishId);
      });
      return delay(undefined);
    },
  },

  /* -------------------------------------------------------------- plan -- */
  plan: {
    async days(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).days)));
    },

    async addItem(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const { dayId, index, ...rest } = input;
          const day = record.days.find((d) => d.id === dayId) ?? record.days[0];
          if (!day) throw new Error('ยังไม่มีวันในแพลนนี้');
          const item: PlanItem = { ...rest, id: mockId('it') };
          day.items.splice(index ?? day.items.length, 0, item);
          record.days = validateDays(record.days);
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          log(record, db.user.id, `เพิ่ม "${item.title}" ลงแพลน`);
          return clone(item);
        }),
      );
    },

    async updateItem(tripId, itemId, patch) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          snapshot(record, db.user.id, itemId, 'update');
          let updated: PlanItem | null = null;
          for (const day of record.days) {
            const index = day.items.findIndex((i) => i.id === itemId);
            if (index >= 0) {
              day.items[index] = { ...day.items[index]!, ...patch };
              updated = day.items[index]!;
            }
          }
          record.days = validateDays(record.days);
          return clone(updated!);
        }),
        90,
      );
    },

    async moveItem(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          snapshot(record, db.user.id, input.itemId, 'move');
          let moved: PlanItem | null = null;
          for (const day of record.days) {
            const index = day.items.findIndex((i) => i.id === input.itemId);
            if (index >= 0) moved = day.items.splice(index, 1)[0]!;
          }
          const target = record.days.find((d) => d.id === input.toDayId);
          if (moved && target) {
            target.items.splice(Math.min(input.toIndex, target.items.length), 0, moved);
            log(record, db.user.id, `ย้าย "${moved.title}" ไป${target.label}`);
          }
          record.days = validateDays(record.days);
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          return clone(record.days);
        }),
        90,
      );
    },

    async removeItem(tripId, itemId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        snapshot(record, db.user.id, itemId, 'delete');
        for (const day of record.days) {
          day.items = day.items.filter((i) => i.id !== itemId);
        }
        record.days = validateDays(record.days);
        record.wishlist = recomputeCoverage(record.wishlist, record.days);
      });
      return delay(undefined);
    },

    async undo(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const version = record.versions.pop();
          if (!version) throw new Error('ไม่มีอะไรให้ย้อนกลับ');

          for (const day of record.days) {
            day.items = day.items.filter((i) => i.id !== version.itemId);
          }

          const target = record.days.find((d) => d.id === version.dayId) ?? record.days[0];
          if (target) {
            target.items.splice(Math.min(version.index, target.items.length), 0, version.item);
          }

          record.days = validateDays(record.days);
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          log(record, db.user.id, `ย้อนกลับ "${version.item.title}"`);
          return clone(record.days);
        }),
        200,
      );
    },

    async versions(tripId) {
      return delay(
        mutate((db) =>
          [...tripRecord(db, tripId).versions]
            .reverse()
            .map((v) => ({
              id: v.id,
              itemId: v.itemId,
              action: v.action,
              actorId: v.actorId,
              createdAt: v.createdAt,
              title: v.item.title,
            })),
        ),
      );
    },

    async revalidate(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.days = validateDays(record.days);
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          return clone(record.days);
        }),
        280,
      );
    },
  },

  /* ------------------------------------------------------------ budget -- */
  budget: {
    async summary(tripId) {
      return delay(mutate((db) => budgetOf(tripRecord(db, tripId))));
    },

    async setBudget(tripId, perPersonThb) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.trip.budgetPerPersonThb = perPersonThb;
          log(record, db.user.id, `ตั้งงบไว้ที่ ${perPersonThb.toLocaleString('th-TH')} บาท/คน`);
          return budgetOf(record);
        }),
      );
    },

    async refreshFx(tripId) {
      // No FX provider in mock mode: nudge the rate a little so the "อัปเดตแล้ว"
      // state is visibly different from the old one.
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const drift = (Math.round(Math.random() * 6) - 3) / 1000;
          record.trip.fxRate = Number((record.trip.fxRate + drift).toFixed(3));
          record.trip.fxAsOf = toIsoDate(new Date());
          return budgetOf(record);
        }),
        400,
      );
    },
  },

  /* ----------------------------------------------------------- expense -- */
  expense: {
    async summary(tripId) {
      return delay(mutate((db) => expensesOf(tripRecord(db, tripId))));
    },

    async add(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const entry: ExpenseEntry = { ...input, id: mockId('e') };
          record.expenses.unshift(entry);
          log(record, entry.paidBy, `จ่าย "${entry.title}"`);
          return clone(entry);
        }),
      );
    },

    async update(tripId, expenseId, patch) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const index = record.expenses.findIndex((e) => e.id === expenseId);
          record.expenses[index] = { ...record.expenses[index]!, ...patch };
          return clone(record.expenses[index]!);
        }),
      );
    },

    async remove(tripId, expenseId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.expenses = record.expenses.filter((e) => e.id !== expenseId);
      });
      return delay(undefined);
    },

    async settle(tripId, fromMemberId, toMemberId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.settled.push({ fromMemberId, toMemberId, at: nowIso() });
          const from = record.members.find((m) => m.id === fromMemberId);
          const to = record.members.find((m) => m.id === toMemberId);
          log(record, fromMemberId, `${from?.name} จ่ายคืน ${to?.name} แล้ว`);
          return expensesOf(record);
        }),
      );
    },
  },

  /* -------------------------------------------------------------- prep -- */
  prep: {
    async list(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).prep)));
    },

    async add(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const task: PrepTask = { ...input, id: mockId('p'), done: false };
          record.prep.push(task);
          return clone(task);
        }),
      );
    },

    async toggle(tripId, taskId, done) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const task = record.prep.find((p) => p.id === taskId)!;
          task.done = done;
          return clone(task);
        }),
        70,
      );
    },

    async update(tripId, taskId, patch) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const index = record.prep.findIndex((p) => p.id === taskId);
          record.prep[index] = { ...record.prep[index]!, ...patch };
          return clone(record.prep[index]!);
        }),
      );
    },

    async remove(tripId, taskId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.prep = record.prep.filter((p) => p.id !== taskId);
      });
      return delay(undefined);
    },

    async note(tripId) {
      return delay(mutate((db) => tripRecord(db, tripId).prepNote));
    },

    async saveNote(tripId, body) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.prepNote = body;
          return record.prepNote;
        }),
      );
    },

    async applyTemplate(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const existing = new Set(record.prep.map((p) => p.title));
          for (const template of PREP_TEMPLATE) {
            if (existing.has(template.title)) continue;
            record.prep.push({ ...template, id: mockId('p'), done: false });
          }
          log(record, db.user.id, 'ดึงเช็กลิสต์เตรียมตัวสำหรับญี่ปุ่นมาใช้');
          return clone(record.prep);
        }),
        260,
      );
    },
  },

  /* ----------------------------------------------------------- booking -- */
  booking: {
    async list(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).bookings)));
    },

    async offers(_tripId, kind) {
      const offers: BookingEntry[] = BOOKING_OFFERS.filter((o) => o.kind === kind).map((o) => ({
        ...o,
        id: `offer_${o.partner}_${o.title}`.replace(/\s+/g, '_'),
        status: 'idea',
      }));
      return delay(offers, 200);
    },

    async save(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const entry: BookingEntry = { ...input, id: mockId('bk') };
          record.bookings.push(entry);
          log(record, db.user.id, `บันทึกการจอง "${entry.title}"`);
          return clone(entry);
        }),
      );
    },

    async setStatus(tripId, bookingId, status) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const entry = record.bookings.find((b) => b.id === bookingId)!;
          entry.status = status;
          if (status === 'booked') entry.bookedBy = db.user.id;
          return clone(entry);
        }),
      );
    },

    async remove(tripId, bookingId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.bookings = record.bookings.filter((b) => b.id !== bookingId);
      });
      return delay(undefined);
    },
  },

  /* ------------------------------------------------------------ collab -- */
  collab: {
    async comments(tripId, targetType, targetId) {
      return delay(
        mutate((db) =>
          clone(
            tripRecord(db, tripId).comments.filter(
              (c) => c.targetType === targetType && c.targetId === targetId,
            ),
          ),
        ),
      );
    },

    async addComment(tripId, targetType, targetId, body) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const comment: Comment = {
            id: mockId('c'),
            targetType,
            targetId,
            memberId: db.user.id,
            body,
            createdAt: nowIso(),
            resolved: false,
          };
          record.comments.push(comment);
          log(record, db.user.id, 'คอมเมนต์ในแพลน');
          return clone(comment);
        }),
        120,
      );
    },

    async resolveComment(tripId, commentId, resolved) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const comment = record.comments.find((c) => c.id === commentId)!;
          comment.resolved = resolved;
          return clone(comment);
        }),
      );
    },

    async votes(tripId, targetType, targetId) {
      return delay(
        mutate((db) =>
          clone(
            tripRecord(db, tripId).votes.filter(
              (v) => v.targetType === targetType && v.targetId === targetId,
            ),
          ),
        ),
      );
    },

    async vote(tripId, targetType, targetId, value) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const memberId = db.user.id;
          record.votes = record.votes.filter(
            (v) => !(v.targetType === targetType && v.targetId === targetId && v.memberId === memberId),
          );
          const vote: Vote = { targetType, targetId, memberId, value };
          record.votes.push(vote);
          return clone(
            record.votes.filter((v) => v.targetType === targetType && v.targetId === targetId),
          );
        }),
        80,
      );
    },

    async activity(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).activity)));
    },
  },

  /* ---------------------------------------------------------------- ai -- */
  ai: {
    async credits(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          return {
            used: record.ai.used,
            included: record.ai.included,
            extra: record.ai.extra,
            pricePerDraftThb: AI_META.pricePerDraftThb,
            payChannels: AI_META.payChannels,
          };
        }),
      );
    },

    async generate(tripId, input) {
      const job = mutate((db) => {
        const record = tripRecord(db, tripId);
        const quota = record.ai.included + record.ai.extra;
        if (record.ai.used >= quota) {
          throw new Error('ใช้ครบโควตาร่างแล้ว — ซื้อเพิ่มก่อนถึงจะร่างใหม่ได้');
        }
        record.ai.used += 1;
        log(record, db.user.id, input.kind === 'draft' ? 'ให้ AI ร่างแพลน' : 'ให้ AI ปรับแพลน');

        const created: AiJob = {
          id: mockId('job'),
          tripId,
          kind: input.kind,
          status: 'queued',
          progress: 0,
          step: 'เข้าคิว',
          createdAt: nowIso(),
        };
        runningJobs.set(created.id, created);
        // The record is captured for the draft; the timer starts outside mutate
        // so persistence has already happened when the first tick fires.
        queueMicrotask(() => startJob(record, created));
        return clone(created);
      });
      return delay(job, 200);
    },

    async job(_tripId, jobId) {
      const job = runningJobs.get(jobId);
      if (!job) throw new Error('ไม่พบงานนี้');
      return delay(clone(job), 60);
    },

    subscribe(_tripId, jobId, onUpdate) {
      const set = jobListeners.get(jobId) ?? new Set();
      set.add(onUpdate);
      jobListeners.set(jobId, set);
      const current = runningJobs.get(jobId);
      if (current) queueMicrotask(() => onUpdate(clone(current)));

      return () => {
        set.delete(onUpdate);
        if (set.size === 0) jobListeners.delete(jobId);
      };
    },

    async apply(tripId, jobId) {
      const job = runningJobs.get(jobId);
      if (!job?.result) throw new Error('ร่างยังไม่เสร็จ');

      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.days = validateDays(job.result!.days);
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          record.budgetLines = budgetFromPlan(record.days, record.trip.partySize, record.budgetLines);
          record.itemsWithoutCost = record.days
            .flatMap((d) => d.items)
            .filter((i) => !i.costJpy).length;
          log(record, db.user.id, `ใช้ร่างของ AI (${record.days.length} วัน)`);
          return clone(record.days);
        }),
        260,
      );
    },

    async buyCredits(tripId, quantity, channel) {
      // No payment gateway in mock mode — the sheet always succeeds and the
      // caller is told the charge was simulated.
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.ai.extra += quantity;
          log(record, db.user.id, `ซื้อโควตาร่างเพิ่ม ${quantity} ครั้ง (${channel})`);
          return {
            used: record.ai.used,
            included: record.ai.included,
            extra: record.ai.extra,
            pricePerDraftThb: AI_META.pricePerDraftThb,
            payChannels: AI_META.payChannels,
            simulated: true,
          };
        }),
        700,
      );
    },
  },

  /* ------------------------------------------------------------- share -- */
  share: {
    async state(tripId) {
      return delay(
        mutate((db) => {
          const archived = db.past.find((t) => t.id === tripId);
          if (archived) return archivedShareState(archived);
          return clone(tripRecord(db, tripId).share);
        }),
      );
    },

    async setVisibility(tripId, visibility) {
      return delay(
        mutate((db) => {
          // An archived trip has no room to write to, but publishing it is the
          // whole point of keeping it (W17.6) — so its card carries the state.
          const archived = db.past.find((t) => t.id === tripId);
          if (archived) {
            const wasPublic = archived.visibility === 'public';
            archived.visibility = visibility;
            archived.publicSlug = visibility === 'public' ? slugify(archived.title) : null;
            if (visibility === 'public' && !wasPublic) awardPublishPoints(db, archived.title);
            return archivedShareState(archived);
          }

          const record = tripRecord(db, tripId);
          const origin = typeof window === 'undefined' ? '' : window.location.origin;
          const wasPublic = record.share.visibility === 'public';
          record.share.visibility = visibility;

          if (visibility === 'private') {
            record.share.shareToken = null;
            record.share.shareUrl = null;
            record.share.publicSlug = null;
          } else {
            record.share.shareToken ??= mockId('shr');
            record.share.shareUrl = `${origin}/s/${record.share.shareToken}`;
            record.share.publicSlug =
              visibility === 'public' ? slugify(record.trip.title) : null;
          }
          log(record, db.user.id, `ตั้งการแชร์เป็น ${visibility}`);
          if (visibility === 'public' && !wasPublic) {
            awardPublishPoints(db, record.trip.title, record);
          }
          return clone(record.share);
        }),
      );
    },

    async rotateToken(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const origin = typeof window === 'undefined' ? '' : window.location.origin;
          record.share.shareToken = mockId('shr');
          record.share.shareUrl = `${origin}/s/${record.share.shareToken}`;
          return clone(record.share);
        }),
      );
    },

    async exportTrip(tripId, format) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const filename = `${slugify(record.trip.title)}.${format}`;

          // No R2 in mock mode: ICS and JSON are real files built in the
          // browser, PDF is left to the print dialog.
          if (format === 'json' || format === 'ics') {
            const body = format === 'json' ? JSON.stringify(record, null, 2) : toIcs(record);
            const type = format === 'json' ? 'application/json' : 'text/calendar';
            const url =
              typeof window === 'undefined'
                ? ''
                : URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
            return { format, url, filename, simulated: true } satisfies ExportResult;
          }

          return { format, url: '', filename, simulated: true } satisfies ExportResult;
        }),
        320,
      );
    },

    async publicTrip(tokenOrSlug) {
      return delay(
        mutate((db) => {
          const record =
            db.trips.find(
              (t) => t.share.shareToken === tokenOrSlug || t.share.publicSlug === tokenOrSlug,
            ) ?? db.trips[0];
          if (!record) return null;
          record.share.viewCount += 1;
          return {
            trip: clone(record.trip),
            days: clone(record.days),
            members: clone(record.members),
          };
        }),
      );
    },
  },

  /* --------------------------------------------------------------- poi -- */
  poi: {
    async search(query, city) {
      const q = query.trim().toLowerCase();
      const found = POIS.filter((poi) => {
        const matchesCity = !city || poi.city === city;
        const matchesQuery =
          q.length === 0 ||
          poi.name.toLowerCase().includes(q) ||
          (poi.nameEn ?? '').toLowerCase().includes(q) ||
          poi.tags.some((t) => t.toLowerCase().includes(q));
        return matchesCity && matchesQuery;
      });
      return delay(clone(found), 220);
    },

    async get(poiId) {
      return delay(clone(POIS.find((p) => p.id === poiId) ?? null));
    },
  },

  /* ------------------------------------------------------------- admin -- */
  admin: {
    async stats() {
      const db = loadDb();
      return delay({
        users: 1,
        trips: db.trips.length,
        pois: POIS.length,
        characters: CHARACTERS.length,
        // No model is called and no partner is paid in mock mode, so the two
        // numbers that cost money are honestly zero rather than invented.
        aiCostTodayUsd: 0,
        aiCostCapUsd: 5,
        clicksToday: 0,
        mockMode: true,
        commit: 'local',
      });
    },
  },

  /* ----------------------------------------------------------- profile -- */
  profile: {
    async characters() {
      return delay(clone(CHARACTERS));
    },

    async dreams() {
      return delay(clone(loadDb().dreams));
    },

    async addDream(input) {
      return delay(
        mutate((db) => {
          const dream: DreamItem = { ...input, id: mockId('dr') };
          db.dreams.unshift(dream);
          return clone(dream);
        }),
      );
    },

    async removeDream(dreamId) {
      mutate((db) => {
        db.dreams = db.dreams.filter((d) => d.id !== dreamId);
      });
      return delay(undefined);
    },
  },
};

/* --------------------------------------------------------------- recap -- */

/**
 * The archive of a trip that is over (M17 — W17.5).
 *
 * Two sources, one shape. A room that ended still holds everything — its plan,
 * its bookings, its votes, its money — so its recap is derived, never stored.
 * The seeded past trips predate the demo room and carry their record with them
 * (lib/mock/user.ts), which is what a UAT tester sees on the home screen.
 */
function recapOfRecord(record: TripRecord): TripRecap {
  const { trip } = record;
  const items = record.days.flatMap((day) => day.items);
  const expenses = computeExpenses(record.expenses, record.members, trip.fxRate, record.settled);

  const spending = new Map<string, number>();
  for (const entry of record.expenses) {
    const category = entry.category || 'อื่นๆ';
    spending.set(category, (spending.get(category) ?? 0) + toThb(entry, trip.fxRate));
  }

  const decisions: RecapDecision[] = [];

  if (trip.startDate && trip.endDate) {
    decisions.push({
      id: 'dates',
      kind: 'dates',
      title: 'วันที่ไป',
      detail: `${thaiRangeLabel(trip.startDate, trip.endDate)} · ${daysBetween(trip.startDate, trip.endDate)} วัน`,
      decidedAt: record.locked?.lockedAt,
      decidedBy: record.locked?.lockedBy,
    });
  }
  if (trip.cities.length > 0) {
    decisions.push({
      id: 'destination',
      kind: 'destination',
      title: 'ปลายทางที่เลือก',
      detail: trip.cities.join(' · '),
    });
  }
  if (trip.budgetPerPersonThb > 0) {
    decisions.push({
      id: 'budget',
      kind: 'budget',
      title: 'งบที่ตั้งไว้',
      detail: `฿${trip.budgetPerPersonThb.toLocaleString('th-TH')} ต่อคน`,
    });
  }
  if (record.days.length > 0) {
    decisions.push({
      id: 'plan',
      kind: 'plan',
      title: 'แพลนที่ลงตัว',
      detail: `${record.days.length} วัน · ${items.length} ที่`,
    });
    // Why the draft was arranged this way — written once, when it was accepted.
    for (const [index, rationale] of AI_META.rationales.entries()) {
      decisions.push({
        id: `rationale-${index}`,
        kind: 'rationale',
        title: 'เหตุผลที่จัดแบบนี้',
        detail: rationale,
      });
    }
  }
  for (const booking of record.bookings) {
    if (booking.status !== 'booked') continue;
    const price = booking.pricePerPersonThb
      ? ` · ฿${booking.pricePerPersonThb.toLocaleString('th-TH')} ต่อคน`
      : '';
    decisions.push({
      id: `booking-${booking.id}`,
      kind: 'booking',
      title: 'จองจริง',
      detail: `${booking.title} · ${booking.partner}${price}`,
      decidedBy: booking.bookedBy,
    });
  }
  decisions.push(...voteDecisions(record));

  return {
    tripId: trip.id,
    title: trip.title,
    cities: trip.cities,
    dateLabel:
      trip.startDate && trip.endDate ? thaiRangeLabel(trip.startDate, trip.endDate) : 'ยังไม่ได้เลือกวัน',
    cover: trip.cover,
    days: trip.startDate && trip.endDate ? daysBetween(trip.startDate, trip.endDate) : 0,
    places: items.length,
    spentThb: expenses.totalThb,
    budgetPerPersonThb: trip.budgetPerPersonThb,
    members: clone(record.members),
    itinerary: clone(record.days),
    decisions,
    spending: [...spending.entries()]
      .map(([category, amountThb]) => ({ category, amountThb }))
      .sort((a, b) => b.amountThb - a.amountThb),
    activity: clone(record.activity),
    share: clone(record.share),
    pointsPerPublish: POINTS_PER_PUBLISH,
    canPublish: record.role === 'owner' && record.share.visibility !== 'public',
  };
}

/**
 * Votes only make the record when they settled something: the tally, against a
 * target that still has a name. A vote on a deleted item is dropped rather than
 * printed as an id nobody recognises.
 */
function voteDecisions(record: TripRecord): RecapDecision[] {
  const titles = new Map<string, string>();
  for (const day of record.days) {
    for (const item of day.items) titles.set(`item:${item.id}`, item.title);
  }
  for (const wish of record.wishlist) titles.set(`wish:${wish.id}`, wish.title);

  const tally = new Map<string, { up: number; down: number }>();
  for (const vote of record.votes) {
    const key = `${vote.targetType}:${vote.targetId}`;
    if (!titles.has(key)) continue;
    const current = tally.get(key) ?? { up: 0, down: 0 };
    if (vote.value > 0) current.up += 1;
    else current.down += 1;
    tally.set(key, current);
  }

  return [...tally.entries()].map(([key, counts]) => ({
    id: `vote-${key}`,
    kind: 'vote' as const,
    title: 'โหวตกันแล้ว',
    detail: `${titles.get(key)} · ${counts.up} เอา / ${counts.down} ไม่เอา`,
  }));
}

function recapOfArchive(db: MockDb, past: PastTrip): TripRecap {
  const archive = PAST_TRIP_ARCHIVES[past.id];
  const roster = db.trips[0]?.members ?? [];
  const characterIds = facesOf(db, past);

  return {
    tripId: past.id,
    title: past.title,
    cities: past.cities,
    dateLabel: past.dateLabel,
    cover: past.cover,
    days: past.days,
    places: past.places,
    spentThb: past.spentThb,
    budgetPerPersonThb: 0,
    members: past.memberIds.map((id, index) => ({
      id,
      name: roster.find((m) => m.id === id)?.name ?? `เพื่อนคนที่ ${index + 1}`,
      role: index === 0 ? ('owner' as const) : ('editor' as const),
      characterId: characterIds[index] ?? 'shiba',
      hasWishlist: true,
    })),
    itinerary: clone(archive?.itinerary ?? []),
    decisions: clone(archive?.decisions ?? []),
    spending: clone(archive?.spending ?? []),
    activity: [],
    share: archivedShareState(past),
    pointsPerPublish: POINTS_PER_PUBLISH,
    canPublish: past.visibility !== 'public',
  };
}

/**
 * Opening a trip to the public pays once (§6.5). Live mode writes a row in the
 * points ledger; mock mode moves the balance the profile screen reads, so the
 * reward the nudge promised actually shows up.
 */
function awardPublishPoints(db: MockDb, title: string, record?: TripRecord) {
  db.user.points += POINTS_PER_PUBLISH;
  if (record) log(record, db.user.id, `เปิดทริป "${title}" เป็นสาธารณะ +${POINTS_PER_PUBLISH} แต้ม`);
}

/** An archived card carries its own share state — there is no room to ask. */
function archivedShareState(past: PastTrip): ShareState {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return {
    visibility: past.visibility ?? 'private',
    shareToken: null,
    shareUrl: past.publicSlug ? `${origin}/p/${past.publicSlug}` : null,
    publicSlug: past.publicSlug ?? null,
    viewCount: 0,
    cloneCount: 0,
  };
}

/* ------------------------------------------------------------- helpers -- */

/** The month a date falls in, plus the following ones the board may browse. */
function nextMonths(fromIso: string, count: number) {
  const first = parseIsoDate(monthOf(fromIso));
  return Array.from({ length: count }, (_, i) =>
    toIsoDate(new Date(first.getFullYear(), first.getMonth() + i, 1)),
  );
}

/**
 * Which characters to draw on a trip card. The member ids on a past trip may
 * belong to a room that no longer exists, so anyone unknown falls back to the
 * demo cast rather than leaving a hole in the row.
 */
function facesOf(db: MockDb, trip: { id: string; memberIds: string[] }) {
  const record = db.trips.find((t) => t.trip.id === trip.id);
  const roster = record?.members ?? db.trips[0]?.members ?? [];
  return trip.memberIds.map(
    (id, index) =>
      roster.find((m) => m.id === id)?.characterId ??
      roster[index % Math.max(1, roster.length)]?.characterId ??
      'shiba',
  );
}

/**
 * Records an item as it was before a change, so "ย้อนกลับ" is always available
 * (W5.5). The trail is capped: a group editing together wants the last few
 * steps back, not a full history of the trip.
 */
function snapshot(
  record: TripRecord,
  actorId: string,
  itemId: string,
  action: 'update' | 'move' | 'delete',
) {
  for (const day of record.days) {
    const index = day.items.findIndex((i) => i.id === itemId);
    if (index < 0) continue;

    record.versions.push({
      id: mockId('ver'),
      itemId,
      action,
      actorId,
      createdAt: nowIso(),
      dayId: day.id,
      index,
      item: clone(day.items[index]!),
    });
    record.versions = record.versions.slice(-20);
    return;
  }
}

function monthOf(iso: string) {
  return iso ? `${iso.slice(0, 7)}-01` : toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
}

function boardOf(record: TripRecord, month?: string): AvailabilityBoard {
  // A month someone has already marked must be reachable even if it was never
  // in the trip's own list — otherwise their answer becomes invisible.
  const marked = [...new Set(record.availability.map((e) => monthOf(e.date)))];
  const months = [...new Set([...record.months, ...marked])].sort();
  if (months.length === 0) months.push(monthOf(record.trip.startDate));
  const active = month && months.includes(month) ? month : (months[0] ?? monthOf(''));

  return {
    tripId: record.trip.id,
    month: active,
    months,
    members: clone(record.members),
    submittedMemberIds: [...record.submittedMemberIds],
    entries: clone(record.availability),
    windows: computeWindows(record.availability, record.members),
    locked: clone(record.locked),
  };
}

function budgetOf(record: TripRecord) {
  const lines =
    record.days.length > 0
      ? budgetFromPlan(record.days, record.trip.partySize, record.budgetLines)
      : record.budgetLines;

  return computeBudget(lines, {
    fxRate: record.trip.fxRate,
    fxAsOf: record.trip.fxAsOf,
    budgetPerPersonThb: record.trip.budgetPerPersonThb,
    itemsWithoutCost: record.itemsWithoutCost,
  });
}

function expensesOf(record: TripRecord) {
  return computeExpenses(record.expenses, record.members, record.trip.fxRate, record.settled);
}

function slugify(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'trip'
  );
}

/** Minimal VCALENDAR — one all-day event per plan day. */
function toIcs(record: TripRecord) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ROVE//TH//'];
  for (const day of record.days) {
    const date = day.date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${day.id}@rove.app`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${record.trip.title} — ${day.label}`,
      `DESCRIPTION:${day.items.map((i) => `${i.start} ${i.title}`).join('\\n')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Re-exported so the profile screen can render a character without a fetch. */
export { getCharacter };

/** The unused-parameter lint would otherwise fire on repo methods that ignore
 * their tripId in mock mode; this keeps the signature honest instead. */
void meId;
