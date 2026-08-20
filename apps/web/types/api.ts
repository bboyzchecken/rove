/**
 * Mirrors the Go DTOs exactly — snake_case, no renaming in transit.
 *
 * DEV_SPEC §7.2 wants these generated from OpenAPI. Until the API emits a spec
 * they are hand-written, which is why they are all in one file: a drift between
 * Go and TypeScript should be one diff to find, not fifteen.
 */

export type TripVisibility = 'private' | 'link' | 'public';
export type TripStatus = 'draft' | 'planning' | 'final' | 'done';
export type TripRole = 'owner' | 'editor' | 'viewer';
export type EntryType = 'date' | 'city' | 'ticket' | 'clone';

export type WishKind = 'must' | 'nice' | 'avoid';
export type CoverageStatus = 'covered' | 'partial' | 'uncovered' | 'na';

export type ItemType = 'place' | 'food' | 'stay' | 'transport' | 'flight' | 'free' | 'note';
export type CostBasis = 'per_person' | 'per_group' | 'per_night' | 'per_unit';
export type CostStatus = 'estimate' | 'quoted' | 'actual' | 'paid';
export type BookingStatus = 'none' | 'clicked' | 'booked' | 'skipped';
export type Verified = 'verified' | 'unverified';

export type ExpenseCategory = 'food' | 'stay' | 'transport' | 'ticket' | 'shopping' | 'other';
export type SplitType = 'shared' | 'personal';
export type Pace = 'chill' | 'normal' | 'packed';

export interface PublicUser {
  id: string;
  display_name: string;
  avatar_url: string;
  handle: string | null;
  character_id: number | null;
  is_creator: boolean;
}

export interface Me {
  id: string;
  display_name: string;
  avatar_url: string;
  character_id: number | null;
  handle: string | null;
  email: string | null;
  role: 'user' | 'admin';
  locale: string;
  home_currency: string;
  is_creator: boolean;
  points: { balance: number; lifetime_earned: number };
}

export interface Character {
  id: number;
  name: string;
  emoji: string;
  image_url: string;
  is_active: boolean;
}

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  slug: string | null;
  destination_country: string;
  destination_cities: string[] | null;
  start_date: string | null;
  end_date: string | null;
  party_size: number;
  home_currency: string;
  dest_currency: string;
  fx_rate: number | null;
  fx_rate_at: string | null;
  visibility: TripVisibility;
  share_token: string | null;
  status: TripStatus;
  source_trip_id: string | null;
  final_plan_id: string | null;
  cover_image_url: string;
  summary: string;
  clone_count: number;
  view_count: number;
  public_hide_expense: boolean;
  created_at: string;
  updated_at: string;
}

export interface Flight {
  id: string;
  trip_id: string;
  direction: 'out' | 'return';
  airline: string;
  flight_no: string;
  dep_airport: string;
  arr_airport: string;
  dep_at: string | null;
  arr_at: string | null;
  raw_text: string;
}

/** trip_members joined with the member's public profile, as the API returns it. */
export interface MemberView {
  user_id: string;
  role: TripRole;
  joined_at: string;
  display_name: string;
  avatar_url: string;
  character_id: number | null;
  has_wishlist: boolean;
}

export interface TripOverview {
  trip: Trip;
  members: MemberView[];
  flights: Flight[];
  counts: {
    wishlist_items: number;
    plans: number;
    members: number;
    members_without_wishlist: number;
    waiting_on: string[];
  };
  flags: {
    has_flights: boolean;
    has_plan: boolean;
    has_profile: boolean;
    is_shared: boolean;
  };
  my_role: TripRole;
}

export interface WishlistItem {
  id: string;
  trip_id: string;
  member_id: string;
  kind: WishKind;
  text: string;
  tags: string[] | null;
  poi_id: string | null;
  coverage: CoverageStatus;
  covered_by_item_ids: string[] | null;
  coverage_note: string;
  sort_order: number;
}

