import {
  AI_CREDITS,
  AI_PAY_CHANNELS,
  BUDGET,
  DAYS,
  EXPENSES,
  ITEMS_WITHOUT_COST,
  MEMBERS,
  OPEN_QUESTIONS,
  RATIONALES,
  TRIP,
  WISHLIST,
} from '@/lib/mock/trip';
import { CURRENT_USER, DREAMS, PAST_TRIPS, UPCOMING, YEAR_STATS } from '@/lib/mock/user';

import type {
  ActivityEvent,
  AvailabilityEntry,
  BookingEntry,
  BudgetLine,
  Comment,
  CurrentUser,
  DreamItem,
  ExpenseEntry,
  FlightLeg,
  LockedDates,
  Member,
  PlanDay,
  PlanItem,
  PrepTask,
  ShareState,
  Trip,
  Vote,
  WishlistItem,
} from '../types';

/**
 * The mock database.
 *
 * One JSON blob in localStorage, seeded from lib/mock the first time it is
 * read. Every write in mock mode goes through `mutate()`, which means a UAT
 * session behaves like a real one: edits survive a reload, and "รีเซ็ต" puts
 * the demo back to a known state.
 *
 * Never imported outside lib/data/mock.
 */

const STORAGE_KEY = 'rove.mock.v4';

export interface TripRecord {
  trip: Trip;
  role: 'owner' | 'editor' | 'viewer';
  members: Member[];
  /** Date coordination state — empty for a trip whose dates are already set. */
  availability: AvailabilityEntry[];
  submittedMemberIds: string[];
  /** Months the board offers, "2026-12-01". */
  months: string[];
  locked: LockedDates | null;
  destinationId: string | null;
  /** The booked route (M1 — A1.3). The frame above is derived from it. */
  flights: FlightLeg[];
  wishlist: WishlistItem[];
  days: PlanDay[];
  budgetLines: BudgetLine[];
  itemsWithoutCost: number;
  expenses: ExpenseEntry[];
  settled: { fromMemberId: string; toMemberId: string; at: string }[];
  prep: PrepTask[];
  prepNote: string;
  /** Snapshots of items as they were, newest last (W5.5 / W5.7). */
  versions: { id: string; itemId: string; action: 'update' | 'move' | 'delete'; actorId: string; createdAt: string; dayId: string; index: number; item: PlanItem }[];
  bookings: BookingEntry[];
  comments: Comment[];
  votes: Vote[];
  activity: ActivityEvent[];
  ai: { used: number; included: number; extra: number };
  share: ShareState;
}

export interface MockDb {
  version: number;
  user: CurrentUser;
  trips: TripRecord[];
  dreams: DreamItem[];
  /** Trips the user finished — the profile timeline reads these as-is. */
  past: typeof PAST_TRIPS;
  upcoming: typeof UPCOMING;
  stats: typeof YEAR_STATS;
}

/* ------------------------------------------------------------------ seed -- */

const DEC_AVAILABILITY: Record<string, number[]> = {
  m1: [4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22],
  m2: [4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 23, 24, 25],
  m3: [3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22],
  m4: [4, 5, 6, 7, 8, 9, 18, 19, 20, 21, 22, 23, 24],
};

/** A few "ไปได้แต่ไม่ค่อยสะดวก" days, so the three-state board has something to show. */
const DEC_MAYBE: Record<string, number[]> = {
  m1: [11, 12],
  m3: [23, 24],
  m4: [26],
};

function decEntries(): AvailabilityEntry[] {
  const out: AvailabilityEntry[] = [];
  for (const [memberId, days] of Object.entries(DEC_AVAILABILITY)) {
    for (const d of days) {
      out.push({ memberId, date: `2026-12-${String(d).padStart(2, '0')}`, mark: 'free' });
    }
  }
  for (const [memberId, days] of Object.entries(DEC_MAYBE)) {
    for (const d of days) {
      out.push({ memberId, date: `2026-12-${String(d).padStart(2, '0')}`, mark: 'maybe' });
    }
  }
  return out;
}

const now = () => new Date().toISOString();

