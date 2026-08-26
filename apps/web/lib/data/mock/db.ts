import {
  AI_CREDITS,
  BUDGET,
  DAYS,
  EXPENSES,
  ITEMS_WITHOUT_COST,
  MEMBERS,
  OPEN_QUESTIONS,
  RATIONALES,
  TRIP,
  WISHLIST,
} from './seed/trip';
import { CURRENT_USER, DREAMS, PAST_TRIPS, POINTS_LEDGER, UPCOMING, YEAR_STATS } from './seed/user';
import { DEMO_PUBLIC_SLUG } from '@/lib/demo-trip';

import { AI_PAY_CHANNELS, FREE_SUBSCRIPTION, seedOrders } from './billing';

import type {
  ActivityEvent,
  AgentLead,
  DiscountCode,
  EarningsStatement,
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
  MemberProfile,
  Notification,
  Order,
  PlanDay,
  PlanItem,
  Poll,
  PointsEntry,
  PrepTask,
  ShareState,
  Subscription,
  Trip,
  TripDocument,
  TripPhoto,
  TripReview,
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

// v10 adds the points ledger (M23 — A23.1): the balance stops being a number
// on the user record and becomes a SUM of rows, the same way the API has
// always held it. Bumped rather than back-filled: a stored older blob has no
// such array, and a UAT session that half-loads is worse than one that starts
// clean.
const STORAGE_KEY = 'rove.mock.v10';

/** One candidate itinerary (M6) — metrics and votes are computed at read. */
export interface VariantRecord {
  id: string;
  label: string;
  keyDecision: string;
  summary: string;
  source: 'ai' | 'fork';
  createdBy: string;
  createdAt: string;
  fromDayIndex: number;
  pros: string[];
  cons: string[];
  days: PlanDay[];
}

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
  /** Trip-scoped member profiles (A3.1), keyed by member id. */
  profiles: Record<string, MemberProfile>;
  days: PlanDay[];
  /** Candidate itineraries being compared (M6). */
  variants: VariantRecord[];
  budgetLines: BudgetLine[];
  itemsWithoutCost: number;
  expenses: ExpenseEntry[];
  settled: { fromMemberId: string; toMemberId: string; at: string }[];
  prep: PrepTask[];
  prepNote: string;
  /** Snapshots of items as they were, newest last (W5.5 / W5.7). */
  versions: {
    id: string;
    itemId: string;
    action: 'update' | 'move' | 'delete';
    actorId: string;
    createdAt: string;
    dayId: string;
    index: number;
    item: PlanItem;
  }[];
  bookings: BookingEntry[];
  /** Pictures taken on the trip (M18) and the paper it runs on (M19). */
  photos: TripPhoto[];
  documents: TripDocument[];
  /** Open questions with fixed options (M9 — A9.3). */
  polls: Poll[];
  /** What people said afterwards (M21 — A11.5). One per member, at most. */
  reviews: TripReview[];
  /** Requests to hand this trip to a partner agent (M22 — A12.12). */
  leads: AgentLead[];
  comments: Comment[];
  votes: Vote[];
  activity: ActivityEvent[];
  /**
   * The draft meter, plus whether anybody in the room has paid for the trip.
   * `extra` is the pre-M26 per-draft purchase, kept so seeded history still
   * adds up; nothing writes to it now.
   */
  ai: { used: number; included: number; extra: number; hasPass: boolean };
  share: ShareState;
  /**
   * Who published it — set only on the seeded explore records, which belong to
   * nobody in this browser. A record without one is the demo user's own.
   */
  creator?: { name: string; handle: string; characterId: string };
}