export interface MemberProfile {
  trip_id: string;
  user_id: string;
  visited_before: boolean;
  pace: Pace;
  walk_level: number;
  can_drive: boolean;
  has_idp: boolean;
  budget_min: number | null;
  budget_max: number | null;
  dietary: string[] | null;
  traveling_with: string[] | null;
  notes: string;
}

export interface CoverageRow {
  wishlist_item_id: string;
  member_id: string;
  kind: WishKind;
  text: string;
  status: CoverageStatus;
  note: string;
  item_ids: string[];
}

export interface CoverageStats {
  total: number;
  covered: number;
  partial: number;
  uncovered: number;
  must_uncovered: number;
  covered_percent: number;
}

export interface CoverageResponse {
  plan_id: string;
  items: CoverageRow[];
  stats: CoverageStats;
}

export interface Plan {
  id: string;
  trip_id: string;
  name: string;
  parent_plan_id: string | null;
  version: number;
  is_final: boolean;
  created_by: 'ai' | 'user';
  created_by_user_id: string | null;
  summary: string;
  pros: string[] | null;
  cons: string[] | null;
  key_decision: string;
  status: 'generating' | 'ready' | 'error';
  created_at: string;
}

export interface Day {
  id: string;
  plan_id: string;
  date: string;
  day_index: number;
  title: string;
  theme: string;
  sort_order: number;
}

export interface Item {
  id: string;
  day_id: string;
  plan_id: string;
  sort_order: number;
  type: ItemType;
  poi_id: string | null;
  title: string;
  notes: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  travel_mode: string;
  travel_min: number;
  travel_note: string;
  cost_amount: number | null;
  cost_currency: string;
  cost_basis: CostBasis;
  cost_status: CostStatus;
  cost_note: string;
  is_prepaid: boolean;
  booking_partner: string;
  booking_url: string;
  booking_status: BookingStatus;
  verified: Verified;
  lat: number | null;
  lng: number | null;
}

export interface Rationale {
  id: string;
  plan_id: string;
  item_id: string | null;
  wishlist_item_id: string | null;
  kind: 'cut' | 'moved' | 'chosen' | 'added' | 'warning';
  text: string;
  created_by: 'ai' | 'user';
}

export interface Issue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  day_index?: number;
  item_id?: string;
}

export interface POIBrief {
  id: string;
  name: string;
  city: string;
  area: string;
  category: string;
  image_url: string;
  lat: number | null;
  lng: number | null;
}

export interface POI extends POIBrief {
  name_th: string;
  name_en: string;
  name_ja: string;
  tags: string[] | null;
  open_hours: Record<string, string> | null;
  closed_days: string[] | null;
  avg_visit_min: number;
  avg_cost_jpy: number | null;
  cost_note: string;
  tips: string;
  quality_score: number;
}

export interface DayDetail extends Day {
  items: Item[];
}

/** Everything the Plan tab needs, in one request (A5.2). */
export interface PlanDetail {
  plan: Plan;
  days: DayDetail[];
  rationales: Rationale[];
  warnings: Issue[];
  pois: Record<string, POIBrief>;
}

export interface BudgetSummary {
  currency: string;
  total: number;
  per_person: number;
  prepaid_total: number;
  remaining_total: number;
  by_category: Record<string, number>;
  items_missing_cost: string[];
  party_size: number;
  source_currency: string;
  fx_rate: number;
  fx_rate_at: string | null;
  fx_rate_note: string;
  estimate_label: string;
  budget_min: number | null;
  budget_max: number | null;
}

export interface ExpenseEntry {
  id: string;
  trip_id: string;
  day_id: string | null;
  paid_by_user_id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  split_type: SplitType;
  participants_json: string[] | null;
  fx_rate_snapshot: number | null;
  note: string;
  created_at: string;
}

export interface MemberBalance {
  user_id: string;
  paid: number;
  owed: number;
  personal: number;
  net: number;
}

export interface Settlement {
  from_user_id: string;
  to_user_id: string;
  amount: number;
}

