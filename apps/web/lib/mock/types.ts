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

export interface Trip {
  id: string;
  title: string;
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
  weather?: { icon: string; high: number; low: number; text: string };
}

export interface PastTrip {
  id: string;
  title: string;
  cities: string[];
  dateLabel: string;
  days: number;
  places: number;
  spentThb: number;
  cover: string;
  memberIds: string[];
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
