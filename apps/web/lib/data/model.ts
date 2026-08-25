/**
 * View models for the investor prototype.
 *
 * These deliberately mirror the shapes the Go API will return (DEV_SPEC §4.2,
 * §5) so that swapping this module for the real query hooks is a change of
 * import, not a rewrite of the components. Anything the API will compute —
 * coverage %, per-person split, settle-up — is precomputed here as a literal.
 */

export type WishKind = 'must' | 'nice' | 'avoid';
export type CoverageState = 'covered' | 'partial' | 'uncovered';
export type ItemType = 'poi' | 'meal' | 'transport' | 'stay' | 'free' | 'flight';
export type ExpenseScope = 'shared' | 'personal';
export type TripStatus = 'planning' | 'ready' | 'ongoing' | 'done';

export interface Character {
  id: string;
  name: string;
  /** 320×320 webp in /public/characters */
  image: string;
  /** Accent token the picker tints the tile with. */
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
}

export interface Member {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  characterId: string;
  /** false → the Overview nudges this person (W3.4). */
  hasWishlist: boolean;
}

export interface WishlistItem {
  id: string;
  memberId: string;
  kind: WishKind;
  title: string;
  tags: string[];
  note?: string;
  coverage: CoverageState;
  /** Which itinerary item covers it — the Coverage Board links to this. */
  itemId?: string;
}

export interface PlanItem {
  id: string;
  type: ItemType;
  /** Local destination time, "HH:mm" — the editor thinks in Asia/Tokyo. */
  start: string;
  end?: string;
  title: string;
  area?: string;
  /** Estimated cost per person in JPY. */
  costJpy?: number;
  /** Minutes and mode to reach the NEXT item. */
  travel?: { minutes: number; mode: 'train' | 'walk' | 'bus' | 'car'; line?: string };
  openHours?: string;
  /** Whose wishlist this satisfies — drives the "ทำไมถึงมีอันนี้" chip. */
  forMembers?: string[];
  bookable?: boolean;
  booked?: boolean;
  warning?: string;
  note?: string;
}

export interface PlanDay {
  id: string;
  index: number;
  date: string;
  label: string;
  city: string;
  weather?: { icon: string; high: number; low: number; text: string };
  items: PlanItem[];
}

/* ------------------------------------------------------ airports (M1) --- */

/**
 * One row of the worldwide airport index (A1.3).
 *
 * A destination is an airport now, not a typed city name. "NRT" is one place in
 * one country, so "ไปกี่ประเทศ" has an answer before anyone has to ask.
 */
export interface Airport {
  iata: string;
  name: string;
  /** Thai name, for the airports a Thai traveller actually flies to. */
  nameTh?: string;
  city: string;
  cityTh?: string;
  countryCode: string;
  country: string;
  countryTh: string;
  timezone: string;
  lat: number;
  lon: number;
  /** A large international airport — ranked above the regional field next door. */
  major: boolean;
}

/** How the group covers a leg. A train between two cities is a leg too. */
export type LegMode = 'flight' | 'ground';

/** out = leaving home, inter = between destinations, back = coming home. */
export type LegDirection = 'out' | 'inter' | 'back';

/**
 * One leg of the route: "BKK→NRT 4 ธ.ค. ถึง 08:05".
 *
 * Date and time are separate because that is how they arrive: the date is on
 * the ticket months before anyone checks what time the plane leaves, and the
 * arrival time is the fact day one of the plan is built on.
 */
export interface FlightLeg {
  id: string;
  direction: LegDirection;
  mode: LegMode;
  airline?: string;
  flightNo?: string;
  from: string;
  to: string;
  depDate: string;
  depTime?: string;
  arrDate?: string;
  arrTime?: string;
  note?: string;
}

/** What the client sends; the server assigns the id and the order. */
export type FlightLegInput = Omit<FlightLeg, 'id'>;

/** One place the group actually stays, with the nights the legs give it. */
export interface RouteStop {
  airport: string;
  city: string;
  countryCode: string;
  country: string;
  arriveDate: string;
  arriveTime?: string;
  departDate?: string;
  departTime?: string;
  nights: number;
  /** No leg leaves here yet — a one-way route, or one still being filled in. */
  open: boolean;
}

export interface CountryStay {
  code: string;
  name: string;
  cities: string;
  nights: number;
}

/** The legs plus everything derived from them. */
export interface TripRoute {
  flights: FlightLeg[];
  stops: RouteStop[];
  countries: CountryStay[];
  homeAirport: string;
  startDate: string;
  endDate: string;
  days: number;
  nights: number;
  roundTrip: boolean;
}

export interface Trip {
  id: string;
  title: string;
  /**
   * ISO country of the destination (M23). It decides which prep checklist and
   * which planning zones a trip gets, so a trip that does not know where it is
   * going gets the Japan defaults rather than nothing.
   */
  country: string;
  cities: string[];
  startDate: string;
  endDate: string;
  nights: number;
  partySize: number;
  status: TripStatus;
  cover: string;
  homeCurrency: string;
  destCurrency: string;
  /** Rate used for every THB figure in the prototype, with its as-of date. */
  fxRate: number;
  fxAsOf: string;
  budgetPerPersonThb: number;
  /**
   * The legs the trip is built on, when the caller loaded them (M1 — A1.3).
   * Absent on the list endpoints, which do not pay for the join.
   */
  route?: TripRoute;
}

export interface BudgetLine {
  category: string;
  icon: string;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
  totalJpy: number;
  perPersonJpy: number;
  prepaid?: boolean;
}

export interface ExpenseEntry {
  id: string;
  date: string;
  title: string;
  category: string;
  scope: ExpenseScope;
  amount: number;
  currency: 'JPY' | 'THB';
  paidBy: string;
  /** Members sharing the cost — shared entries only. */
  participants: string[];
}

export interface Settlement {
  fromMemberId: string;
  toMemberId: string;
  amountThb: number;
}

export interface DreamItem {
  id: string;
  title: string;
  destination: string;
  note?: string;
  url?: string;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
}

export interface CalendarTrip {
  id: string;
  title: string;
  cities: string[];
  startDate: string;
  endDate: string;
  daysUntil: number;
  cover: string;
  memberIds: string[];
  /** Characters of those members, so a card can draw faces without a lookup. */
  characterIds?: string[];
  weather?: { icon: string; high: number; low: number; text: string };
}

export interface PastTrip {
  id: string;
  title: string;
  cities: string[];
  dateLabel: string;
  /** The day it ended — what "ทริปที่ผ่านมา" is sorted by. */
  endDate: string;
  days: number;
  places: number;
  spentThb: number;
  cover: string;
  memberIds: string[];
  characterIds?: string[];
  /** Whether the recap is already public — the publish nudge reads this. */
  visibility?: 'private' | 'link' | 'public';
  publicSlug?: string | null;
}

/**
 * What a finished trip leaves behind (M17 — W17.5): the choices the group made,
 * kept in one list so "ทำไมตอนนั้นเราเลือกแบบนี้" has an answer months later.
 */
export type RecapDecisionKind =
  'dates' | 'destination' | 'budget' | 'plan' | 'rationale' | 'booking' | 'vote';

export interface RecapDecision {
  id: string;
  kind: RecapDecisionKind;
  title: string;
  detail: string;
  decidedAt?: string;
  /** Member id, when the record names who did it. */
  decidedBy?: string;
}

export interface RecapSpend {
  category: string;
  amountThb: number;
}

export interface YearStats {
  year: number;
  trips: number;
  days: number;
  countries: number;
  places: number;
  spentThb: number;
  /** Months travelled, for the sparkline strip. */
  monthlyDays: number[];
}