export interface ExpenseSummary {
  currency: string;
  total: number;
  shared_total: number;
  by_category: Record<string, number>;
  per_member: MemberBalance[];
  settlements: Settlement[];
  fx_rate_note: string;
  fx_rate_at: string;
  members: Record<string, PublicUser>;
}

export interface ChecklistEntry {
  id: string;
  label: string;
  done: boolean;
  done_by?: string;
}

export interface PrepBlock {
  id: string;
  trip_id: string;
  type: 'weather' | 'packing' | 'rule' | 'docs' | 'custom';
  trigger: string;
  title: string;
  content_md: string;
  checklist: ChecklistEntry[] | null;
  sort_order: number;
  generated_by: string;
}

export interface Comment {
  id: string;
  trip_id: string;
  target_type: string;
  target_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  author: PublicUser;
}

export interface ActivityLog {
  id: string;
  trip_id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AIJob {
  id: string;
  trip_id: string;
  plan_id: string | null;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'error';
  step: string;
  output: Record<string, unknown> | null;
  error: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
}

export interface ItemDiff {
  op: 'add' | 'update' | 'move' | 'remove';
  item_id: string;
  day_index: number;
  position: number;
  item: Partial<Item> & Record<string, unknown>;
  reason: string;
}

export interface RefineOutput {
  diffs: ItemDiff[];
  summary: string;
}

export interface ParsedTicket {
  flights: Array<{
    direction: 'out' | 'return';
    airline: string;
    flight_no: string;
    dep_airport: string;
    arr_airport: string;
    dep_at: string;
    arr_at: string;
  }>;
  suggested_title: string;
  start_date: string;
  end_date: string;
}

export interface DreamItem {
  id: string;
  user_id: string;
  title: string;
  destination_country: string;
  destination_city: string;
  url: string;
  image_url: string;
  notes: string;
  sort_order: number;
  created_at: string;
}

export interface UserStats {
  total_trips: number;
  total_days: number;
  countries: string[];
  trips_this_year: number;
  total_spend_thb: number;
}

export interface CalendarEntry {
  trip_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  days_until: number;
  status: TripStatus;
  weather: string;
  members: number;
}

export interface PointsBalance {
  balance: number;
  lifetime_earned: number;
  can_redeem: boolean;
  min_redeem_balance: number;
}

export interface PointsTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  ref_id: string;
  ref_type: string;
  note: string;
  created_at: string;
}

export interface BookingClick {
  id: string;
  trip_id: string;
  item_id: string | null;
  partner: string;
  tracking_id: string;
  target_url: string;
  clicked_at: string | null;
  created_at: string;
}

export interface InvitePreview {
  trip_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  member_count: number;
  role: TripRole;
}

export interface PublicPlan {
  trip_id: string;
  title: string;
  slug: string | null;
  summary: string;
  destination_country: string;
  destination_cities: string[];
  start_date: string | null;
  end_date: string | null;
  days: number;
  party_size: number;
  cover_image_url: string;
  clone_count: number;
  view_count: number;
  author: {
    display_name: string;
    handle: string | null;
    avatar_url: string;
    character_id: number | null;
  };
  plan: {
    name: string;
    pros: string[];
    cons: string[];
    days: Array<{
      date: string;
      title: string;
      theme: string;
      items: Array<{
        type: ItemType;
        title: string;
        start_time?: string;
        end_time?: string;
        poi_id?: string;
        travel_min?: number;
        cost_jpy?: number;
        cost_basis?: CostBasis;
      }>;
    }>;
  };
  estimate_thb: number;
  fx_rate_note: string;
  can_clone: boolean;
}

export interface ExploreCard {
  slug: string | null;
  trip_id: string;
  title: string;
  summary: string;
  destination_cities: string[];
  days: number;
  start_date: string | null;
  cover_image_url: string;
  clone_count: number;
  view_count: number;
  author: PublicPlan['author'];
}

/** The envelope every list endpoint returns. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/** Endpoints that return a bare collection with no paging. */
export interface Collection<T> {
  items: T[];
}
