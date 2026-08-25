/**
 * The app-facing view models.
 *
 * Components and hooks speak these shapes and nothing else. The mock repository
 * produces them from seed data; the live repository maps the Go API's
 * snake_case DTOs into them (lib/data/live/mappers.ts). That mapping is the
 * only place the wire format is allowed to appear, which is what lets the two
 * modes be swapped by an env var instead of a rewrite.
 */

import type {
  BudgetLine,
  ExpenseEntry,
  FlightLegInput,
  Member,
  PlanDay,
  PlanItem,
  RecapDecision,
  RecapSpend,
  Settlement,
  Trip,
  TripStatus,
} from './model';

export type {
  Airport,
  BudgetLine,
  CalendarTrip,
  CountryStay,
  Character,
  CoverageState,
  DreamItem,
  ExpenseEntry,
  ExpenseScope,
  FlightLeg,
  FlightLegInput,
  ItemType,
  LegDirection,
  LegMode,
  Member,
  PastTrip,
  PlanDay,
  PlanItem,
  RecapDecision,
  RecapDecisionKind,
  RecapSpend,
  RouteStop,
  Settlement,
  Trip,
  TripRoute,
  TripStatus,
  WishKind,
  WishlistItem,
  YearStats,
} from './model';

/* ------------------------------------------------------------------ auth -- */

export interface CurrentUser {
  id: string;
  name: string;
  handle: string;
  characterId: string;
  email?: string;
  homeCurrency: string;
  isAdmin: boolean;
  /** Points balance (Phase 2 spends it; Phase 1 just carries it). */
  points: number;
}

export type AuthProvider = 'line' | 'google' | 'demo';

/* -------------------------------------------- date coordination (M2.5) --- */

/** One member's answer for one calendar day. */
export type AvailabilityMark = 'free' | 'maybe' | 'busy';

export interface AvailabilityEntry {
  memberId: string;
  /** ISO date, "2026-12-04". */
  date: string;
  mark: AvailabilityMark;
}

/** Everything the date board needs; computed server-side in live mode. */
export interface AvailabilityBoard {
  tripId: string;
  /** First day of the month the board opens on, "2026-12-01". */
  month: string;
  /** Months the board offers, so the switcher knows where it may go. */
  months: string[];
  members: Member[];
  /** Who has submitted at all — the board nudges the ones who have not. */
  submittedMemberIds: string[];
  entries: AvailabilityEntry[];
  /** Ranked overlaps, best first. */
  windows: DateWindow[];
  locked: LockedDates | null;
}

export interface DateWindow {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  /** Members free on every day of the window. */
  memberIds: string[];
  /** Members with a "maybe" somewhere inside it. */
  maybeMemberIds: string[];
  everyone: boolean;
  /** 0–100: length × coverage × weekend fit. */
  score: number;
  /** Why it scored the way it did — shown under the window chip. */
  reason: string;
}

export interface LockedDates {
  startDate: string;
  endDate: string;
  days: number;
  lockedBy: string;
  lockedAt: string;
  memberIds: string[];
}

/** A candidate destination for the locked window. */
export interface DestinationSuggestion {
  id: string;
  country: string;
  flag: string;
  name: string;
  cities: string[];
  subtitle: string;
  pill: string;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
  budgetPerPersonThb: [number, number];
  reason: string;
  /** 0–100 fit for the locked length + season. */
  fit: number;
  recommended: boolean;
  flightHours: number;
  weather: { high: number; low: number; text: string };
}

/* ------------------------------------------------- member profile (A3.1) -- */

export type TripPace = 'relaxed' | 'balanced' | 'packed';

/**
 * What one member wants out of THIS trip — distinct from their account
 * profile, because the same person is a temple-hopper on one trip and a beach
 * potato on the next. The AI frame and the conflict check (A6.5) read these.
 */
export interface MemberProfile {
  userId: string;
  visitedBefore: boolean;
  pace: TripPace;
  /** 1 = as little as possible, 2 = normal, 3 = happy to hike. */
  walkLevel: 1 | 2 | 3;
  canDrive: boolean;
  hasIdp: boolean;
  budgetMinThb: number;
  budgetMaxThb: number;
  dietary: string[];
  notes: string;
  /** False when this is the default the API synthesised — the tab nudges. */
  filled: boolean;
}