export interface MockDb {
  version: number;
  user: CurrentUser;
  trips: TripRecord[];
  /**
   * Published trips by other (fictional) travellers, so the explore feed has
   * something to show before the demo user publishes anything (M11).
   */
  publicTrips: TripRecord[];
  dreams: DreamItem[];
  /** Everything this user has bought, newest last (M20). */
  orders: Order[];
  /** The standing plan. Free until a gateway exists. */
  subscription: Subscription;
  /** Everything addressed to this user, newest last (M9 — A9.2). */
  notifications: Notification[];
  /** Points turned into money off (M22 — A12.10), newest first. */
  discountCodes: DiscountCode[];
  /**
   * Every point ever earned or spent, newest first (M23 — A23.1).
   *
   * `user.points` is kept as the running total of this array and never written
   * on its own — the same rule the API keeps, where a balance is a SUM and
   * never a column.
   */
  pointsLedger: PointsEntry[];
  /** What this user's published plans have earned them (M22 — A12.11). */
  earnings: EarningsStatement;
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
    // Two of four filled in, so the nudge and the conflict check both have
    // something to show out of the box.
    profiles: {
      m1: {
        userId: 'm1',
        visitedBefore: true,
        pace: 'balanced',
        walkLevel: 2,
        canDrive: true,
        hasIdp: false,
        budgetMinThb: 35_000,
        budgetMaxThb: 50_000,
        dietary: [],
        notes: 'อยากได้วันว่างสักครึ่งวันไว้ช้อปปิ้ง',
        filled: true,
      },
      m2: {
        userId: 'm2',
        visitedBefore: false,
        pace: 'relaxed',
        walkLevel: 1,
        canDrive: false,
        hasIdp: false,
        budgetMinThb: 25_000,
        budgetMaxThb: 38_000,
        dietary: ['ไม่กินหมู'],
        notes: '',
        filled: true,
      },
    },
    days: structuredClone(DAYS),
    variants: [],
    budgetLines: structuredClone(BUDGET),
    itemsWithoutCost: ITEMS_WITHOUT_COST,
    expenses: structuredClone(EXPENSES),
    settled: [],
    prep: [],
    prepNote: '',
    versions: [],
    bookings: [],
    photos: [],
    documents: [],
    polls: [],
    reviews: [],
    leads: [],
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
    ai: { used: AI_CREDITS.used, included: AI_CREDITS.freePerTrip, extra: 0, hasPass: false },
    // Published, because this is also the trip the landing page offers to an
    // anonymous visitor as "ดูทริปตัวอย่าง" (/p/japan-autumn-8d). The same
    // slug is seeded into MySQL for live mode, so one URL answers in both.
    share: {
      visibility: 'public',
      shareToken: 'tok-demo',
      shareUrl: null,
      publicSlug: DEMO_PUBLIC_SLUG,
      viewCount: 312,
      cloneCount: 18,
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
      // No destination yet — the date board picks it (M2.5), so the checklist
      // and the zones fall back to the default until it does.
      country: 'JP',
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
    profiles: {},
    days: [],
    variants: [],
    budgetLines: [],
    itemsWithoutCost: 0,
    expenses: [],
    settled: [],
    prep: [],
    prepNote: '',
    versions: [],
    bookings: [],
    photos: [],
    documents: [],
    polls: [],
    reviews: [],
    leads: [],
    comments: [],
    votes: [],
    activity: [
      { id: 'da1', memberId: 'm4', text: 'ใส่วันว่างเดือนธันวาแล้ว', createdAt: '2026-08-19T01:00:00.000Z' },
      { id: 'da2', memberId: 'm1', text: 'สร้างห้องทริปและชวนเพื่อน 3 คน', createdAt: '2026-08-18T12:00:00.000Z' },
    ],
    ai: { used: 0, included: AI_CREDITS.freePerTrip, extra: 0, hasPass: false },
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

/**
 * A published trip by a fictional traveller, derived from the demo itinerary
 * so cloning it produces a fully working room.
 */
function seedPublicTrip(input: {
  id: string;
  slug: string;
  title: string;
  cover: string;
  cities: string[];
  /** Nights, so the card's "N วัน" agrees with the title it sits under. */
  nights: number;
  budgetPerPersonThb: number;
  viewCount: number;
  cloneCount: number;
  creator: { name: string; handle: string; characterId: string };
}): TripRecord {
  const record = seedDemoTrip();
  record.trip = {
    ...record.trip,
    id: input.id,
    title: input.title,
    cover: input.cover,
    cities: input.cities,
    nights: input.nights,
    budgetPerPersonThb: input.budgetPerPersonThb,
    status: 'done',
  };
  // The itinerary is trimmed to the length the frame claims — a 4-day trip
  // whose plan runs 8 days is the kind of detail a UAT tester spots first.
  record.days = record.days.slice(0, input.nights + 1);
  // No legs: these are other people's finished trips shown as plans, and a
  // borrowed set of flight numbers would only contradict the frame above.
  record.flights = [];
  record.locked = null;
  record.role = 'viewer';
  record.members = [
    {
      id: `${input.id}-owner`,
      name: input.creator.name,
      role: 'owner',
      characterId: input.creator.characterId,
      hasWishlist: true,
    },
  ];
  // Someone else's room: their money and their chatter never ship with a seed.
  record.expenses = [];
  record.settled = [];
  record.comments = [];
  record.activity = [];
  record.photos = [];
  record.documents = [];
  record.polls = [];
  record.profiles = {};
  record.days = record.days.map((day) => ({
    ...day,
    items: day.items.map((item) => ({ ...item, id: `${input.id}-${item.id}` })),
  }));
  record.share = {
    visibility: 'public',
    shareToken: `tok-${input.id}`,
    shareUrl: null,
    publicSlug: input.slug,
    viewCount: input.viewCount,
    cloneCount: input.cloneCount,
  };
  record.creator = input.creator;
  return record;
}

function seedPublicTrips(): TripRecord[] {
  return [
    seedPublicTrip({
      id: 'pub-tokyo',
      slug: 'tokyo-week-mint',
      title: 'โตเกียว 7 วันฉบับไปครั้งแรก',
      cover: '/brand/covers/cover-japan.webp',
      cities: ['Tokyo', 'Yokohama'],
      nights: 6,
      budgetPerPersonThb: 42_000,
      viewCount: 1284,
      cloneCount: 96,
      creator: { name: 'มิ้นท์', handle: 'mint.travels', characterId: 'cat' },
    }),
    seedPublicTrip({
      id: 'pub-osaka',
      slug: 'kansai-food-run',
      title: 'สายกินบุกคันไซ 5 วัน',
      cover: '/brand/covers/cover-food.webp',
      cities: ['Osaka', 'Kyoto', 'Nara'],
      nights: 4,
      budgetPerPersonThb: 33_000,
      viewCount: 872,
      cloneCount: 41,
      creator: { name: 'ภูมิ', handle: 'phum.eats', characterId: 'bear' },
    }),
    seedPublicTrip({
      id: 'pub-korea',
      slug: 'seoul-cafe-hop',
      title: 'โซลคาเฟ่ฮอป 4 วัน 3 คืน',
      cover: '/brand/covers/cover-korea.webp',
      cities: ['Seoul'],
      nights: 3,
      budgetPerPersonThb: 24_000,
      viewCount: 655,
      cloneCount: 28,
      creator: { name: 'พลอย', handle: 'ploy.wander', characterId: 'rabbit' },
    }),
  ];
}

export function seedDb(): MockDb {
  return {
    version: 10,
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
    publicTrips: seedPublicTrips(),
    dreams: structuredClone(DREAMS),
    orders: seedOrders(),
    subscription: structuredClone(FREE_SUBSCRIPTION),
    notifications: [],
    discountCodes: [],
    pointsLedger: structuredClone(POINTS_LEDGER),
    // Seeded with one settled month and one still owing, so the creator
    // statement has something to be a statement of.
    earnings: seedEarnings(),
    past: structuredClone(PAST_TRIPS),
    upcoming: structuredClone(UPCOMING),
    stats: structuredClone(YEAR_STATS),
  };
}

/**
 * A creator statement worth looking at (M22 — A12.11).
 *
 * The numbers follow the same arithmetic the API uses: a partner commission,
 * 30% of it to the creator, and an `estimated` flag on anything accrued from a
 * rate table rather than reported.
 */
function seedEarnings(): EarningsStatement {
  const entries = [
    {
      tripId: 'demo',
      partner: 'Agoda',
      bookingValueThb: 48_000,
      commissionThb: 2_400,
      sharePercent: 30,
      amountThb: 720,
      estimated: true,
      status: 'payable' as const,
      occurredAt: '2026-08-12T09:20:00.000Z',
    },
    {
      tripId: 'demo',
      partner: 'Klook',
      bookingValueThb: 9_600,
      commissionThb: 480,
      sharePercent: 30,
      amountThb: 144,
      estimated: false,
      status: 'payable' as const,
      occurredAt: '2026-08-03T14:05:00.000Z',
    },
    {
      tripId: 'demo',
      partner: 'Booking.com',
      bookingValueThb: 62_000,
      commissionThb: 2_480,
      sharePercent: 30,
      amountThb: 744,
      estimated: false,
      status: 'paid' as const,
      occurredAt: '2026-07-18T11:40:00.000Z',
    },
  ];

  const sum = (status: string) =>
    entries.filter((e) => e.status === status).reduce((n, e) => n + e.amountThb, 0);

  return {
    totals: {
      pendingThb: sum('pending'),
      payableThb: sum('payable'),
      paidThb: sum('paid'),
      count: entries.length,
    },
    sharePercent: 30,
    minimumPayoutThb: 300,
    entries,
    payouts: [
      {
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        amountThb: 744,
        earningCount: 1,
        status: 'paid',
        paidAt: '2026-08-05T03:00:00.000Z',
      },
    ],
  };
}

/* ------------------------------------------------------------- constants -- */

export const AI_META = {
  passPriceThb: AI_CREDITS.passPriceThb,
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
        if (parsed.version === 10) {
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
