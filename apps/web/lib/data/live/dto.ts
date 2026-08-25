/**
 * The wire format.
 *
 * Exactly what the Go API sends — snake_case, no renaming in transit. These
 * types exist so the mapper below is checked against reality instead of `any`;
 * nothing outside lib/data/live may import them.
 */

export interface TripDto {
  id: string;
  title: string;
  destination_country: string;
  destination_cities: string[] | null;
  start_date: string | null;
  end_date: string | null;
  nights: number;
  party_size: number;
  status: 'draft' | 'planning' | 'final' | 'done';
  cover_image_url: string;
  home_currency: string;
  dest_currency: string;
  fx_rate: number | null;
  fx_rate_at: string | null;
  budget_per_person_thb: number;
  visibility: 'private' | 'link' | 'public';
  /** Present on the endpoints that load the route: get, create and overview. */
  route?: RouteDto;
  role?: 'owner' | 'editor' | 'viewer';
  member_ids?: string[];
  member_character_ids?: string[];
  days_until?: number;
}

/* ----------------------------------------------------------------- route -- */

export interface AirportDto {
  iata: string;
  name: string;
  name_th?: string;
  city: string;
  city_th?: string;
  country_code: string;
  country: string;
  country_th: string;
  timezone: string;
  lat: number;
  lon: number;
  major: boolean;
}

export interface FlightDto {
  id: string;
  seq: number;
  direction: 'out' | 'inter' | 'back';
  mode: 'flight' | 'ground';
  airline: string;
  flight_no: string;
  dep_airport: string;
  arr_airport: string;
  dep_date: string;
  dep_time: string;
  arr_date: string;
  arr_time: string;
  note: string;
}

export interface RouteStopDto {
  airport: string;
  city: string;
  country_code: string;
  country: string;
  arrive_date: string;
  arrive_time: string;
  depart_date: string;
  depart_time: string;
  nights: number;
  open: boolean;
}

export interface RouteDto {
  flights: FlightDto[];
  stops: RouteStopDto[];
  countries: { code: string; name: string; cities: string; nights: number }[];
  home_airport: string;
  start_date: string;
  end_date: string;
  days: number;
  nights: number;
  round_trip: boolean;
}

export interface MemberDto {
  user_id: string;
  display_name: string;
  role: 'owner' | 'editor' | 'viewer';
  character_id: string;
  has_wishlist: boolean;
}

/* ------------------------------------------------------ community (M9) --- */

export interface NotificationDto {
  id: string;
  kind: 'mention' | 'assigned' | 'poll_opened' | 'plan_ready' | 'points';
  title: string;
  body: string;
  link: string;
  trip_id: string | null;
  actor_id: string;
  read: boolean;
  created_at: string;
}

export interface InboxDto {
  unread: number;
  items: NotificationDto[];
}

export interface PollOptionDto {
  index: number;
  label: string;
  votes: number;
  who: string[];
}

export interface PollDto {
  id: string;
  question: string;
  item_id: string | null;
  options: PollOptionDto[];
  closed: boolean;
  closes_at: string | null;
  created_by: string;
  created_at: string;
  my_answer: number;
  answered: number;
}

/* --------------------------------------------- photos & documents (M18/19) */

export interface PhotoDto {
  id: string;
  trip_id: string;
  day_id: string | null;
  item_id: string | null;
  user_id: string;
  url: string;
  caption: string;
  taken_at: string | null;
  created_at: string;
}