/* -------------------------------------------------------------- coverage -- */

export interface CoverageSummary {
  covered: number;
  partial: number;
  uncovered: number;
  total: number;
  mustCovered: number;
  mustTotal: number;
  percent: number;
}

/* ---------------------------------------------------------------- budget -- */

export interface BudgetSummary {
  lines: BudgetLine[];
  totalJpy: number;
  perPersonJpy: number;
  prepaidJpy: number;
  perPersonThb: number;
  budgetUsed: number;
  remainingThb: number;
  itemsWithoutCost: number;
  fxRate: number;
  fxAsOf: string;
}

/* --------------------------------------------------------------- expense -- */

export interface ExpenseSummary {
  sharedTotalThb: number;
  personalTotalThb: number;
  totalThb: number;
  perMember: {
    member: Member;
    paidThb: number;
    shareThb: number;
    personalThb: number;
    balanceThb: number;
  }[];
  settlements: Settlement[];
  entries: ExpenseEntry[];
}

/* ------------------------------------------------------------------ prep -- */

export type PrepCategory = 'document' | 'packing' | 'booking' | 'money' | 'health' | 'other';

export interface PrepTask {
  id: string;
  title: string;
  category: PrepCategory;
  /** null = the whole group. */
  assigneeId: string | null;
  dueDate?: string;
  done: boolean;
  note?: string;
  /** Seeded from the template rather than typed by a member. */
  fromTemplate?: boolean;
}

/* --------------------------------------------------------------- booking -- */

export type BookingKind = 'stay' | 'activity' | 'transport' | 'flight' | 'esim' | 'insurance';
export type BookingStatus = 'idea' | 'booked' | 'cancelled';

export interface BookingEntry {
  id: string;
  kind: BookingKind;
  title: string;
  partner: string;
  /** Affiliate deeplink — /go/:id in live mode, a plain URL in mock. */
  url: string;
  status: BookingStatus;
  pricePerPersonThb?: number;
  checkIn?: string;
  checkOut?: string;
  bookedBy?: string;
  confirmationCode?: string;
  note?: string;
}

/* --------------------------------------------------------- collaboration -- */

export type CommentTarget = 'trip' | 'day' | 'item' | 'wish';

export interface Comment {
  id: string;
  targetType: CommentTarget;
  targetId: string;
  memberId: string;
  body: string;
  createdAt: string;
  resolved: boolean;
}

export type VoteTarget = 'item' | 'wish' | 'window' | 'destination' | 'variant' | 'poll';

export interface Vote {
  targetType: VoteTarget;
  targetId: string;
  memberId: string;
  /**
   * ±1 for a thumb on an item or a variant; for a poll it is the chosen
   * option's index. One member's one answer about one thing is the same shape
   * either way, which is why polls do not get a second table (M9 — A9.3).
   */
  value: number;
}

export interface ActivityEvent {
  id: string;
  memberId: string;
  /** Rendered verb — the API sends it already localised. */
  text: string;
  createdAt: string;
  targetType?: string;
  targetId?: string;
}

/* -------------------------------------------------------------------- ai -- */

export type AiJobKind = 'draft' | 'variants' | 'refine' | 'rebalance' | 'suggest_destination';
export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface AiJob {
  id: string;
  tripId: string;
  kind: AiJobKind;
  status: AiJobStatus;
  /** 0–1 for the progress ring. */
  progress: number;
  /** The live step label, e.g. "กำลังจัดวันที่ 3". */
  step: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
  /** Populated once status = done. */
  result?: AiDraftResult;
}

export interface AiDraftResult {
  days: PlanDay[];
  rationales: string[];
  openQuestions: string[];
}

export interface AiCredits {
  used: number;
  included: number;
  extra: number;
  pricePerDraftThb: number;
  /** Channels the payment sheet offers. */
  payChannels: PayChannel[];
}