function seedDemoTrip(): TripRecord {
  return {
    trip: structuredClone(TRIP),
    role: 'owner',
    members: structuredClone(MEMBERS),
    availability: [],
    submittedMemberIds: MEMBERS.map((m) => m.id),
    months: ['2026-11-01'],
    locked: {
      startDate: TRIP.startDate,
      endDate: TRIP.endDate,
      days: TRIP.nights + 1,
      lockedBy: 'm1',
      lockedAt: '2026-08-02T09:00:00.000Z',
      memberIds: MEMBERS.map((m) => m.id),
    },
    destinationId: 'japan',
    // The demo trip has its tickets: 15 Nov out, 22 Nov back.
    flights: [
      {
        id: 'fl-demo-out',
        direction: 'out',
        mode: 'flight',
        flightNo: 'TG682',
        from: 'BKK',
        to: 'HND',
        depDate: TRIP.startDate,
        depTime: '23:59',
        arrDate: TRIP.startDate,
        arrTime: '07:05',
      },
      {
        // Tokyo → Osaka by shinkansen. A ground leg is still a leg: without it
        // the route would give Tokyo all seven nights and the plan would put
        // Kyoto in the wrong half of the trip. Ground legs are named by the
        // airport that serves the city they end in.
        id: 'fl-demo-inter',
        direction: 'inter',
        mode: 'ground',
        from: 'HND',
        to: 'KIX',
        depDate: '2026-11-19',
        depTime: '09:20',
        arrDate: '2026-11-19',
        arrTime: '11:45',
      },
      {
        id: 'fl-demo-back',
        direction: 'back',
        mode: 'flight',
        flightNo: 'TG673',
        from: 'KIX',
        to: 'BKK',
        depDate: TRIP.endDate,
        depTime: '12:20',
        arrDate: TRIP.endDate,
        arrTime: '16:30',
      },
    ],
    wishlist: structuredClone(WISHLIST),
    days: structuredClone(DAYS),
    budgetLines: structuredClone(BUDGET),
    itemsWithoutCost: ITEMS_WITHOUT_COST,
    expenses: structuredClone(EXPENSES),
    settled: [],
    prep: [],
    prepNote: '',
    versions: [],
    bookings: [],
    comments: [
      {
        id: 'c1',
        targetType: 'item',
        targetId: DAYS[0]?.items[0]?.id ?? 'i1',
        memberId: 'm2',
        body: 'ขอเวลาเผื่อตรงนี้อีกหน่อยได้ไหม กลัวไม่ทัน',
        createdAt: '2026-08-15T04:12:00.000Z',
        resolved: false,
      },
    ],
    votes: [],
    activity: [
      { id: 'a1', memberId: 'm2', text: 'ย้าย teamLab Planets ไปวันที่ 2', createdAt: '2026-08-19T02:00:00.000Z' },
      { id: 'a2', memberId: 'm3', text: 'เพิ่ม "ทาโกยากิโดทงโบริ" ลงที่อยากไป', createdAt: '2026-08-18T11:20:00.000Z' },
      { id: 'a3', memberId: 'm1', text: 'ให้ AI ร่างแพลน 8 วัน', createdAt: '2026-08-18T08:00:00.000Z' },
      { id: 'a4', memberId: 'm1', text: 'ตั้งงบไว้ที่ 45,000 บาท/คน', createdAt: '2026-08-16T03:30:00.000Z' },
    ],
    ai: { used: AI_CREDITS.used, included: AI_CREDITS.freePerTrip, extra: 0 },
    share: {
      visibility: 'private',
      shareToken: null,
      shareUrl: null,
      publicSlug: null,
      viewCount: 0,
      cloneCount: 0,
    },
  };
}