export interface DocumentDto {
  id: string;
  trip_id: string;
  user_id: string;
  name: string;
  category: 'ticket' | 'hotel' | 'transport' | 'insurance' | 'other';
  url: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

/* ---------------------------------------------------- public model (M11) - */

export interface PublicCreatorDto {
  name: string;
  handle: string | null;
  character_id: string;
}

export interface PublicTripDto {
  trip: TripDto;
  days: PlanDayDto[];
  members: MemberDto[];
  creator: PublicCreatorDto;
  view_count: number;
  clone_count: number;
  reviews: ReviewSummaryDto;
  review_entries: ReviewDto[];
}

/* ------------------------------- points out, money owed (M22) ------------ */

export interface DiscountCodeDto {
  code: string;
  scope: 'ai_credits' | 'booking';
  amount_thb: number;
  points_spent: number;
  expires_at: string;
  used_at: string | null;
  usable: boolean;
}

export interface RedemptionListDto {
  balance: number;
  tiers: { amount_thb: number; points: number; afford: boolean }[];
  codes: DiscountCodeDto[];
}

export interface EarningDto {
  trip_id: string;
  partner: string;
  booking_value_thb: number;
  commission_thb: number;
  share_percent: number;
  amount_thb: number;
  estimated: boolean;
  status: 'pending' | 'payable' | 'paid';
  occurred_at: string;
}

export interface PayoutDto {
  period_start: string;
  period_end: string;
  amount_thb: number;
  earning_count: number;
  status: 'draft' | 'paid';
  paid_at: string | null;
}

export interface EarningsDto {
  totals: { pending_thb: number; payable_thb: number; paid_thb: number; count: number };
  share_percent: number;
  minimum_payout_thb: number;
  entries: EarningDto[];
  payouts: PayoutDto[];
}

export interface LeadDto {
  id: string;
  partner: string;
  contact_name: string;
  contact_phone: string;
  contact_line: string;
  note: string;
  status: 'new' | 'sent' | 'contacted' | 'won' | 'lost';
  sent_at: string | null;
  created_at: string;
  simulated: boolean;
}

/* ------------------------------------------------- reviews (M21 — A11.5) - */

export interface ReviewDto {
  user_id: string;
  name: string;
  character_id: string;
  rating: number;
  actual_budget_per_person: number;
  body: string;
  created_at: string;
}

export interface ReviewSummaryDto {
  count: number;
  average_rating: number;
  actual_budget_per_person: number;
  budget_said: number;
}

export interface ReviewListDto {
  summary: ReviewSummaryDto;
  entries: ReviewDto[];
  mine: ReviewDto | null;
  can_review: boolean;
}

export interface MatchResultDto {
  score: number;
  reasons: string[];
}

export interface ExploreTripDto {
  slug: string;
  title: string;
  cover_image_url: string;
  cities: string[];
  country: string;
  days: number;
  budget_per_person_thb: number;
  view_count: number;
  clone_count: number;
  creator: PublicCreatorDto;
  updated_at: string;
  match?: MatchResultDto | null;
  reviews: ReviewSummaryDto;
}

/* ---------------------------------------------- adapting a copy (A11.4) -- */

export interface AdaptChangeDto {
  kind: 'day_added' | 'day_removed' | 'item_removed' | 'item_moved';
  day_label: string;
  item_title: string;
  reason: string;
  cost_delta_dest: number;
}

export interface AdaptTotalsDto {
  days: number;
  items: number;
  cost_per_person_dest: number;
}

export interface AdaptDiffDto {
  changes: AdaptChangeDto[];
  before: AdaptTotalsDto;
  after: AdaptTotalsDto;
  warnings: string[];
  currency: string;
}

export interface AdaptCloneDto {
  trip: TripDto;
  diff: AdaptDiffDto;
}

export interface CreatorProfileDto {
  name: string;
  handle: string;
  character_id: string;
  public_trips: number;
  total_views: number;
  total_clones: number;
  points_earned: number;
  trips: ExploreTripDto[];
}

/* -------------------------------------------------------- variants (M6) -- */

export interface VariantMetricsDto {
  day_count: number;
  item_count: number;
  total_cost_jpy: number;
  per_person_thb: number;
  travel_minutes: number;
  coverage_percent: number;
  must_covered: number;
  must_total: number;
  warning_count: number;
}

export interface VariantVotesDto {
  up: number;
  down: number;
  mine: number;
}

export interface VariantDto {
  id: string;
  label: string;
  key_decision: string;
  summary: string;
  source: 'ai' | 'fork';
  created_by: string;
  created_at: string;
  from_day_index: number;
  pros: string[];
  cons: string[];
  metrics: VariantMetricsDto;
  votes: VariantVotesDto;
  days: PlanDayDto[];
}

export interface VariantListDto {
  current: VariantMetricsDto;
  frozen: boolean;
  variants: VariantDto[];
}

/** Trip-scoped member profile (A3.1). */
export interface MemberProfileDto {
  user_id: string;
  visited_before: boolean;
  pace: 'relaxed' | 'balanced' | 'packed';
  walk_level: number;
  can_drive: boolean;
  has_idp: boolean;
  budget_min_thb: number;
  budget_max_thb: number;
  dietary: string[];
  notes: string;
  filled: boolean;
}

export interface MeDto {
  id: string;
  display_name: string;
  handle: string | null;
  character_id: string;
  email: string | null;
  home_currency: string;
  role: 'user' | 'admin';
  points: number;
}

export interface AvailabilityEntryDto {
  user_id: string;
  date: string;
  mark: 'free' | 'maybe' | 'busy';
}

export interface DateWindowDto {
  id: string;
  start_date: string;
  end_date: string;
  days: number;
  member_ids: string[];
  maybe_member_ids: string[];
  everyone: boolean;
  score: number;
  reason: string;
}

export interface LockedDatesDto {
  start_date: string;
  end_date: string;
  days: number;
  locked_by: string;
  locked_at: string;
  member_ids: string[];
}

export interface AvailabilityBoardDto {
  trip_id: string;
  month: string;
  months: string[];
  members: MemberDto[];
  submitted_member_ids: string[];
  entries: AvailabilityEntryDto[];
  windows: DateWindowDto[];
  locked: LockedDatesDto | null;
}

export interface DestinationDto {
  id: string;
  country: string;
  flag: string;
  name: string;
  cities: string[];
  subtitle: string;
  pill: string;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
  budget_min_thb: number;
  budget_max_thb: number;
  reason: string;
  fit: number;
  recommended: boolean;
  flight_hours: number;
  weather_high: number;
  weather_low: number;
  weather_text: string;
}

export interface WishlistItemDto {
  id: string;
  user_id: string;
  kind: 'must' | 'nice' | 'avoid';
  title: string;
  tags: string[] | null;
  note: string | null;
  coverage: 'covered' | 'partial' | 'uncovered';
  item_id: string | null;
}

export interface PlanItemDto {
  id: string;
  type: string;
  start_time: string;
  end_time: string | null;
  title: string;
  area: string | null;
  cost_jpy: number | null;
  travel_minutes: number | null;
  travel_mode: string | null;
  travel_line: string | null;
  open_hours: string | null;
  for_user_ids: string[] | null;
  bookable: boolean;
  booked: boolean;
  warning: string | null;
  note: string | null;
}

export interface PlanDayDto {
  id: string;
  day_index: number;
  date: string;
  label: string;
  city: string;
  weather_icon: string | null;
  weather_high: number | null;
  weather_low: number | null;
  weather_text: string | null;
  items: PlanItemDto[];
}

export interface PlanVersionDto {
  id: string;
  item_id: string;
  action: 'update' | 'move' | 'delete';
  actor_id: string;
  created_at: string;
  snapshot: { title?: string } | null;
}

export interface BudgetLineDto {
  category: string;
  icon: string;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
  total_jpy: number;
  per_person_jpy: number;
  prepaid: boolean;
}

export interface BudgetDto {
  lines: BudgetLineDto[];
  total_jpy: number;
  per_person_jpy: number;
  prepaid_jpy: number;
  per_person_thb: number;
  budget_used: number;
  remaining_thb: number;
  items_without_cost: number;
  fx_rate: number;
  fx_as_of: string;
}

export interface ExpenseEntryDto {
  id: string;
  date: string;
  title: string;
  category: string;
  scope: 'shared' | 'personal';
  amount: number;
  currency: 'JPY' | 'THB';
  paid_by: string;
  participants: string[] | null;
}

export interface ExpenseSummaryDto {
  shared_total_thb: number;
  personal_total_thb: number;
  total_thb: number;
  per_member: {
    user_id: string;
    paid_thb: number;
    share_thb: number;
    personal_thb: number;
    balance_thb: number;
  }[];
  settlements: { from_user_id: string; to_user_id: string; amount_thb: number }[];
  entries: ExpenseEntryDto[];
}

export interface PrepTaskDto {
  id: string;
  title: string;
  category: string;
  assignee_id: string | null;
  due_date: string | null;
  done: boolean;
  note: string | null;
  from_template: boolean;
}

export interface BookingDto {
  id: string;
  kind: string;
  title: string;
  partner: string;
  url: string;
  status: 'idea' | 'booked' | 'cancelled';
  price_per_person_thb: number | null;
  check_in: string | null;
  check_out: string | null;
  booked_by: string | null;
  confirmation_code: string | null;
  note: string | null;
}

export interface CommentDto {
  id: string;
  target_type: 'trip' | 'day' | 'item' | 'wish';
  target_id: string;
  user_id: string;
  body: string;
  created_at: string;
  resolved: boolean;
}

export interface VoteDto {
  target_type: 'item' | 'wish' | 'window' | 'destination';
  target_id: string;
  user_id: string;
  value: 1 | -1;
}

export interface ActivityDto {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  target_type: string | null;
  target_id: string | null;
}

export interface AiJobDto {
  id: string;
  trip_id: string;
  kind: 'draft' | 'refine' | 'rebalance' | 'suggest_destination';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  step: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  result: { days: PlanDayDto[]; rationales: string[]; open_questions: string[] } | null;
}

export interface AiCreditsDto {
  used: number;
  included: number;
  extra: number;
  price_per_draft_thb: number;
  pay_channels: PayChannelDto[] | null;
}

export interface PayChannelDto {
  id: 'card' | 'promptpay' | 'truemoney' | 'points' | 'free';
  label: string;
}

/* --------------------------------------------------------------- billing -- */

export interface OrderLineDto {
  label: string;
  quantity: number;
  unit_amount_thb: number;
  amount_thb: number;
}

export interface OrderDto {
  id: string;
  number: string;
  kind: 'ai_credit' | 'subscription' | 'points_topup';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  title: string;
  lines: OrderLineDto[] | null;
  subtotal_thb: number;
  discount_thb: number;
  total_thb: number;
  currency: string;
  method: 'card' | 'promptpay' | 'truemoney' | 'points' | 'free';
  method_label: string;
  points_spent: number;
  trip_id: string | null;
  trip_title: string | null;
  provider: string | null;
  provider_ref: string | null;
  simulated: boolean;
  period_start: string | null;
  period_end: string | null;
  issued_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

export interface SubscriptionDto {
  id: string | null;
  plan_id: string;
  plan_name: string;
  status: 'none' | 'active' | 'past_due' | 'canceled';
  interval: 'month' | 'year' | null;
  price_thb: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  included_drafts_per_period: number;
}

export interface SubscriptionPlanDto {
  id: string;
  name: string;
  tagline: string;
  price_thb: number;
  interval: 'month' | 'year';
  perks: string[] | null;
  included_drafts_per_period: number;
  available: boolean;
}

export interface BillingSummaryDto {
  orders: number;
  ai_drafts_purchased: number;
  total_spent_thb: number;
  points_spent: number;
  since: string | null;
  subscription: SubscriptionDto;
}

export interface ShareStateDto {
  visibility: 'private' | 'link' | 'public';
  share_token: string | null;
  share_url: string | null;
  public_slug: string | null;
  view_count: number;
  clone_count: number;
}

export interface ExportDto {
  format: 'pdf' | 'ics' | 'json';
  url: string;
  filename: string;
  simulated: boolean;
}

export interface PoiDto {
  id: string;
  name_th: string;
  name_en: string | null;
  city: string;
  area: string | null;
  category: string;
  lat: number;
  lng: number;
  rating: number | null;
  open_hours: string | null;
  cost_jpy: number | null;
  photo_url: string | null;
  tags: string[] | null;
}

export interface DreamDto {
  id: string;
  title: string;
  destination: string;
  note: string | null;
  url: string | null;
  accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull';
}

export interface CoverageDto {
  covered: number;
  partial: number;
  uncovered: number;
  total: number;
  must_covered: number;
  must_total: number;
  percent: number;
}

export interface TripOverviewDto {
  trip: TripDto;
  members: MemberDto[];
  coverage: CoverageDto;
  checklist: { key: string; label: string; done: boolean; hint: string | null }[];
  activity: ActivityDto[];
  counts: {
    wishlist_items: number;
    plan_days: number;
    plan_items: number;
    members_without_wishlist: number;
    bookings: number;
    open_prep: number;
  };
  locked: LockedDatesDto | null;
}

export interface CalendarTripDto {
  id: string;
  title: string;
  cities: string[];
  start_date: string;
  end_date: string;
  days_until: number;
  cover_image_url: string;
  member_ids: string[];
  member_character_ids: string[] | null;
  weather_icon: string | null;
  weather_high: number | null;
  weather_low: number | null;
  weather_text: string | null;
}

export interface PastTripDto {
  id: string;
  title: string;
  cities: string[];
  date_label: string;
  end_date: string;
  days: number;
  places: number;
  spent_thb: number;
  cover_image_url: string;
  member_ids: string[];
  member_character_ids: string[] | null;
  visibility: 'private' | 'link' | 'public';
  public_slug: string | null;
}

export interface RecapDecisionDto {
  id: string;
  kind: 'dates' | 'destination' | 'budget' | 'plan' | 'rationale' | 'booking' | 'vote';
  title: string;
  detail: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface TripRecapDto {
  trip: TripDto;
  members: MemberDto[];
  date_label: string;
  days: number;
  places: number;
  spent_thb: number;
  budget_per_person_thb: number;
  itinerary: PlanDayDto[];
  decisions: RecapDecisionDto[];
  spending: { category: string; amount_thb: number }[];
  activity: ActivityDto[];
  share: ShareStateDto;
  points_per_publish: number;
  can_publish: boolean;
}

export interface YearStatsDto {
  year: number;
  trips: number;
  days: number;
  countries: number;
  places: number;
  spent_thb: number;
  monthly_days: number[];
}

export interface AdminStatsDto {
  users: number;
  trips: number;
  pois: number;
  characters: number;
  ai_cost_today_usd: number;
  ai_cost_cap_usd: number;
  clicks_today: number;
  stub_providers: boolean;
  stubbed: string[];
  commit: string;
}

/** GET /meta/mode — see apps/api/pkg/handlers/api/mode.handler.go. */
export interface ModeDto {
  live: boolean;
  stubbed: string[];
  dev_login: boolean;
  env: string;
}

export interface ParsedTicketDto {
  flights: {
    code: string;
    from: string;
    to: string;
    date: string;
    time: string | null;
    direction: 'out' | 'back';
  }[];
  start_date: string | null;
  end_date: string | null;
  party_size: number | null;
  cities: string[] | null;
  simulated: boolean;
}

export interface InviteDto {
  token: string;
  url: string;
  expires_at: string;
  role: 'editor' | 'viewer';
}

export interface InvitePreviewDto {
  trip_id: string;
  title: string;
  role: 'editor' | 'viewer';
  expires_at: string;
}