/**
 * One way to pay. The id is what the receipt records; the label is what the
 * user tapped. They are carried together so the two can never disagree — a
 * receipt that says "บัตรเครดิต" about a PromptPay charge is a support ticket.
 */
export interface PayChannel {
  id: PaymentMethod;
  label: string;
}

export interface AiGenerateInput {
  kind: AiJobKind;
  /** Free-text steer typed in the dialog. */
  brief?: string;
  pace?: 'relaxed' | 'balanced' | 'packed';
  focus?: string[];
}

/* ------------------------------------------------------- variants (M6) -- */

/** The row of numbers the compare table renders per candidate. */
export interface VariantMetrics {
  dayCount: number;
  itemCount: number;
  totalCostJpy: number;
  perPersonThb: number;
  travelMinutes: number;
  coveragePercent: number;
  mustCovered: number;
  mustTotal: number;
  warningCount: number;
}

export interface VariantVotes {
  up: number;
  down: number;
  /** This member's standing vote; 0 = none. */
  mine: -1 | 0 | 1;
}

/**
 * One candidate itinerary (M6). Read-only by design: compared, voted on and
 * adopted — never edited in place. Adopting replaces the live plan.
 */
export interface PlanVariant {
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
  metrics: VariantMetrics;
  votes: VariantVotes;
  days: PlanDay[];
}

export interface VariantList {
  /** The live plan's numbers — the baseline column. */
  current: VariantMetrics;
  /** True once the owner froze the plan (A6.4). */
  frozen: boolean;
  variants: PlanVariant[];
}

/** What the pre-generate conflict check found (A6.5). */
export interface TripConflict {
  kind: 'pace' | 'budget' | 'wish';
  severity: 'error' | 'warning';
  message: string;
}

/* ----------------------------------------------------------------- recap -- */

/**
 * A finished trip, read-only (M17 — W17.5).
 *
 * The room keeps working after the last day, but nobody plans in it any more:
 * what is left is a record of what the group decided, what the plan ended up
 * being, and where the money went. The recap is that record — and the one place
 * that offers to open the trip to the public, because a trip you have already
 * been on is the only kind worth someone else copying.
 */
export interface TripRecap {
  tripId: string;
  title: string;
  cities: string[];
  dateLabel: string;
  cover: string;
  days: number;
  places: number;
  spentThb: number;
  budgetPerPersonThb: number;
  members: Member[];
  itinerary: PlanDay[];
  decisions: RecapDecision[];
  spending: RecapSpend[];
  activity: ActivityEvent[];
  share: ShareState;
  /** What publishing pays, straight from the points ledger's own rate. */
  pointsPerPublish: number;
  /** Owner, and not public yet. */
  canPublish: boolean;
}

/* ------------------------------------------------- community (M9) ------- */

export type NotificationKind = 'mention' | 'assigned' | 'poll_opened' | 'plan_ready' | 'points';

/**
 * One thing that happened *to you*. Distinct from an ActivityEvent, which is
 * what happened in a room: this one has a recipient, can be unread, and is
 * what a badge counts.
 */
export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Where tapping it lands, as an app path. */
  link: string;
  tripId: string | null;
  actorId: string;
  read: boolean;
  createdAt: string;
}

export interface Inbox {
  unread: number;
  items: Notification[];
}

export interface PollOption {
  index: number;
  label: string;
  votes: number;
  /** Member ids, so the card can show faces rather than a bare count. */
  who: string[];
}

/** A question with fixed options — the decisions that are not a whole plan. */
export interface Poll {
  id: string;
  question: string;
  itemId: string | null;
  options: PollOption[];
  closed: boolean;
  closesAt: string | null;
  createdBy: string;
  createdAt: string;
  /** -1 when this member has not answered. */
  myAnswer: number;
  answered: number;
}

export interface CreatePollInput {
  question: string;
  options: string[];
  itemId?: string;
}

/** Who is in the room right now (W9.3) — held in memory, never persisted. */
export interface PresenceMember {
  memberId: string;
  typing: boolean;
  tab: string;
  /** Epoch ms of the last ping; stale entries are dropped by the hook. */
  at: number;
}

