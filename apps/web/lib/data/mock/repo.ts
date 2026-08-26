import { DEFAULT_COVER } from '@/lib/covers';
import { getCharacter, CHARACTERS } from '@/lib/catalog/characters';
import { AI_CREDITS, DAYS } from './seed/trip';
import { PAST_TRIP_ARCHIVES, POINTS_PER_PUBLISH } from './seed/user';

import { getAirport, getAirports, searchAirports } from '../airports';
import { buildRoute, routeCities } from '../route';

import {
  adaptPlan,
  addDays,
  budgetFromPlan,
  computeBudget,
  computeCoverage,
  computeExpenses,
  computeWindows,
  daysBetween,
  detectConflicts,
  membersFreeInRange,
  parseIsoDate,
  recomputeCoverage,
  scoreMatch,
  thaiRangeLabel,
  toIsoDate,
  toThb,
  validateDays,
  variantMetricsOf,
} from '../domain';
import type { AdaptOutcome, AdaptRequest, MatchProfile } from '../domain';
import type { RoveRepo } from '../repo';
import type {
  ActivityEvent,
  AdaptDiff,
  AdaptInput,
  AgentLead,
  DiscountCode,
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
  PlanVariant,
  Poll,
  PointsEntry,
  PrepTask,
  RecapDecision,
  ReviewBoard,
  ReviewSummary,
  ShareState,
  StubbedProvider,
  Trip,
  TripDocument,
  TripPhoto,
  TripRecap,
  TripReview,
  TripRoute,
  TripSummary,
  Vote,
  WishlistItem,
} from '../types';
import { buildOrder, PLANS } from './billing';
import { BOOKING_OFFERS, POIS, prepTemplateFor, rankDestinations } from './catalog';
import {
  AI_META,
  loadDb,
  mockId,
  mutate,
  nowIso,
  tripRecord,
  type MockDb,
  type TripRecord,
  type VariantRecord,
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

/**
 * Everything mock mode stands in for — which is everything, because there is
 * no backend behind it at all. Listed rather than shortened to a boolean so a
 * screen asking "is the AI real here?" gets the same shape of answer in both
 * modes.
 */
const MOCK_STUBBED: StubbedProvider[] = [
  'ai',
  'places',
  'weather',
  'fx',
  'storage',
  'notifications',
  'affiliate',
];

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

/* ------------------------------------------------------ community (M9) --- */

/**
 * Rebuilds a poll's tally from the votes list, the way the API derives it —
 * the stored poll carries the question and its options, never the counts, so
 * the two can never drift apart.
 */
function pollWithTally(db: MockDb, poll: Poll): Poll {
  const record = db.trips.find((t) => t.polls.some((p) => p.id === poll.id));
  const votes = (record?.votes ?? []).filter(
    (v) => v.targetType === 'poll' && v.targetId === poll.id,
  );

  const options = poll.options.map((option) => ({
    ...option,
    votes: 0,
    who: [] as string[],
  }));
  let answered = 0;
  let myAnswer = -1;

  for (const vote of votes) {
    const index = vote.value;
    if (index < 0 || index >= options.length) continue;
    options[index]!.votes += 1;
    options[index]!.who.push(vote.memberId);
    answered += 1;
    if (vote.memberId === db.user.id) myAnswer = index;
  }

  return { ...clone(poll), options, answered, myAnswer };
}

/* ---------------------------------------------------- public model (M11) - */

/** Published records live in two lists: my trips and the seeded explore set. */
function findPublished(db: MockDb, tokenOrSlug: string): TripRecord | null {
  const match = (t: TripRecord) =>
    t.share.shareToken === tokenOrSlug || t.share.publicSlug === tokenOrSlug;
  return db.trips.find(match) ?? db.publicTrips.find(match) ?? null;
}

function creatorOf(db: MockDb, record: TripRecord) {
  if (record.creator) {
    return {
      name: record.creator.name,
      handle: record.creator.handle,
      characterId: record.creator.characterId,
    };
  }
  return { name: db.user.name, handle: db.user.handle || null, characterId: db.user.characterId };
}

function exploreOf(db: MockDb, record: TripRecord) {
  return {
    slug: record.share.publicSlug ?? record.trip.id,
    title: record.trip.title,
    cover: record.trip.cover,
    cities: [...record.trip.cities],
    country: '',
    days: record.trip.nights + 1,
    budgetPerPersonThb: record.trip.budgetPerPersonThb,
    viewCount: record.share.viewCount,
    cloneCount: record.share.cloneCount,
    creator: creatorOf(db, record),
    updatedAt: nowIso(),
    reviews: summariseReviews(record.reviews),
  };
}

/**
 * The roll-up the API computes in `summariseReviews` / `SummaryByTrips`.
 *
 * The budget average counts only the people who gave a number — averaging over
 * everybody would quietly report a cheaper trip than anyone had.
 */
function summariseReviews(reviews: TripReview[]): ReviewSummary {
  if (reviews.length === 0) {
    return { count: 0, averageRating: 0, actualBudgetPerPerson: 0, budgetSaid: 0 };
  }

  const said = reviews.filter((r) => r.actualBudgetPerPerson > 0);
  return {
    count: reviews.length,
    averageRating:
      Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10,
    actualBudgetPerPerson:
      said.length === 0
        ? 0
        : Math.round(said.reduce((sum, r) => sum + r.actualBudgetPerPerson, 0) / said.length),
    budgetSaid: said.length,
  };
}

/** Nobody reviews a holiday they are still packing for. */
function tripIsOver(record: TripRecord) {
  return record.trip.status === 'done' || record.trip.endDate < toIsoDate(new Date());
}

function reviewBoardOf(db: MockDb, record: TripRecord): ReviewBoard {
  return {
    summary: summariseReviews(record.reviews),
    entries: clone(record.reviews),
    mine: clone(record.reviews.find((r) => r.userId === db.user.id) ?? null),
    canReview: tripIsOver(record),
  };
}

/**
 * The redemption rate and tiers, mirroring `pkg/domain/revenue.go`.
 *
 * Eight points to the baht comes from the one price the product already has:
 * a draft is 300 points or ฿39.
 */
const POINTS_PER_BAHT = 8;
/** One page of the points ledger — matches `pointsPageSize` on the API. */
const POINTS_PAGE_SIZE = 30;
const REDEMPTION_TIERS = [50, 100, 300];
/**
 * Minting discount codes from points is closed pending Phase 6, exactly as it
 * is on the API (`domain.RedemptionOpen`). Mock mode has to show the same shut
 * door, or the demo sells something the real product refuses.
 * See docs/phase-6-points-economy.md.
 */
const REDEMPTION_OPEN = false;

/** Same shape as the API's — readable off a screen, typable on a phone. */
function mockDiscountCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'ROVE-';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** The frame a copied plan is reshaped to (A11.4). */
function adaptRequestOf(source: TripRecord, input: AdaptInput): AdaptRequest {
  return {
    days: input.days,
    partySize: input.partySize,
    fromPartySize: source.trip.partySize,
    // The traveller thinks in baht, the plan is priced in yen.
    budgetPerPersonDest: input.budgetPerPersonThb
      ? input.budgetPerPersonThb / (source.trip.fxRate || 0.235)
      : 0,
  };
}

function diffOf(outcome: AdaptOutcome, currency: string): AdaptDiff {
  return {
    changes: outcome.changes,
    before: outcome.before,
    after: outcome.after,
    warnings: outcome.warnings,
    currency,
  };
}

function adaptDiffOf(source: TripRecord, input: AdaptInput): AdaptDiff {
  return diffOf(adaptPlan(source.days, adaptRequestOf(source, input)), source.trip.destCurrency);
}

/**
 * What a trip is *about*, for the match score (A11.3).
 *
 * The API reads areas and POI tags out of the plan; the mock records carry the
 * same information as cities and item areas, so the two agree on any trip a
 * UAT session can produce.
 */
function matchTagsOf(record: TripRecord, includeWishlist: boolean) {
  const tags = [...record.trip.cities];
  for (const day of record.days) {
    for (const item of day.items) if (item.area) tags.push(item.area);
  }
  if (includeWishlist) {
    for (const wish of record.wishlist) {
      if (wish.kind === 'avoid') continue;
      tags.push(...(wish.tags ?? []));
    }
  }
  return tags;
}

function matchProfileOf(record: TripRecord, includeWishlist = false): MatchProfile {
  return {
    // Mock records carry no ISO country code, so country is left unset — every
    // seeded plan is in the same place and the filter would only ever tie.
    startDate: record.trip.startDate,
    days: record.trip.nights + 1,
    budgetPerPersonThb: record.trip.budgetPerPersonThb,
    partySize: record.trip.partySize,
    tags: matchTagsOf(record, includeWishlist),
  };
}

/* -------------------------------------------------------- variants (M6) -- */

/** Mirrors the API's variantFlavours — pace really changes the itinerary. */
const VARIANT_FLAVOURS = [
  {
    pace: 'balanced' as const,
    itemsPerDay: 4,
    label: 'สมดุล',
    key: 'เก็บที่สำคัญให้ครบ โดยไม่ต้องรีบ',
    pros: ['สมดุลระหว่างเก็บที่เที่ยวกับเวลาพัก', 'เหมาะกับกลุ่มที่จังหวะต่างกัน'],
    cons: ['ไม่สุดสักทาง ถ้ากลุ่มอยากได้แนวชัดๆ'],
  },
  {
    pace: 'relaxed' as const,
    itemsPerDay: 3,
    label: 'สายชิล',
    key: 'วันละไม่กี่ที่ มีเวลานั่งคาเฟ่และเดินเล่น',
    pros: ['ไม่เหนื่อย มีเวลาซึมซับแต่ละที่', 'เผื่อเวลาหลงทาง/ต่อคิวได้สบาย'],
    cons: ['อาจเก็บ must-do ได้ไม่ครบ'],
  },
  {
    pace: 'packed' as const,
    itemsPerDay: 6,
    label: 'จัดเต็ม',
    key: 'อัดให้ครบทุกอย่างที่กลุ่มอยากไป',
    pros: ['เก็บครบทุกอย่างที่กลุ่มอยากไป', 'คุ้มค่าตั๋วเครื่องบินที่สุด'],
    cons: ['เหนื่อย — วันเริ่มเช้าและจบดึก', 'เวลาแต่ละที่จำกัด'],
  },
];

function variantVotesOf(record: TripRecord, variantId: string, meId: string) {
  const votes = record.votes.filter(
    (v) => v.targetType === 'variant' && v.targetId === variantId,
  );
  return {
    up: votes.filter((v) => v.value > 0).length,
    down: votes.filter((v) => v.value < 0).length,
    mine: (votes.find((v) => v.memberId === meId)?.value ?? 0) as -1 | 0 | 1,
  };
}

function variantOut(record: TripRecord, v: VariantRecord, meId: string): PlanVariant {
  return {
    id: v.id,
    label: v.label,
    keyDecision: v.keyDecision,
    summary: v.summary,
    source: v.source,
    createdBy: v.createdBy,
    createdAt: v.createdAt,
    fromDayIndex: v.fromDayIndex,
    pros: [...v.pros],
    cons: [...v.cons],
    metrics: variantMetricsOf(v.days, record.wishlist, record.trip.fxRate),
    votes: variantVotesOf(record, v.id, meId),
    days: clone(v.days),
  };
}

/** A frozen plan does not move — the same rule the API enforces (A6.4). */
function assertUnfrozen(record: TripRecord) {
  if (record.trip.status === 'ready') {
    throw new Error('แพลนถูกสรุปแล้ว — เจ้าของทริปต้องปลดล็อกก่อนถึงจะแก้ได้');
  }
}

/** Drafts one candidate per flavour by pacing the canned itinerary. */
function startVariantsJob(record: TripRecord, job: AiJob, count: number) {
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    const current = runningJobs.get(job.id);
    if (!current) return;

    if (tick >= AI_STEPS.length + 1) {
      clearInterval(timer);
      jobTimers.delete(job.id);

      mutate((db) => {
        const fresh = tripRecord(db, record.trip.id);
        for (const flavour of VARIANT_FLAVOURS.slice(0, count)) {
          const days = draftFor(fresh).map((day) => ({
            ...day,
            items: day.items.slice(0, flavour.itemsPerDay),
          }));
          fresh.variants.push({
            id: mockId('var'),
            label: flavour.label,
            keyDecision: flavour.key,
            summary: '',
            source: 'ai',
            createdBy: db.user.id,
            createdAt: nowIso(),
            fromDayIndex: 0,
            pros: [...flavour.pros],
            cons: [...flavour.cons],
            days,
          });
        }
        log(fresh, db.user.id, `AI ร่างแพลน ${count} แบบมาเทียบกันแล้ว`);
      });

      emit({
        ...current,
        status: 'done',
        progress: 1,
        step: `ได้ ${count} แบบ`,
        finishedAt: nowIso(),
      });
      return;
    }

    emit({
      ...current,
      status: 'running',
      progress: tick / (AI_STEPS.length + 1),
      step: `กำลังร่างหลายแบบ — ${AI_STEPS[Math.min(tick - 1, AI_STEPS.length - 1)]!}`,
    });
  }, 700);

  jobTimers.set(job.id, timer);
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
            country: input.country ?? 'JP',
            cities: cities.length > 0 ? cities : (input.cities ?? []),
            startDate: start,
            endDate: end,
            nights: start && end ? Math.max(0, daysBetween(start, end) - 1) : 0,
            partySize: input.partySize ?? 1,
            status: 'planning',
            cover: DEFAULT_COVER,
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
          // The cover rides on the same PATCH as the frame, but the feed reads
          // better when it says which of the two actually changed.
          const coverOnly = patch.cover !== undefined && Object.keys(patch).length === 1;
          log(record, db.user.id, coverOnly ? 'เปลี่ยนรูปปกทริป' : 'แก้กรอบทริป');
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
          copy.flights = [];
          copy.expenses = [];
          copy.comments = [];
          copy.activity = [];
          // Someone else's memories and someone else's tickets do not travel
          // with a copied plan (M18/M19).
          copy.photos = [];
          copy.documents = [];
          copy.polls = [];
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

    async preview() {
      // No real token lookup in mock mode — the landing page always previews
      // the one demo trip a token could plausibly point at.
      return delay(
        mutate((db) => {
          const record = db.trips[0]!;
          const expires = new Date();
          expires.setDate(expires.getDate() + 7);
          return {
            tripId: record.trip.id,
            title: record.trip.title,
            role: 'editor' as const,
            expiresAt: expires.toISOString(),
          };
        }),
      );
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
        delete record.profiles[memberId];
        record.trip.partySize = record.members.length;
      });
      return delay(undefined);
    },

    /* -------------------------------------------- member profiles (A3.1) */

    async myProfile(tripId) {
      const db = loadDb();
      const record = tripRecord(db, tripId);
      const saved = record.profiles[db.user.id];
      if (saved) return delay(clone(saved));
      return delay({
        userId: db.user.id,
        visitedBefore: false,
        pace: 'balanced' as const,
        walkLevel: 2 as const,
        canDrive: false,
        hasIdp: false,
        budgetMinThb: 0,
        budgetMaxThb: 0,
        dietary: [],
        notes: '',
        filled: false,
      });
    },

    async saveProfile(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const profile = { ...input, userId: db.user.id, filled: true };
          record.profiles[db.user.id] = profile;
          return clone(profile);
        }),
      );
    },

    async profiles(tripId) {
      return delay(mutate((db) => clone(Object.values(tripRecord(db, tripId).profiles))));
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
          assertUnfrozen(record);
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
          assertUnfrozen(record);
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
          assertUnfrozen(record);
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
        assertUnfrozen(record);
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
          assertUnfrozen(record);
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

    /* ------------------------------------------- variants & compare (M6) */

    async variants(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          return {
            current: variantMetricsOf(record.days, record.wishlist, record.trip.fxRate),
            frozen: record.trip.status === 'ready',
            variants: record.variants.map((v) => variantOut(record, v, db.user.id)),
          };
        }),
      );
    },

    async forkVariant(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          if (record.days.length === 0) {
            throw new Error('ยังไม่มีแพลนให้แตกตัวเลือก — ร่างแพลนก่อน');
          }
          const variant: VariantRecord = {
            id: mockId('var'),
            label: input.label || 'ตัวเลือกใหม่',
            keyDecision: input.keyDecision ?? '',
            summary: '',
            source: 'fork',
            createdBy: db.user.id,
            createdAt: nowIso(),
            fromDayIndex: 0,
            pros: [],
            cons: [],
            days: clone(record.days),
          };
          record.variants.push(variant);
          log(record, db.user.id, `เก็บแพลนปัจจุบันเป็นตัวเลือก "${variant.label}"`);
          return variantOut(record, variant, db.user.id);
        }),
      );
    },

    async generateVariants(tripId, input) {
      const job = mutate((db) => {
        const record = tripRecord(db, tripId);
        assertUnfrozen(record);
        const quota = record.ai.included + record.ai.extra;
        if (record.ai.used + input.count > quota) {
          throw new Error(
            `ร่าง ${input.count} แบบใช้ ${input.count} สิทธิ์ แต่โควตาเหลือไม่พอ — ซื้อเพิ่มก่อน`,
          );
        }
        record.ai.used += input.count;
        log(record, db.user.id, `ให้ AI ร่างแพลน ${input.count} แบบมาเทียบกัน`);

        const created: AiJob = {
          id: mockId('job'),
          tripId,
          kind: 'variants',
          status: 'queued',
          progress: 0,
          step: 'เข้าคิว',
          createdAt: nowIso(),
        };
        runningJobs.set(created.id, created);
        queueMicrotask(() => startVariantsJob(record, created, input.count));
        return clone(created);
      });
      return delay(job, 200);
    },

    async voteVariant(tripId, variantId, value) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.votes = record.votes.filter(
            (v) =>
              !(v.targetType === 'variant' && v.targetId === variantId && v.memberId === db.user.id),
          );
          if (value !== 0) {
            record.votes.push({
              targetType: 'variant',
              targetId: variantId,
              memberId: db.user.id,
              value,
            });
          }
          return variantVotesOf(record, variantId, db.user.id);
        }),
      );
    },

    async adoptVariant(tripId, variantId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          assertUnfrozen(record);
          const variant = record.variants.find((v) => v.id === variantId);
          if (!variant) throw new Error('ไม่พบตัวเลือกนี้');

          record.days = validateDays(clone(variant.days));
          record.wishlist = recomputeCoverage(record.wishlist, record.days);
          record.budgetLines = budgetFromPlan(record.days, record.trip.partySize, record.budgetLines);
          record.itemsWithoutCost = record.days
            .flatMap((d) => d.items)
            .filter((i) => !i.costJpy).length;
          log(record, db.user.id, `สลับมาใช้แพลน "${variant.label}"`);
          return clone(record.days);
        }),
        260,
      );
    },

    async removeVariant(tripId, variantId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        record.variants = record.variants.filter((v) => v.id !== variantId);
      });
      return delay(undefined);
    },

    async freeze(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.trip.status = 'ready';
          log(record, db.user.id, 'สรุปแพลนแล้ว — ตกลงตามนี้ 🎉');
          return clone(record.trip);
        }),
      );
    },

    async unfreeze(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.trip.status = 'planning';
          log(record, db.user.id, 'ปลดล็อกแพลนกลับมาแก้ต่อ');
          return clone(record.trip);
        }),
      );
    },

    async conflicts(tripId) {
      const db = loadDb();
      const record = tripRecord(db, tripId);
      const nameOf = (id: string) => record.members.find((m) => m.id === id)?.name ?? 'สมาชิก';
      return delay(
        detectConflicts(
          Object.values(record.profiles).map((p) => ({ ...p, name: nameOf(p.userId) })),
          record.wishlist.map((w) => ({ ...w, ownerName: nameOf(w.memberId) })),
        ),
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
          // The checklist follows the destination, like the API's (M23).
          for (const template of prepTemplateFor(record.trip.country)) {
            if (existing.has(template.title)) continue;
            record.prep.push({ ...template, id: mockId('p'), done: false });
          }
          log(record, db.user.id, 'ดึงเช็กลิสต์เตรียมตัวมาใช้');
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
          assertUnfrozen(record);
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

    async buyCredits(tripId, input) {
      // No payment gateway in mock mode — the sheet always succeeds and the
      // caller is told the charge was simulated. The receipt, however, is real:
      // it is written to the same order log live mode keeps (M20).
      const quantity = Math.max(1, input.quantity);
      const points = input.method === 'points' ? AI_CREDITS.pointsPerRun * quantity : 0;

      return delay(
        mutate((db) => {
          if (points > 0 && db.user.points < points) throw new Error('แต้มไม่พอ');

          const record = tripRecord(db, tripId);
          record.ai.extra += quantity;
          if (points > 0) {
            addPoints(db, -points, 'ai_draft', `ร่างแพลนด้วย AI เพิ่ม ${quantity} ครั้ง`, tripId);
          }

          const order = buildOrder(
            mockId('ord'),
            {
              kind: 'ai_credit',
              title: `ร่างแพลนด้วย AI เพิ่ม ${quantity} ครั้ง`,
              lineLabel: `สิทธิ์ให้ AI ร่างแพลน (ทริป${record.trip.title})`,
              quantity,
              unitAmountThb: AI_META.pricePerDraftThb,
              method: input.method,
              methodLabel: input.channel,
              pointsSpent: points,
              tripId,
              tripTitle: record.trip.title,
              issuedAt: nowIso(),
            },
            db.orders,
          );
          db.orders.push(order);

          log(record, db.user.id, `ซื้อโควตาร่างเพิ่ม ${quantity} ครั้ง (${input.channel})`);
          return {
            used: record.ai.used,
            included: record.ai.included,
            extra: record.ai.extra,
            pricePerDraftThb: AI_META.pricePerDraftThb,
            payChannels: AI_META.payChannels,
            simulated: order.simulated,
            order: clone(order),
          };
        }),
        700,
      );
    },
  },

  /* ----------------------------------------------------------- billing -- */
  billing: {
    async summary() {
      const db = loadDb();
      const paid = db.orders.filter((o) => o.status === 'paid');
      const issued = paid.map((o) => o.issuedAt).sort();

      return delay({
        orders: paid.length,
        aiDraftsPurchased: paid
          .filter((o) => o.kind === 'ai_credit')
          .reduce((sum, o) => sum + o.lines.reduce((n, line) => n + line.quantity, 0), 0),
        totalSpentThb: paid.reduce((sum, o) => sum + o.totalThb, 0),
        pointsSpent: paid.reduce((sum, o) => sum + o.pointsSpent, 0),
        since: issued[0] ?? null,
        subscription: clone(db.subscription),
      });
    },

    async orders() {
      const db = loadDb();
      return delay(clone(db.orders).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)));
    },

    async order(orderId) {
      const found = loadDb().orders.find((o) => o.id === orderId);
      return delay(found ? clone(found) : null);
    },

    async subscription() {
      return delay(clone(loadDb().subscription));
    },

    async plans() {
      return delay(clone(PLANS), 80);
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
            findPublished(db, tokenOrSlug) ?? db.trips[0];
          if (!record) return null;
          record.share.viewCount += 1;
          return {
            trip: clone(record.trip),
            days: clone(record.days),
            members: clone(record.members),
            creator: creatorOf(db, record),
            viewCount: record.share.viewCount,
            cloneCount: record.share.cloneCount,
            reviews: summariseReviews(record.reviews),
            reviewEntries: clone(record.reviews),
          };
        }),
      );
    },

    /* --------------------------------------------- public model (M11) -- */

    async explore(filters) {
      const db = loadDb();
      let records = [...db.publicTrips, ...db.trips.filter((t) => t.share.visibility === 'public')];

      if (filters.country) {
        // Seeded records carry no country code; match on the cities instead.
        const q = filters.country.toLowerCase();
        records = records.filter(
          (r) =>
            r.trip.cities.some((c) => c.toLowerCase().includes(q)) ||
            r.trip.title.toLowerCase().includes(q),
        );
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        records = records.filter(
          (r) =>
            r.trip.title.toLowerCase().includes(q) ||
            r.trip.cities.some((c) => c.toLowerCase().includes(q)),
        );
      }

      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 12;

      // Ranked against one of my own trips (A11.3). The API scores a window of
      // the catalogue in Go for the same reason: the score is not a column.
      if (filters.match) {
        const mine = db.trips.find((t) => t.trip.id === filters.match);
        if (!mine) throw new Error('ไม่พบทริปที่ใช้เทียบ');

        const want = matchProfileOf(mine, true);
        const scored = records
          .filter((r) => r.trip.id !== mine.trip.id)
          .map((r) => ({ record: r, match: scoreMatch(want, matchProfileOf(r)) }))
          .filter((row) => row.match.score > 0)
          .sort(
            (a, b) =>
              b.match.score - a.match.score ||
              b.record.share.viewCount +
                b.record.share.cloneCount * 5 -
                (a.record.share.viewCount + a.record.share.cloneCount * 5),
          );

        return delay({
          items: scored
            .slice(offset, offset + limit)
            .map((row) => ({ ...exploreOf(db, row.record), match: row.match })),
          total: scored.length,
        });
      }

      records.sort((a, b) =>
        filters.sort === 'new'
          ? b.trip.startDate.localeCompare(a.trip.startDate)
          : b.share.viewCount +
            b.share.cloneCount * 5 -
            (a.share.viewCount + a.share.cloneCount * 5),
      );

      return delay({
        items: records.slice(offset, offset + limit).map((r) => exploreOf(db, r)),
        total: records.length,
      });
    },

    async creator(handle) {
      const db = loadDb();
      const mine = db.user.handle === handle;
      const records = mine
        ? db.trips.filter((t) => t.share.visibility === 'public')
        : db.publicTrips.filter((t) => t.creator?.handle === handle);
      if (!mine && records.length === 0) return delay(null);

      const first = records[0];
      const identity = mine
        ? { name: db.user.name, handle, characterId: db.user.characterId }
        : (first?.creator ?? { name: 'นักเดินทาง', handle, characterId: 'shiba' });

      return delay({
        ...identity,
        publicTrips: records.length,
        totalViews: records.reduce((sum, r) => sum + r.share.viewCount, 0),
        totalClones: records.reduce((sum, r) => sum + r.share.cloneCount, 0),
        pointsEarned: mine ? db.user.points : records.length * 500,
        trips: records.map((r) => exploreOf(db, r)),
      });
    },

    async cloneFromPublic(tokenOrSlug) {
      return delay(
        mutate((db) => {
          const source = findPublished(db, tokenOrSlug);
          if (!source) throw new Error('ไม่พบแพลนนี้');

          const copy = clone(source);
          copy.trip = {
            ...copy.trip,
            id: mockId('trip'),
            title: `${copy.trip.title} (ตามรอย)`,
            status: 'planning',
          };
          copy.role = 'owner';
          copy.members = [
            {
              id: db.user.id,
              name: db.user.name,
              role: 'owner',
              characterId: db.user.characterId,
              hasWishlist: false,
            },
          ];
          copy.creator = undefined;
          // The API copies days and items, never the legs: you have copied
          // someone's itinerary, you have not booked their flights. The frame
          // keeps its dates; the route starts empty for this group to fill in.
          copy.flights = [];
          copy.expenses = [];
          copy.settled = [];
          copy.comments = [];
          copy.activity = [];
          copy.votes = [];
          copy.variants = [];
          copy.versions = [];
          copy.bookings = [];
          copy.photos = [];
          copy.documents = [];
          copy.polls = [];
          copy.profiles = {};
          copy.ai = { used: 0, included: 2, extra: 0 };
          copy.share = {
            visibility: 'private',
            shareToken: null,
            shareUrl: null,
            publicSlug: null,
            viewCount: 0,
            cloneCount: 0,
          };
          source.share.cloneCount += 1;
          log(copy, db.user.id, `เที่ยวตามแพลน "${source.trip.title}"`);
          db.trips.unshift(copy);
          return clone(copy.trip);
        }),
        320,
      );
    },

    async adaptPreview(tokenOrSlug, input) {
      const db = loadDb();
      const source = findPublished(db, tokenOrSlug);
      if (!source) throw new Error('ไม่พบแพลนนี้');

      return delay(adaptDiffOf(source, input));
    },

    async cloneAdapted(tokenOrSlug, input) {
      const trip = await this.cloneFromPublic(tokenOrSlug);

      return delay(
        mutate((db) => {
          const source = findPublished(db, tokenOrSlug);
          const copy = db.trips.find((t) => t.trip.id === trip.id);
          if (!source || !copy) throw new Error('ไม่พบแพลนนี้');

          const outcome = adaptPlan(copy.days, adaptRequestOf(source, input));
          const start = input.startDate || copy.trip.startDate;

          copy.days = outcome.days.map((day, i) => ({
            ...day,
            id: day.id.startsWith('adapt-blank') ? mockId('day') : day.id,
            date: addDays(start, i),
          }));
          copy.trip = {
            ...copy.trip,
            startDate: start,
            endDate: addDays(start, Math.max(0, copy.days.length - 1)),
            nights: Math.max(0, copy.days.length - 1),
            partySize: input.partySize || copy.trip.partySize,
            budgetPerPersonThb: input.budgetPerPersonThb || copy.trip.budgetPerPersonThb,
          };

          return {
            trip: clone(copy.trip),
            diff: diffOf(outcome, source.trip.destCurrency),
          };
        }),
        320,
      );
    },

    /* ------------------------------------ platform social proof (M24) -- */

    async platformStats() {
      const db = loadDb();
      const published = [
        ...db.publicTrips,
        ...db.trips.filter((t) => t.share.visibility === 'public'),
      ];
      const reviews = [...db.trips, ...db.publicTrips].flatMap((t) => t.reviews);

      // Counted off the seeded catalogue rather than invented: mock mode's
      // numbers are small, and the landing section is supposed to hide itself
      // on numbers this small (W24.1). Pretending otherwise here would make
      // that rule untestable.
      return delay({
        planners: new Set(published.map((r) => r.creator?.handle ?? db.user.handle)).size,
        publicTrips: published.length,
        clones: published.reduce((sum, r) => sum + r.share.cloneCount, 0),
        reviews: reviews.length,
        averageRating:
          reviews.length === 0
            ? 0
            : Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10,
        computedAt: nowIso(),
      });
    },

    async recentReviews() {
      const db = loadDb();
      const published = [
        ...db.publicTrips,
        ...db.trips.filter((t) => t.share.visibility === 'public'),
      ];

      return delay(
        published
          .flatMap((record) =>
            // A rating with no words is counted by the summary and never
            // quoted — printing it would be putting words in someone's mouth.
            record.reviews
              .filter((review) => review.body.trim() !== '')
              .map((review) => ({
                tripId: record.trip.id,
                tripTitle: record.trip.title,
                tripSlug: record.share.publicSlug ?? '',
                country: '',
                rating: review.rating,
                body: review.body,
                actualBudgetPerPerson: review.actualBudgetPerPerson,
                name: review.name,
                characterId: review.characterId,
                createdAt: review.createdAt,
              })),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 12),
      );
    },
  },

  /* ----------------------------- points out, money owed (M22) -- */
  rewards: {
    async redemptions() {
      const db = loadDb();
      return delay({
        balance: db.user.points,
        tiers: REDEMPTION_OPEN
          ? REDEMPTION_TIERS.map((amountThb) => ({
              amountThb,
              points: amountThb * POINTS_PER_BAHT,
              afford: db.user.points >= amountThb * POINTS_PER_BAHT,
            }))
          : [],
        codes: clone(db.discountCodes),
      });
    },

    async redeem(amountThb) {
      return delay(
        mutate((db) => {
          if (!REDEMPTION_OPEN) throw new Error('ระบบแลกแต้มเป็นโค้ดส่วนลดปิดปรับปรุงชั่วคราว');
          if (!REDEMPTION_TIERS.includes(amountThb)) throw new Error('เลือกได้เฉพาะมูลค่าที่กำหนดไว้');
          const cost = amountThb * POINTS_PER_BAHT;
          if (db.user.points < cost) throw new Error('แต้มไม่พอ');

          // Points are burned on issue, exactly like the API: a code that
          // exists has already been paid for — and the burn is a ledger row,
          // not a subtraction (A23.1).
          addPoints(db, -cost, 'redeem', `แลกเป็นโค้ดส่วนลด ฿${amountThb.toLocaleString('th-TH')}`, null);
          const code: DiscountCode = {
            code: mockDiscountCode(),
            scope: 'ai_credits',
            amountThb,
            pointsSpent: cost,
            expiresAt: addDays(toIsoDate(new Date()), 180),
            usedAt: null,
            usable: true,
          };
          db.discountCodes.unshift(code);
          return clone(code);
        }),
        220,
      );
    },

    async earnings() {
      const db = loadDb();
      return delay(clone(db.earnings));
    },

    /* ------------------------------- where the points came from (M23) -- */

    async pointsHistory(cursor) {
      const db = loadDb();
      // The same page size and the same cursor shape as the API, so the "ดู
      // เพิ่ม" button is exercised in mock mode instead of only in live.
      //
      // A cursor that matches nothing ends the walk rather than restarting it:
      // `findIndex` returns -1, and treating that as "start from the top"
      // would hand the first page back forever while the infinite query kept
      // appending it.
      const at = cursor ? db.pointsLedger.findIndex((row) => row.id === cursor) : -1;
      const start = at + 1;
      // Totals are over the whole ledger, not over the page — the same two
      // figures the API returns with every page.
      const totals = {
        balance: db.pointsLedger.reduce((sum, row) => sum + row.delta, 0),
        earned: db.pointsLedger.reduce((sum, row) => sum + Math.max(0, row.delta), 0),
      };

      if (cursor && at < 0) {
        return delay({ ...totals, entries: [], nextCursor: '' });
      }

      const page = db.pointsLedger.slice(start, start + POINTS_PAGE_SIZE);
      const next = db.pointsLedger[start + POINTS_PAGE_SIZE];

      return delay({
        ...totals,
        entries: clone(page),
        nextCursor: next ? (page[page.length - 1]?.id ?? '') : '',
      });
    },

    async audience() {
      const db = loadDb();
      const published = db.trips.filter((t) => t.share.visibility === 'public');

      // What each published plan earned, read back out of the ledger rather
      // than kept as a second counter.
      const earnedBy = (tripId: string) =>
        db.pointsLedger.filter((row) => row.reason === 'trip_cloned' && row.tripId === tripId);

      const trips = published
        .map((record) => {
          const awards = earnedBy(record.trip.id);
          return {
            tripId: record.trip.id,
            title: record.trip.title,
            slug: record.share.publicSlug ?? '',
            views: record.share.viewCount,
            clones: record.share.cloneCount,
            awardedClones: awards.length,
            pointsEarned: awards.reduce((sum, row) => sum + row.delta, 0),
          };
        })
        .sort((a, b) => b.clones - a.clones || b.views - a.views);

      return delay({
        totalViews: trips.reduce((sum, t) => sum + t.views, 0),
        totalClones: trips.reduce((sum, t) => sum + t.clones, 0),
        pointsEarned: trips.reduce((sum, t) => sum + t.pointsEarned, 0),
        publicTrips: trips.length,
        topTripId: trips[0]?.tripId ?? '',
        trips,
      });
    },
  },

  leads: {
    async list(tripId) {
      return delay(mutate((db) => clone(tripRecord(db, tripId).leads)));
    },

    async create(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          if (!input.contactPhone && !input.contactLine) {
            throw new Error('ใส่เบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งอย่าง');
          }

          const lead: AgentLead = {
            id: mockId('lead'),
            partner: 'ROVE Agent',
            contactName: input.contactName,
            contactPhone: input.contactPhone ?? '',
            contactLine: input.contactLine ?? '',
            note: input.note ?? '',
            status: 'new',
            sentAt: null,
            createdAt: nowIso(),
            // Mock mode has no agent inbox to send to, and says so rather than
            // pretending somebody was messaged.
            simulated: true,
          };
          record.leads.unshift(lead);
          log(record, db.user.id, 'ขอให้เอเจนต์ช่วยจัดทริปนี้');
          return clone(lead);
        }),
        260,
      );
    },
  },

  /* ----------------------------------------------- reviews (M21) -- */
  reviews: {
    async list(tripId) {
      return delay(mutate((db) => reviewBoardOf(db, tripRecord(db, tripId))));
    },

    async save(tripId, input) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          if (!tripIsOver(record)) throw new Error('รีวิวได้หลังทริปจบแล้วเท่านั้น');
          if (input.rating < 1 || input.rating > 5) throw new Error('ให้ดาว 1–5 ดวง');

          const mine: TripReview = {
            userId: db.user.id,
            name: db.user.name,
            characterId: db.user.characterId,
            rating: input.rating,
            actualBudgetPerPerson: input.actualBudgetPerPerson ?? 0,
            body: input.body ?? '',
            createdAt: nowIso(),
          };
          // Upsert, like the unique index on the API side: saving again
          // replaces my review rather than adding a second opinion.
          record.reviews = [mine, ...record.reviews.filter((r) => r.userId !== db.user.id)];

          return reviewBoardOf(db, record);
        }),
        200,
      );
    },

    async remove(tripId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          record.reviews = record.reviews.filter((r) => r.userId !== db.user.id);
        }),
      );
    },
  },

  /* ------------------------------------------------ photos (M18) -- */
  photos: {
    async list(tripId, filter) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          return record.photos
            .filter(
              (p) =>
                (!filter?.dayId || p.dayId === filter.dayId) &&
                (!filter?.itemId || p.itemId === filter.itemId) &&
                (!filter?.userId || p.userId === filter.userId),
            )
            .map((p) => clone(p));
        }),
      );
    },

    async upload(tripId, input) {
      // No bucket in mock mode: the resized file becomes an object URL that
      // lives as long as the tab does. Reloading loses the picture but keeps
      // the row, which is exactly what the empty state is for.
      const url = typeof URL === 'undefined' ? '' : URL.createObjectURL(input.file);

      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const photo: TripPhoto = {
            id: mockId('ph'),
            tripId,
            dayId: input.dayId ?? null,
            itemId: input.itemId ?? null,
            userId: db.user.id,
            url,
            caption: input.caption ?? '',
            takenAt: null,
            createdAt: nowIso(),
          };
          // An item pins the photo to its day too, same as the API does.
          if (input.itemId) {
            const day = record.days.find((d) => d.items.some((i) => i.id === input.itemId));
            if (day) photo.dayId = day.id;
          }
          record.photos.push(photo);
          log(record, db.user.id, 'อัปโหลดรูปใหม่');
          return clone(photo);
        }),
        400,
      );
    },

    async remove(tripId, photoId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        const photo = record.photos.find((p) => p.id === photoId);
        if (photo && photo.userId !== db.user.id && record.role !== 'owner') {
          throw new Error('ลบได้เฉพาะรูปของตัวเอง');
        }
        if (photo?.url.startsWith('blob:') && typeof URL !== 'undefined') {
          URL.revokeObjectURL(photo.url);
        }
        record.photos = record.photos.filter((p) => p.id !== photoId);
      });
      return delay(undefined);
    },

    async photoBookThemes() {
      // The same three the API ships, so the picker looks identical in both
      // modes. Mirrors pkg/domain/photobook.go.
      return delay([
        { id: 'paper', name: 'กระดาษ', paper: '#FFFFFF', ink: '#3D2B24', muted: '#6B5B4E', accent: '#D9714E' },
        { id: 'ink', name: 'หมึกเข้ม', paper: '#1C1714', ink: '#F5EFE9', muted: '#A2938A', accent: '#E49A81' },
        { id: 'film', name: 'ฟิล์ม', paper: '#F3EEE5', ink: '#2E2A24', muted: '#7A7266', accent: '#8BA07A' },
      ]);
    },

    photoBookUrl(tripId, options) {
      // Mock mode has no server to render it; the screen turns this into the
      // browser's own print dialog instead. The options ride along so the
      // print view can honour them.
      const params = new URLSearchParams({ print: '1' });
      if (options?.theme) params.set('theme', options.theme);
      if (options?.coverPhotoId) params.set('cover', options.coverPhotoId);
      return `/t/${tripId}/photos?${params.toString()}`;
    },
  },

  /* --------------------------------------------- documents (M19) -- */
  documents: {
    async list(tripId) {
      return delay(mutate((db) => tripRecord(db, tripId).documents.map((d) => clone(d))));
    },

    async upload(tripId, input) {
      const url = typeof URL === 'undefined' ? '' : URL.createObjectURL(input.file);

      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const doc: TripDocument = {
            id: mockId('doc'),
            tripId,
            userId: db.user.id,
            name: input.name || input.file.name,
            category: input.category,
            url,
            contentType: input.file.type,
            sizeBytes: input.file.size,
            createdAt: nowIso(),
          };
          record.documents.unshift(doc);
          log(record, db.user.id, `เพิ่มเอกสาร "${doc.name}"`);
          return clone(doc);
        }),
        400,
      );
    },

    async remove(tripId, documentId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        const doc = record.documents.find((d) => d.id === documentId);
        if (doc && doc.userId !== db.user.id && record.role !== 'owner') {
          throw new Error('ลบได้เฉพาะเอกสารที่ตัวเองอัปโหลด');
        }
        if (doc?.url.startsWith('blob:') && typeof URL !== 'undefined') {
          URL.revokeObjectURL(doc.url);
        }
        record.documents = record.documents.filter((d) => d.id !== documentId);
      });
      return delay(undefined);
    },
  },

  /* --------------------------------------------- community (M9) -- */
  community: {
    async inbox() {
      const db = loadDb();
      const items = [...db.notifications].reverse();
      return delay({
        unread: items.filter((n) => !n.read).length,
        items: items.map((n) => clone(n)),
      });
    },

    async markRead(notificationId) {
      return delay(
        mutate((db) => {
          for (const n of db.notifications) {
            if (!notificationId || n.id === notificationId) n.read = true;
          }
          const items = [...db.notifications].reverse();
          return {
            unread: items.filter((n) => !n.read).length,
            items: items.map((n) => clone(n)),
          };
        }),
      );
    },

    async polls(tripId) {
      return delay(
        mutate((db) => tripRecord(db, tripId).polls.map((p) => pollWithTally(db, p))),
      );
    },

    async createPoll(tripId, input) {
      const options = input.options.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) throw new Error('ใส่ตัวเลือกอย่างน้อย 2 อย่าง');
      if (options.length > 6) throw new Error('ตัวเลือกเยอะเกินไป — เอาไม่เกิน 6 อย่าง');

      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const poll: Poll = {
            id: mockId('poll'),
            question: input.question.trim(),
            itemId: input.itemId ?? null,
            options: options.map((label, index) => ({ index, label, votes: 0, who: [] })),
            closed: false,
            closesAt: null,
            createdBy: db.user.id,
            createdAt: nowIso(),
            myAnswer: -1,
            answered: 0,
          };
          record.polls.unshift(poll);
          log(record, db.user.id, `เปิดโพล "${poll.question}"`);
          return pollWithTally(db, poll);
        }),
      );
    },

    async answerPoll(tripId, pollId, option) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const poll = record.polls.find((p) => p.id === pollId);
          if (!poll) throw new Error('ไม่พบโพลนี้');
          if (poll.closed) throw new Error('โพลนี้ปิดไปแล้ว');
          if (option < -1 || option >= poll.options.length) throw new Error('ไม่มีตัวเลือกนี้');

          // Answers live in the votes list, exactly as they do in the API.
          record.votes = record.votes.filter(
            (v) => !(v.targetType === 'poll' && v.targetId === pollId && v.memberId === db.user.id),
          );
          if (option >= 0) {
            record.votes.push({
              targetType: 'poll',
              targetId: pollId,
              memberId: db.user.id,
              // The option index rides in `value`, same as the API.
              value: option,
            });
          }
          return pollWithTally(db, poll);
        }),
      );
    },

    async closePoll(tripId, pollId) {
      return delay(
        mutate((db) => {
          const record = tripRecord(db, tripId);
          const poll = record.polls.find((p) => p.id === pollId);
          if (!poll) throw new Error('ไม่พบโพลนี้');
          if (poll.createdBy !== db.user.id && record.role !== 'owner') {
            throw new Error('ปิดโพลได้เฉพาะคนที่เปิดหรือเจ้าของทริป');
          }
          poll.closed = true;
          log(record, db.user.id, `ปิดโพล "${poll.question}"`);
          return pollWithTally(db, poll);
        }),
      );
    },

    async removePoll(tripId, pollId) {
      mutate((db) => {
        const record = tripRecord(db, tripId);
        const poll = record.polls.find((p) => p.id === pollId);
        if (poll && poll.createdBy !== db.user.id && record.role !== 'owner') {
          throw new Error('ลบโพลได้เฉพาะคนที่เปิดหรือเจ้าของทริป');
        }
        record.polls = record.polls.filter((p) => p.id !== pollId);
        record.votes = record.votes.filter(
          (v) => !(v.targetType === 'poll' && v.targetId === pollId),
        );
      });
      return delay(undefined);
    },

    async ping() {
      // Nobody else is looking in mock mode, so there is nothing to announce.
      return Promise.resolve();
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
        stubProviders: true,
        stubbed: [...MOCK_STUBBED],
        commit: 'local',
      });
    },
  },

  /* -------------------------------------------------------------- meta -- */
  meta: {
    async mode() {
      // Mock mode does not ask anything: by definition none of it is real and
      // none of it leaves the browser.
      return delay({
        live: false,
        stubbed: [...MOCK_STUBBED],
        devLogin: true,
        env: 'mock',
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
  addPoints(
    db,
    POINTS_PER_PUBLISH,
    'trip_published',
    `เปิดทริป "${title}" เป็นสาธารณะ`,
    record?.trip.id ?? null,
  );
  if (record) log(record, db.user.id, `เปิดทริป "${title}" เป็นสาธารณะ +${POINTS_PER_PUBLISH} แต้ม`);
}

/**
 * The one place mock mode moves points (M23 — A23.1).
 *
 * Writes the ledger row first and then re-derives the balance from it, so the
 * two can never disagree — the same property the API gets from `SUM(delta)`.
 * A screen that shows a balance without a row behind it is exactly what this
 * feature exists to make impossible.
 */
function addPoints(
  db: MockDb,
  delta: number,
  reason: PointsEntry['reason'],
  note: string,
  tripId: string | null,
): PointsEntry {
  const entry: PointsEntry = {
    id: mockId('pt'),
    delta,
    reason,
    note,
    tripId,
    tripTitle: tripId ? (findTripTitle(db, tripId) ?? '') : '',
    occurredAt: nowIso(),
  };
  db.pointsLedger.unshift(entry);
  db.user.points = db.pointsLedger.reduce((sum, row) => sum + row.delta, 0);
  return entry;
}

/** A ledger row names its trip, and keeps the name if the trip goes away. */
function findTripTitle(db: MockDb, tripId: string): string | undefined {
  return (
    db.trips.find((t) => t.trip.id === tripId)?.trip.title ??
    db.publicTrips.find((t) => t.trip.id === tripId)?.trip.title ??
    db.past.find((t) => t.id === tripId)?.title
  );
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