/** The trip that has no dates yet — the one the date board is built for. */
function seedDateTrip(): TripRecord {
  const members: Member[] = [
    { id: 'm1', name: 'ตอง', role: 'owner', characterId: 'shiba', hasWishlist: false },
    { id: 'm2', name: 'มายด์', role: 'editor', characterId: 'cat', hasWishlist: false },
    { id: 'm3', name: 'ปอนด์', role: 'editor', characterId: 'capybara', hasWishlist: false },
    { id: 'm4', name: 'จูน', role: 'editor', characterId: 'penguin', hasWishlist: false },
  ];

  return {
    trip: {
      id: 'dec',
      title: 'ทริปสิ้นปีของแก๊ง',
      cities: [],
      startDate: '',
      endDate: '',
      nights: 0,
      partySize: 4,
      status: 'planning',
      cover: '/brand/covers/cover-japan.webp',
      homeCurrency: 'THB',
      destCurrency: 'JPY',
      fxRate: 0.235,
      fxAsOf: '2026-08-18',
      budgetPerPersonThb: 40_000,
    },
    role: 'owner',
    members,
    availability: decEntries(),
    submittedMemberIds: ['m1', 'm2', 'm3', 'm4'],
    months: ['2026-12-01', '2027-01-01'],
    locked: null,
    destinationId: null,
    // No dates yet means no tickets yet — this is the date-board trip.
    flights: [],
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
    activity: [
      { id: 'da1', memberId: 'm4', text: 'ใส่วันว่างเดือนธันวาแล้ว', createdAt: '2026-08-19T01:00:00.000Z' },
      { id: 'da2', memberId: 'm1', text: 'สร้างห้องทริปและชวนเพื่อน 3 คน', createdAt: '2026-08-18T12:00:00.000Z' },
    ],
    ai: { used: 0, included: AI_CREDITS.freePerTrip, extra: 0 },
    share: {
      visibility: 'private',
      shareToken: null,
      shareUrl: null,
      publicSlug: null,
      viewCount: 0,
      cloneCount: 0,
    },
  };
}

export function seedDb(): MockDb {
  return {
    version: 4,
    user: {
      id: CURRENT_USER.id,
      name: CURRENT_USER.name,
      handle: CURRENT_USER.handle,
      characterId: CURRENT_USER.characterId,
      email: 'demo@rove.app',
      homeCurrency: 'THB',
      isAdmin: true,
      points: CURRENT_USER.points,
    },
    trips: [seedDemoTrip(), seedDateTrip()],
    dreams: structuredClone(DREAMS),
    past: structuredClone(PAST_TRIPS),
    upcoming: structuredClone(UPCOMING),
    stats: structuredClone(YEAR_STATS),
  };
}

/* ------------------------------------------------------------- constants -- */

export const AI_META = {
  pricePerDraftThb: AI_CREDITS.priceThb,
  payChannels: AI_PAY_CHANNELS,
  rationales: RATIONALES,
  openQuestions: OPEN_QUESTIONS,
};

/* --------------------------------------------------------------- storage -- */

let memory: MockDb | null = null;
const listeners = new Set<() => void>();

function canPersist() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadDb(): MockDb {
  if (memory) return memory;

  if (canPersist()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        // A seed change bumps the version; an old blob is thrown away rather
        // than migrated — this is demo data, not anyone's real trip.
        if (parsed.version === 4) {
          memory = parsed;
          return memory;
        }
      }
    } catch {
      // Corrupt blob — fall through to a fresh seed.
    }
  }

  memory = seedDb();
  persist();
  return memory;
}

function persist() {
  if (!canPersist() || !memory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Quota or private mode: the session still works, it just stops surviving
    // reloads. Not worth interrupting a UAT run over.
  }
}

/** Applies a change and notifies subscribers. Returns whatever `fn` returns. */
export function mutate<T>(fn: (db: MockDb) => T): T {
  const db = loadDb();
  const result = fn(db);
  persist();
  for (const listener of listeners) listener();
  return result;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDb() {
  memory = seedDb();
  persist();
  for (const listener of listeners) listener();
}

/* ---------------------------------------------------------------- lookup -- */

export function tripRecord(db: MockDb, tripId: string): TripRecord {
  const found = db.trips.find((t) => t.trip.id === tripId);
  if (found) return found;
  // A UAT tester can land on any id (a shared link, a stale bookmark). Rather
  // than 404 in a demo, clone the demo trip under that id.
  const created = seedDemoTrip();
  created.trip = { ...created.trip, id: tripId };
  db.trips.push(created);
  return created;
}

let counter = 0;
export function mockId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export const nowIso = now;