/* --------------------------------------------- photos & documents (M18/19) */

/**
 * One picture taken on the trip. `url` is minted per read by the API — the
 * row itself stores a storage key — so it is never persisted client-side.
 */
export interface TripPhoto {
  id: string;
  tripId: string;
  dayId: string | null;
  itemId: string | null;
  /** Who took it; only they (or the owner) may delete it. */
  userId: string;
  url: string;
  caption: string;
  takenAt: string | null;
  createdAt: string;
}

/**
 * A palette the photo book knows how to print (Photo Book V2).
 *
 * The catalogue comes from the API rather than the client so the picker can
 * only ever offer what the renderer supports.
 */
export interface PhotoBookTheme {
  id: string;
  name: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
}

/** How to print the book: which palette, and which photo leads the cover. */
export interface PhotoBookOptions {
  theme?: string;
  coverPhotoId?: string;
}

export interface UploadPhotoInput {
  /** Already resized in the browser (lib/image.ts `photoFromFile`). */
  file: File;
  dayId?: string;
  itemId?: string;
  caption?: string;
}

export type DocumentCategory = 'ticket' | 'hotel' | 'transport' | 'insurance' | 'other';

/** One file the group needs on the road — a ticket, voucher, insurance paper. */
export interface TripDocument {
  id: string;
  tripId: string;
  userId: string;
  name: string;
  category: DocumentCategory;
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UploadDocumentInput {
  file: File;
  name: string;
  category: DocumentCategory;
}

/* ----------------------------------------------------------------- share -- */

export type TripVisibility = 'private' | 'link' | 'public';

/** The public face of whoever published a trip. */
export interface PublicCreator {
  name: string;
  handle: string | null;
  characterId: string;
}

/** What /s/:token and /p/:slug render. Never contains expenses (W16.5). */
export interface PublicTripPayload {
  trip: Trip;
  days: PlanDay[];
  members: Member[];
  creator: PublicCreator;
  viewCount: number;
  cloneCount: number;
  /** How it actually went, from the people who went (A11.5). */
  reviews: ReviewSummary;
  reviewEntries: TripReview[];
}

/* ------------------------------------------------- reviews (M21 — A11.5) - */

/**
 * One traveller's verdict on a finished trip.
 *
 * `actualBudgetPerPerson` is a figure the reviewer chose to publish about
 * their own trip — it is NOT the group's expense ledger, which never leaves
 * the room at any visibility (W16.5). Zero means they would rather not say.
 */
export interface TripReview {
  userId: string;
  name: string;
  characterId: string;
  /** 1–5. */
  rating: number;
  actualBudgetPerPerson: number;
  body: string;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  averageRating: number;
  /** Averaged over `budgetSaid` people, never over everybody. */
  actualBudgetPerPerson: number;
  budgetSaid: number;
}

export interface ReviewBoard {
  summary: ReviewSummary;
  entries: TripReview[];
  /** My own review, so the form opens filled in. */
  mine: TripReview | null;
  /** False until the trip is over — nobody reviews a holiday they are packing for. */
  canReview: boolean;
}

export interface SaveReviewInput {
  rating: number;
  actualBudgetPerPerson?: number;
  body?: string;
}

/* ------------------------------------------------------ explore (M11) --- */

export interface ExploreTrip {
  slug: string;
  title: string;
  cover: string;
  cities: string[];
  country: string;
  days: number;
  budgetPerPersonThb: number;
  viewCount: number;
  cloneCount: number;
  creator: PublicCreator;
  updatedAt: string;
  /** Only present when the feed was asked to rank against one of my trips. */
  match?: MatchResult | null;
  /** Zero until somebody who went says otherwise (A11.5). */
  reviews: ReviewSummary;
}

export interface ExploreFilters {
  q?: string;
  country?: string;
  sort?: 'popular' | 'new';
  limit?: number;
  offset?: number;
  /**
   * Rank against this trip of mine instead of by popularity (A11.3). Requires
   * sign-in and membership of the trip — the feed itself stays public.
   */
  match?: string;
}

/**
 * How well a published plan fits the trip I am already planning (A11.3).
 *
 * The reasons are the point. A percentage with nothing next to it is a number
 * nobody trusts, so the API only sends lines for components that genuinely
 * agree, and the card shows them verbatim.
 */
export interface MatchResult {
  /** 0–100. Zero means "different country" — not a weak match, no match. */
  score: number;
  reasons: string[];
}

/* ---------------------------------------------- adapting a copy (A11.4) -- */

/** The frame a copied plan should be reshaped to. Omitted fields are kept. */
export interface AdaptInput {
  days?: number;
  partySize?: number;
  budgetPerPersonThb?: number;
  startDate?: string;
}

export type AdaptChangeKind = 'day_added' | 'day_removed' | 'item_removed' | 'item_moved';

export interface AdaptChange {
  kind: AdaptChangeKind;
  dayLabel: string;
  itemTitle: string;
  reason: string;
  /** Signed, in the destination currency — the same unit as the plan. */
  costDeltaDest: number;
}

export interface AdaptTotals {
  days: number;
  items: number;
  costPerPersonDest: number;
}

/**
 * What copying this plan into my frame would change. Shown before anything is
 * written, and returned again with the copy so the two can be compared.
 */
export interface AdaptDiff {
  changes: AdaptChange[];
  before: AdaptTotals;
  after: AdaptTotals;
  /** What the reshaping could not do — said plainly, not hidden. */
  warnings: string[];
  currency: string;
}

export interface ExploreResult {
  items: ExploreTrip[];
  total: number;
}

/** The public creator page (W11.2). */
export interface CreatorProfile {
  name: string;
  handle: string;
  characterId: string;
  publicTrips: number;
  totalViews: number;
  totalClones: number;
  pointsEarned: number;
  trips: ExploreTrip[];
}

export interface ShareState {
  visibility: TripVisibility;
  shareToken: string | null;
  shareUrl: string | null;
  publicSlug: string | null;
  viewCount: number;
  cloneCount: number;
}

export type ExportFormat = 'pdf' | 'ics' | 'json';

export interface ExportResult {
  format: ExportFormat;
  url: string;
  filename: string;
  /** Mock mode builds the file in the browser and says so. */
  simulated: boolean;
}

/* ------------------------------------------------------------------- poi -- */

export interface Poi {
  id: string;
  name: string;
  nameEn?: string;
  city: string;
  area?: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  openHours?: string;
  costJpy?: number;
  photo?: string;
  tags: string[];
}

/* ------------------------------------------------------------------ trip -- */

export interface TripSummary extends Trip {
  role: 'owner' | 'editor' | 'viewer';
  memberIds: string[];
  /** Characters of those members, so a card can draw faces without a lookup. */
  characterIds: string[];
  daysUntil: number;
}

export interface TripOverview {
  trip: Trip;
  members: Member[];
  coverage: CoverageSummary;
  checklist: { key: string; label: string; done: boolean; hint?: string }[];
  activity: ActivityEvent[];
  counts: {
    wishlistItems: number;
    planDays: number;
    planItems: number;
    membersWithoutWishlist: number;
    bookings: number;
    openPrep: number;
  };
  locked: LockedDates | null;
}

export interface CreateTripInput {
  /**
   * Which door the trip came through (M1). "route" is the one for a group that
   * already knows where it is flying; "date" is dates first, destination later.
   */
  entryType: 'route' | 'date' | 'clone';
  title: string;
  /** ISO country of the destination; the route decides it when there is one. */
  country?: string;
  cities?: string[];
  /** The booked route. When present it decides the dates and the destinations. */
  flights?: FlightLegInput[];
  startDate?: string;
  endDate?: string;
  partySize?: number;
  budgetPerPersonThb?: number;
  /** Date-first entry creates the room with no dates and opens the date board. */
  coordinateDates?: boolean;
  sourceTripId?: string;
}

export interface UpdateTripInput {
  title?: string;
  cities?: string[];
  startDate?: string;
  endDate?: string;
  partySize?: number;
  budgetPerPersonThb?: number;
  status?: TripStatus;
  cover?: string;
}

/** What A1.2 makes of a pasted booking e-mail (M1 — W1.4). */
export interface ParsedTicket {
  flights: {
    code: string;
    from: string;
    to: string;
    date: string;
    time?: string;
    direction: 'out' | 'back';
  }[];
  startDate: string | null;
  endDate: string | null;
  partySize: number | null;
  cities: string[];
  /** Mock mode reads the text with a regex instead of the model. */
  simulated: boolean;
}

export interface InviteLink {
  token: string;
  url: string;
  expiresAt: string;
  role: 'editor' | 'viewer';
}

/** What the invite landing page can show before anyone signs in. */
export interface InvitePreview {
  tripId: string;
  title: string;
  role: 'editor' | 'viewer';
  expiresAt: string;
}

/* ------------------------------------------------------------------ plan -- */

export interface MoveItemInput {
  itemId: string;
  toDayId: string;
  /** Position within the destination day. */
  toIndex: number;
}

export type CreateItemInput = Omit<PlanItem, 'id'> & { dayId: string; index?: number };

/** What the admin screen shows (M13 — A13.2). */
export interface AdminStats {
  users: number;
  trips: number;
  pois: number;
  characters: number;
  aiCostTodayUsd: number;
  aiCostCapUsd: number;
  clicksToday: number;
  /** Third parties currently answered by a stand-in — never "the data is fake". */
  stubProviders: boolean;
  stubbed: StubbedProvider[];
  commit: string;
}

/**
 * A third party the backend is standing in for.
 *
 * Named rather than boolean because "บางอย่างเป็นของจำลอง" is not something a
 * UAT tester can act on, and because a missing API key and STUB_PROVIDERS=true
 * produce the same fact from outside.
 */
export type StubbedProvider =
  | 'ai'
  | 'places'
  | 'weather'
  | 'fx'
  | 'storage'
  | 'notifications'
  | 'affiliate';

/**
 * What is real behind this screen (see `lib/data/mode.ts` for the other axis).
 *
 * `live: false` here does not mean mock mode — it means the API is real and
 * some of the providers behind it are not.
 */
export interface ProviderMode {
  live: boolean;
  stubbed: StubbedProvider[];
  devLogin: boolean;
  env: string;
}

/** One entry of the undo trail (W5.7). */
export interface PlanVersion {
  id: string;
  itemId: string;
  action: 'update' | 'move' | 'delete';
  actorId: string;
  createdAt: string;
  /** The item as it looked *before* the change. */
  title: string;
}

/* --------------------------------------------------------------- billing -- */

/**
 * Bill & Payment (M20).
 *
 * Everything a user has ever bought lands in one shape — an **order** — no
 * matter what was sold. Phase 1 sells exactly one thing (extra AI drafts), but
 * a monthly plan is next, and a purchase history that has to be rewritten when
 * the second product ships is a purchase history that loses the first one.
 *
 * So: `kind` says what was sold, `periodStart`/`periodEnd` are filled in only
 * for a subscription invoice, and `provider`/`providerRef` are the hooks a real
 * gateway will write into. Nothing here needs a schema change to bill monthly.
 */
export type OrderKind = 'ai_credit' | 'subscription' | 'points_topup';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/** How it was paid for. `points` and `free` never touch a gateway. */
export type PaymentMethod = 'card' | 'promptpay' | 'truemoney' | 'points' | 'free';

export interface OrderLine {
  label: string;
  quantity: number;
  unitAmountThb: number;
  amountThb: number;
}

export interface Order {
  id: string;
  /** What the receipt is called out loud — "RV-2569-000123". */
  number: string;
  kind: OrderKind;
  status: OrderStatus;
  title: string;
  lines: OrderLine[];
  subtotalThb: number;
  discountThb: number;
  totalThb: number;
  currency: string;
  method: PaymentMethod;
  /** Verbatim label from the payment sheet — the receipt quotes it. */
  methodLabel: string;
  /** Points debited, for an order paid with points. */
  pointsSpent: number;
  tripId: string | null;
  tripTitle: string | null;
  /** Gateway name and charge id, once there is a gateway. */
  provider: string | null;
  providerRef: string | null;
  /** Phase 1 has no gateway: a cash order is *recorded*, never charged. */
  simulated: boolean;
  /** A subscription invoice covers a period; a one-off does not. */
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

export type BillingInterval = 'month' | 'year';

/** One row of the price list. `available` is false until a gateway exists. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  priceThb: number;
  interval: BillingInterval;
  perks: string[];
  /** Drafts the plan hands out every period. */
  includedDraftsPerPeriod: number;
  available: boolean;
}

/**
 * The user's standing plan. Everyone is on `free` in Phase 1 — the shape is
 * already the one a paid subscriber will have, so the screen that renders it
 * does not change when billing turns on.
 */
export interface Subscription {
  id: string | null;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  priceThb: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** True once the user has cancelled but the paid period is still running. */
  cancelAtPeriodEnd: boolean;
  includedDraftsPerPeriod: number;
}

/** The numbers at the top of the billing screen. */
export interface BillingSummary {
  /** Orders that completed — a failed attempt is not a purchase. */
  orders: number;
  /** AI drafts bought across every trip: "ซื้อแพลน AI ไปกี่ครั้ง". */
  aiDraftsPurchased: number;
  totalSpentThb: number;
  pointsSpent: number;
  /** The first completed order, ISO — null when nothing has been bought. */
  since: string | null;
  subscription: Subscription;
}

/** What the payment sheet sends when someone buys drafts. */
export interface BuyCreditsInput {
  quantity: number;
  method: PaymentMethod;
  /** The label the user actually tapped — kept for the receipt. */
  channel: string;
  /** A code redeemed from points (A12.10). Ignored when paying with points. */
  discountCode?: string;
}

/* ------------------------------------ points out, money owed (M22) ------- */

/**
 * Points turned into money off (A12.10).
 *
 * Issuing one burns the points there and then, so a code that exists is
 * already paid for. It is single-use and it expires.
 */
export interface DiscountCode {
  code: string;
  scope: 'ai_credits' | 'booking';
  amountThb: number;
  pointsSpent: number;
  expiresAt: string;
  usedAt: string | null;
  usable: boolean;
}

export interface RedemptionTier {
  amountThb: number;
  points: number;
  afford: boolean;
}

export interface RedemptionBoard {
  balance: number;
  tiers: RedemptionTier[];
  codes: DiscountCode[];
}

/**
 * One line of what a published plan earned its creator (A12.11).
 *
 * Not points: this is money a partner owes, in baht. `estimated` means the
 * commission was derived from a rate table rather than reported.
 */
export interface CreatorEarning {
  tripId: string;
  partner: string;
  bookingValueThb: number;
  commissionThb: number;
  sharePercent: number;
  amountThb: number;
  estimated: boolean;
  status: 'pending' | 'payable' | 'paid';
  occurredAt: string;
}

export interface CreatorPayout {
  periodStart: string;
  periodEnd: string;
  amountThb: number;
  earningCount: number;
  status: 'draft' | 'paid';
  paidAt: string | null;
}

export interface EarningsStatement {
  totals: {
    pendingThb: number;
    payableThb: number;
    paidThb: number;
    count: number;
  };
  sharePercent: number;
  minimumPayoutThb: number;
  entries: CreatorEarning[];
  payouts: CreatorPayout[];
}

/* --------------------------------------- agent lead handoff (A12.12) ----- */

export type LeadStatus = 'new' | 'sent' | 'contacted' | 'won' | 'lost';

/** A group asking a human to take the booking from here. */
export interface AgentLead {
  id: string;
  partner: string;
  contactName: string;
  contactPhone: string;
  contactLine: string;
  note: string;
  status: LeadStatus;
  sentAt: string | null;
  createdAt: string;
  /** True when no agent channel is configured — saved, but nobody was messaged. */
  simulated: boolean;
}

export interface CreateLeadInput {
  contactName: string;
  contactPhone?: string;
  contactLine?: string;
  note?: string;
}
