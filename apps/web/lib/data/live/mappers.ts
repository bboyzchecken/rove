import { DEFAULT_COVER } from '@/lib/covers';

import type {
  ActivityEvent,
  AiCredits,
  Airport,
  AiJob,
  AvailabilityBoard,
  AvailabilityEntry,
  BillingSummary,
  BookingEntry,
  BudgetLine,
  BudgetSummary,
  CalendarTrip,
  Comment,
  CoverageSummary,
  DateWindow,
  DestinationSuggestion,
  DreamItem,
  ExpenseEntry,
  ExpenseSummary,
  ExportResult,
  FlightLeg,
  FlightLegInput,
  InviteLink,
  LockedDates,
  CreatorProfile,
  ExploreTrip,
  Member,
  MemberProfile,
  PlanVariant,
  PublicCreator,
  VariantList,
  VariantMetrics,
  Order,
  ParsedTicket,
  PastTrip,
  PlanDay,
  PlanItem,
  PlanVersion,
  Poi,
  PrepTask,
  ShareState,
  Subscription,
  SubscriptionPlan,
  Trip,
  TripOverview,
  TripRecap,
  TripRoute,
  TripSummary,
  Vote,
  WishlistItem,
  YearStats,
} from '../types';
import type {
  ActivityDto,
  AirportDto,
  AiCreditsDto,
  AiJobDto,
  AvailabilityBoardDto,
  AvailabilityEntryDto,
  BillingSummaryDto,
  BookingDto,
  BudgetDto,
  BudgetLineDto,
  CalendarTripDto,
  CommentDto,
  CoverageDto,
  DateWindowDto,
  DestinationDto,
  DreamDto,
  ExpenseEntryDto,
  ExpenseSummaryDto,
  ExportDto,
  FlightDto,
  InviteDto,
  LockedDatesDto,
  CreatorProfileDto,
  ExploreTripDto,
  MemberDto,
  MemberProfileDto,
  PublicCreatorDto,
  VariantDto,
  VariantListDto,
  VariantMetricsDto,
  OrderDto,
  ParsedTicketDto,
  PastTripDto,
  PlanDayDto,
  RouteDto,
  PlanItemDto,
  PlanVersionDto,
  PoiDto,
  PrepTaskDto,
  ShareStateDto,
  SubscriptionDto,
  SubscriptionPlanDto,
  TripDto,
  TripOverviewDto,
  TripRecapDto,
  VoteDto,
  WishlistItemDto,
  YearStatsDto,
} from './dto';

/**
 * Wire → view model. The only place snake_case is allowed to touch this app.
 *
 * Anything the API leaves null becomes a sensible empty value here rather than
 * a null the components would each have to guard.
 */

export function toTrip(dto: TripDto): Trip {
  return {
    id: dto.id,
    title: dto.title,
    cities: dto.destination_cities ?? [],
    startDate: dto.start_date ?? '',
    endDate: dto.end_date ?? '',
    nights: dto.nights,
    partySize: dto.party_size,
    status: dto.status === 'draft' ? 'planning' : dto.status === 'final' ? 'ready' : dto.status,
    cover: dto.cover_image_url || DEFAULT_COVER,
    homeCurrency: dto.home_currency,
    destCurrency: dto.dest_currency,
    fxRate: dto.fx_rate ?? 0.235,
    fxAsOf: (dto.fx_rate_at ?? '').slice(0, 10),
    budgetPerPersonThb: dto.budget_per_person_thb,
    route: dto.route ? toRoute(dto.route) : undefined,
  };
}

/* ----------------------------------------------------------------- route -- */

export function toAirport(dto: AirportDto): Airport {
  return {
    iata: dto.iata,
    name: dto.name,
    nameTh: dto.name_th || undefined,
    city: dto.city,
    cityTh: dto.city_th || undefined,
    countryCode: dto.country_code,
    country: dto.country,
    countryTh: dto.country_th,
    timezone: dto.timezone,
    lat: dto.lat,
    lon: dto.lon,
    major: dto.major,
  };
}

export function toFlightLeg(dto: FlightDto): FlightLeg {
  return {
    id: dto.id,
    direction: dto.direction,
    mode: dto.mode,
    airline: dto.airline || undefined,
    flightNo: dto.flight_no || undefined,
    from: dto.dep_airport,
    to: dto.arr_airport,
    depDate: dto.dep_date,
    depTime: dto.dep_time || undefined,
    arrDate: dto.arr_date || undefined,
    arrTime: dto.arr_time || undefined,
    note: dto.note || undefined,
  };
}

export function toRoute(dto: RouteDto): TripRoute {
  return {
    flights: (dto.flights ?? []).map(toFlightLeg),
    stops: (dto.stops ?? []).map((stop) => ({
      airport: stop.airport,
      city: stop.city,
      countryCode: stop.country_code,
      country: stop.country,
      arriveDate: stop.arrive_date,
      arriveTime: stop.arrive_time || undefined,
      departDate: stop.depart_date || undefined,
      departTime: stop.depart_time || undefined,
      nights: stop.nights,
      open: stop.open,
    })),
    countries: dto.countries ?? [],
    homeAirport: dto.home_airport,
    startDate: dto.start_date,
    endDate: dto.end_date,
    days: dto.days,
    nights: dto.nights,
    roundTrip: dto.round_trip,
  };
}

/** What the API expects back for one leg. */
export function fromFlightLeg(leg: FlightLegInput) {
  return {
    direction: leg.direction,
    mode: leg.mode,
    airline: leg.airline ?? '',
    flight_no: leg.flightNo ?? '',
    dep_airport: leg.from,
    arr_airport: leg.to,
    dep_date: leg.depDate,
    dep_time: leg.depTime ?? '',
    arr_date: leg.arrDate ?? '',
    arr_time: leg.arrTime ?? '',
    note: leg.note ?? '',
  };
}

export function toTripSummary(dto: TripDto): TripSummary {
  return {
    ...toTrip(dto),
    role: dto.role ?? 'viewer',
    memberIds: dto.member_ids ?? [],
    characterIds: dto.member_character_ids ?? [],
    daysUntil: dto.days_until ?? 0,
  };
}

export function toMember(dto: MemberDto): Member {
  return {
    id: dto.user_id,
    name: dto.display_name,
    role: dto.role,
    characterId: dto.character_id,
    hasWishlist: dto.has_wishlist,
  };
}

export function toMemberProfile(dto: MemberProfileDto): MemberProfile {
  const walk = dto.walk_level === 1 || dto.walk_level === 3 ? dto.walk_level : 2;
  return {
    userId: dto.user_id,
    visitedBefore: dto.visited_before,
    pace: dto.pace,
    walkLevel: walk,
    canDrive: dto.can_drive,
    hasIdp: dto.has_idp,
    budgetMinThb: dto.budget_min_thb,
    budgetMaxThb: dto.budget_max_thb,
    dietary: dto.dietary ?? [],
    notes: dto.notes,
    filled: dto.filled,
  };
}

export function toCoverage(dto: CoverageDto): CoverageSummary {
  return {
    covered: dto.covered,
    partial: dto.partial,
    uncovered: dto.uncovered,
    total: dto.total,
    mustCovered: dto.must_covered,
    mustTotal: dto.must_total,
    percent: dto.percent,
  };
}

export function toActivity(dto: ActivityDto): ActivityEvent {
  return {
    id: dto.id,
    memberId: dto.user_id,
    text: dto.text,
    createdAt: dto.created_at,
    targetType: dto.target_type ?? undefined,
    targetId: dto.target_id ?? undefined,
  };
}

export function toTripOverview(dto: TripOverviewDto): TripOverview {
  return {
    trip: toTrip(dto.trip),
    members: dto.members.map(toMember),
    coverage: toCoverage(dto.coverage),
    checklist: dto.checklist.map((c) => ({
      key: c.key,
      label: c.label,
      done: c.done,
      hint: c.hint ?? undefined,
    })),
    activity: dto.activity.map(toActivity),
    counts: {
      wishlistItems: dto.counts.wishlist_items,
      planDays: dto.counts.plan_days,
      planItems: dto.counts.plan_items,
      membersWithoutWishlist: dto.counts.members_without_wishlist,
      bookings: dto.counts.bookings,
      openPrep: dto.counts.open_prep,
    },
    locked: dto.locked ? toLocked(dto.locked) : null,
  };
}

/* ------------------------------------------------------------- dates ----- */

export function toAvailabilityEntry(dto: AvailabilityEntryDto): AvailabilityEntry {
  return { memberId: dto.user_id, date: dto.date, mark: dto.mark };
}

export function toWindow(dto: DateWindowDto): DateWindow {
  return {
    id: dto.id,
    startDate: dto.start_date,
    endDate: dto.end_date,
    days: dto.days,
    memberIds: dto.member_ids,
    maybeMemberIds: dto.maybe_member_ids ?? [],
    everyone: dto.everyone,
    score: dto.score,
    reason: dto.reason,
  };
}

export function toLocked(dto: LockedDatesDto): LockedDates {
  return {
    startDate: dto.start_date,
    endDate: dto.end_date,
    days: dto.days,
    lockedBy: dto.locked_by,
    lockedAt: dto.locked_at,
    memberIds: dto.member_ids ?? [],
  };
}

export function toBoard(dto: AvailabilityBoardDto): AvailabilityBoard {
  return {
    tripId: dto.trip_id,
    month: dto.month,
    months: dto.months,
    members: dto.members.map(toMember),
    submittedMemberIds: dto.submitted_member_ids ?? [],
    entries: (dto.entries ?? []).map(toAvailabilityEntry),
    windows: (dto.windows ?? []).map(toWindow),
    locked: dto.locked ? toLocked(dto.locked) : null,
  };
}

export function toDestination(dto: DestinationDto): DestinationSuggestion {
  return {
    id: dto.id,
    country: dto.country,
    flag: dto.flag,
    name: dto.name,
    cities: dto.cities,
    subtitle: dto.subtitle,
    pill: dto.pill,
    accent: dto.accent,
    budgetPerPersonThb: [dto.budget_min_thb, dto.budget_max_thb],
    reason: dto.reason,
    fit: dto.fit,
    recommended: dto.recommended,
    flightHours: dto.flight_hours,
    weather: { high: dto.weather_high, low: dto.weather_low, text: dto.weather_text },
  };
}

/* ---------------------------------------------------------- wishlist ----- */

export function toWishlistItem(dto: WishlistItemDto): WishlistItem {
  return {
    id: dto.id,
    memberId: dto.user_id,
    kind: dto.kind,
    title: dto.title,
    tags: dto.tags ?? [],
    note: dto.note ?? undefined,
    coverage: dto.coverage,
    itemId: dto.item_id ?? undefined,
  };
}

export function fromWishlistItem(item: Partial<WishlistItem>) {
  return {
    user_id: item.memberId,
    kind: item.kind,
    title: item.title,
    tags: item.tags,
    note: item.note,
    item_id: item.itemId,
  };
}

/* -------------------------------------------------------------- plan ----- */

export function toPlanItem(dto: PlanItemDto): PlanItem {
  return {
    id: dto.id,
    type: dto.type as PlanItem['type'],
    start: dto.start_time,
    end: dto.end_time ?? undefined,
    title: dto.title,
    area: dto.area ?? undefined,
    costJpy: dto.cost_jpy ?? undefined,
    travel:
      dto.travel_minutes == null
        ? undefined
        : {
            minutes: dto.travel_minutes,
            mode: (dto.travel_mode ?? 'train') as 'train' | 'walk' | 'bus' | 'car',
            line: dto.travel_line ?? undefined,
          },
    openHours: dto.open_hours ?? undefined,
    forMembers: dto.for_user_ids ?? undefined,
    bookable: dto.bookable,
    booked: dto.booked,
    warning: dto.warning ?? undefined,
    note: dto.note ?? undefined,
  };
}

export function fromPlanItem(item: Partial<PlanItem> & { dayId?: string; index?: number }) {
  return {
    day_id: item.dayId,
    index: item.index,
    type: item.type,
    start_time: item.start,
    end_time: item.end,
    title: item.title,
    area: item.area,
    cost_jpy: item.costJpy,
    travel_minutes: item.travel?.minutes,
    travel_mode: item.travel?.mode,
    travel_line: item.travel?.line,
    open_hours: item.openHours,
    for_user_ids: item.forMembers,
    bookable: item.bookable,
    booked: item.booked,
    note: item.note,
  };
}

export function toPlanDay(dto: PlanDayDto): PlanDay {
  return {
    id: dto.id,
    index: dto.day_index,
    date: dto.date,
    label: dto.label,
    city: dto.city,
    weather:
      dto.weather_high == null
        ? undefined
        : {
            icon: dto.weather_icon ?? '☀️',
            high: dto.weather_high,
            low: dto.weather_low ?? 0,
            text: dto.weather_text ?? '',
          },
    items: (dto.items ?? []).map(toPlanItem),
  };
}

export function toPlanVersion(dto: PlanVersionDto): PlanVersion {
  return {
    id: dto.id,
    itemId: dto.item_id,
    action: dto.action,
    actorId: dto.actor_id,
    createdAt: dto.created_at,
    title: dto.snapshot?.title ?? 'รายการหนึ่ง',
  };
}

/* ---------------------------------------------------- public model (M11) - */

export function toPublicCreator(dto: PublicCreatorDto): PublicCreator {
  return {
    name: dto.name,
    handle: dto.handle,
    characterId: dto.character_id || 'shiba',
  };
}

export function toExploreTrip(dto: ExploreTripDto): ExploreTrip {
  return {
    slug: dto.slug,
    title: dto.title,
    cover: dto.cover_image_url || DEFAULT_COVER,
    cities: dto.cities ?? [],
    country: dto.country,
    days: dto.days,
    budgetPerPersonThb: dto.budget_per_person_thb,
    viewCount: dto.view_count,
    cloneCount: dto.clone_count,
    creator: toPublicCreator(dto.creator),
    updatedAt: dto.updated_at,
  };
}

export function toCreatorProfile(dto: CreatorProfileDto): CreatorProfile {
  return {
    name: dto.name,
    handle: dto.handle,
    characterId: dto.character_id || 'shiba',
    publicTrips: dto.public_trips,
    totalViews: dto.total_views,
    totalClones: dto.total_clones,
    pointsEarned: dto.points_earned,
    trips: (dto.trips ?? []).map(toExploreTrip),
  };
}

/* -------------------------------------------------------- variants (M6) -- */

export function toVariantMetrics(dto: VariantMetricsDto): VariantMetrics {
  return {
    dayCount: dto.day_count,
    itemCount: dto.item_count,
    totalCostJpy: dto.total_cost_jpy,
    perPersonThb: dto.per_person_thb,
    travelMinutes: dto.travel_minutes,
    coveragePercent: dto.coverage_percent,
    mustCovered: dto.must_covered,
    mustTotal: dto.must_total,
    warningCount: dto.warning_count,
  };
}

export function toVariant(dto: VariantDto): PlanVariant {
  const mine = dto.votes.mine > 0 ? 1 : dto.votes.mine < 0 ? -1 : 0;
  return {
    id: dto.id,
    label: dto.label,
    keyDecision: dto.key_decision,
    summary: dto.summary,
    source: dto.source,
    createdBy: dto.created_by,
    createdAt: dto.created_at,
    fromDayIndex: dto.from_day_index,
    pros: dto.pros ?? [],
    cons: dto.cons ?? [],
    metrics: toVariantMetrics(dto.metrics),
    votes: { up: dto.votes.up, down: dto.votes.down, mine },
    days: (dto.days ?? []).map(toPlanDay),
  };
}

export function toVariantList(dto: VariantListDto): VariantList {
  return {
    current: toVariantMetrics(dto.current),
    frozen: dto.frozen,
    variants: (dto.variants ?? []).map(toVariant),
  };
}

/* ------------------------------------------------------------ budget ----- */

export function toBudgetLine(dto: BudgetLineDto): BudgetLine {
  return {
    category: dto.category,
    icon: dto.icon,
    accent: dto.accent,
    totalJpy: dto.total_jpy,
    perPersonJpy: dto.per_person_jpy,
    prepaid: dto.prepaid,
  };
}

export function toBudget(dto: BudgetDto): BudgetSummary {
  return {
    lines: (dto.lines ?? []).map(toBudgetLine),
    totalJpy: dto.total_jpy,
    perPersonJpy: dto.per_person_jpy,
    prepaidJpy: dto.prepaid_jpy,
    perPersonThb: dto.per_person_thb,
    budgetUsed: dto.budget_used,
    remainingThb: dto.remaining_thb,
    itemsWithoutCost: dto.items_without_cost,
    fxRate: dto.fx_rate,
    fxAsOf: dto.fx_as_of,
  };
}

/* ----------------------------------------------------------- expense ----- */

export function toExpense(dto: ExpenseEntryDto): ExpenseEntry {
  return {
    id: dto.id,
    date: dto.date,
    title: dto.title,
    category: dto.category,
    scope: dto.scope,
    amount: dto.amount,
    currency: dto.currency,
    paidBy: dto.paid_by,
    participants: dto.participants ?? [],
  };
}

export function fromExpense(entry: Partial<ExpenseEntry>) {
  return {
    date: entry.date,
    title: entry.title,
    category: entry.category,
    scope: entry.scope,
    amount: entry.amount,
    currency: entry.currency,
    paid_by: entry.paidBy,
    participants: entry.participants,
  };
}

export function toExpenseSummary(dto: ExpenseSummaryDto, members: Member[]): ExpenseSummary {
  const byId = new Map(members.map((m) => [m.id, m]));
  const fallback = (id: string): Member => ({
    id,
    name: id,
    role: 'viewer',
    characterId: 'shiba',
    hasWishlist: false,
  });

  return {
    sharedTotalThb: dto.shared_total_thb,
    personalTotalThb: dto.personal_total_thb,
    totalThb: dto.total_thb,
    perMember: (dto.per_member ?? []).map((row) => ({
      member: byId.get(row.user_id) ?? fallback(row.user_id),
      paidThb: row.paid_thb,
      shareThb: row.share_thb,
      personalThb: row.personal_thb,
      balanceThb: row.balance_thb,
    })),
    settlements: (dto.settlements ?? []).map((s) => ({
      fromMemberId: s.from_user_id,
      toMemberId: s.to_user_id,
      amountThb: s.amount_thb,
    })),
    entries: (dto.entries ?? []).map(toExpense),
  };
}

/* -------------------------------------------------------------- prep ----- */

export function toPrepTask(dto: PrepTaskDto): PrepTask {
  return {
    id: dto.id,
    title: dto.title,
    category: dto.category as PrepTask['category'],
    assigneeId: dto.assignee_id,
    dueDate: dto.due_date ?? undefined,
    done: dto.done,
    note: dto.note ?? undefined,
    fromTemplate: dto.from_template,
  };
}

export function fromPrepTask(task: Partial<PrepTask>) {
  return {
    title: task.title,
    category: task.category,
    assignee_id: task.assigneeId,
    due_date: task.dueDate,
    done: task.done,
    note: task.note,
  };
}

/* ----------------------------------------------------------- booking ----- */

export function toBooking(dto: BookingDto): BookingEntry {
  return {
    id: dto.id,
    kind: dto.kind as BookingEntry['kind'],
    title: dto.title,
    partner: dto.partner,
    url: dto.url,
    status: dto.status,
    pricePerPersonThb: dto.price_per_person_thb ?? undefined,
    checkIn: dto.check_in ?? undefined,
    checkOut: dto.check_out ?? undefined,
    bookedBy: dto.booked_by ?? undefined,
    confirmationCode: dto.confirmation_code ?? undefined,
    note: dto.note ?? undefined,
  };
}

export function fromBooking(entry: Partial<BookingEntry>) {
  return {
    kind: entry.kind,
    title: entry.title,
    partner: entry.partner,
    url: entry.url,
    status: entry.status,
    price_per_person_thb: entry.pricePerPersonThb,
    check_in: entry.checkIn,
    check_out: entry.checkOut,
    confirmation_code: entry.confirmationCode,
    note: entry.note,
  };
}

/* ------------------------------------------------------------ collab ----- */

export function toComment(dto: CommentDto): Comment {
  return {
    id: dto.id,
    targetType: dto.target_type,
    targetId: dto.target_id,
    memberId: dto.user_id,
    body: dto.body,
    createdAt: dto.created_at,
    resolved: dto.resolved,
  };
}

export function toVote(dto: VoteDto): Vote {
  return {
    targetType: dto.target_type,
    targetId: dto.target_id,
    memberId: dto.user_id,
    value: dto.value,
  };
}

/* ---------------------------------------------------------------- ai ----- */

export function toAiJob(dto: AiJobDto): AiJob {
  return {
    id: dto.id,
    tripId: dto.trip_id,
    kind: dto.kind,
    status: dto.status,
    progress: dto.progress,
    step: dto.step,
    error: dto.error ?? undefined,
    createdAt: dto.created_at,
    finishedAt: dto.finished_at ?? undefined,
    result: dto.result
      ? {
          days: dto.result.days.map(toPlanDay),
          rationales: dto.result.rationales ?? [],
          openQuestions: dto.result.open_questions ?? [],
        }
      : undefined,
  };
}

export function toAiCredits(dto: AiCreditsDto): AiCredits {
  return {
    used: dto.used,
    included: dto.included,
    extra: dto.extra,
    pricePerDraftThb: dto.price_per_draft_thb,
    payChannels: (dto.pay_channels ?? []).map((channel) => ({
      id: channel.id,
      label: channel.label,
    })),
  };
}

/* ----------------------------------------------------------- billing ----- */

export function toOrder(dto: OrderDto): Order {
  return {
    id: dto.id,
    number: dto.number,
    kind: dto.kind,
    status: dto.status,
    title: dto.title,
    lines: (dto.lines ?? []).map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitAmountThb: line.unit_amount_thb,
      amountThb: line.amount_thb,
    })),
    subtotalThb: dto.subtotal_thb,
    discountThb: dto.discount_thb,
    totalThb: dto.total_thb,
    currency: dto.currency || 'THB',
    method: dto.method,
    methodLabel: dto.method_label,
    pointsSpent: dto.points_spent,
    tripId: dto.trip_id,
    tripTitle: dto.trip_title,
    provider: dto.provider,
    providerRef: dto.provider_ref,
    simulated: dto.simulated,
    periodStart: dto.period_start,
    periodEnd: dto.period_end,
    issuedAt: dto.issued_at,
    paidAt: dto.paid_at,
    refundedAt: dto.refunded_at,
  };
}

export function toSubscription(dto: SubscriptionDto): Subscription {
  return {
    id: dto.id,
    planId: dto.plan_id,
    planName: dto.plan_name,
    status: dto.status,
    interval: dto.interval,
    priceThb: dto.price_thb,
    currentPeriodStart: dto.current_period_start,
    currentPeriodEnd: dto.current_period_end,
    cancelAtPeriodEnd: dto.cancel_at_period_end,
    includedDraftsPerPeriod: dto.included_drafts_per_period,
  };
}

export function toSubscriptionPlan(dto: SubscriptionPlanDto): SubscriptionPlan {
  return {
    id: dto.id,
    name: dto.name,
    tagline: dto.tagline,
    priceThb: dto.price_thb,
    interval: dto.interval,
    perks: dto.perks ?? [],
    includedDraftsPerPeriod: dto.included_drafts_per_period,
    available: dto.available,
  };
}

export function toBillingSummary(dto: BillingSummaryDto): BillingSummary {
  return {
    orders: dto.orders,
    aiDraftsPurchased: dto.ai_drafts_purchased,
    totalSpentThb: dto.total_spent_thb,
    pointsSpent: dto.points_spent,
    since: dto.since,
    subscription: toSubscription(dto.subscription),
  };
}

/* ------------------------------------------------------------- share ----- */

export function toShareState(dto: ShareStateDto): ShareState {
  return {
    visibility: dto.visibility,
    shareToken: dto.share_token,
    shareUrl: dto.share_url,
    publicSlug: dto.public_slug,
    viewCount: dto.view_count,
    cloneCount: dto.clone_count,
  };
}

export function toExport(dto: ExportDto): ExportResult {
  return { format: dto.format, url: dto.url, filename: dto.filename, simulated: dto.simulated };
}

/* --------------------------------------------------------------- poi ----- */

export function toPoi(dto: PoiDto): Poi {
  return {
    id: dto.id,
    name: dto.name_th,
    nameEn: dto.name_en ?? undefined,
    city: dto.city,
    area: dto.area ?? undefined,
    category: dto.category,
    lat: dto.lat,
    lng: dto.lng,
    rating: dto.rating ?? undefined,
    openHours: dto.open_hours ?? undefined,
    costJpy: dto.cost_jpy ?? undefined,
    photo: dto.photo_url ?? undefined,
    tags: dto.tags ?? [],
  };
}

/* ----------------------------------------------------------- profile ----- */

export function toDream(dto: DreamDto): DreamItem {
  return {
    id: dto.id,
    title: dto.title,
    destination: dto.destination,
    note: dto.note ?? undefined,
    url: dto.url ?? undefined,
    accent: dto.accent,
  };
}

export function toCalendarTrip(dto: CalendarTripDto): CalendarTrip {
  return {
    id: dto.id,
    title: dto.title,
    cities: dto.cities ?? [],
    startDate: dto.start_date,
    endDate: dto.end_date,
    daysUntil: dto.days_until,
    cover: dto.cover_image_url || DEFAULT_COVER,
    memberIds: dto.member_ids ?? [],
    characterIds: dto.member_character_ids ?? [],
    weather:
      dto.weather_high == null
        ? undefined
        : {
            icon: dto.weather_icon ?? '☀️',
            high: dto.weather_high,
            low: dto.weather_low ?? 0,
            text: dto.weather_text ?? '',
          },
  };
}

export function toPastTrip(dto: PastTripDto): PastTrip {
  return {
    id: dto.id,
    title: dto.title,
    cities: dto.cities ?? [],
    dateLabel: dto.date_label,
    endDate: dto.end_date,
    days: dto.days,
    places: dto.places,
    spentThb: dto.spent_thb,
    cover: dto.cover_image_url || DEFAULT_COVER,
    memberIds: dto.member_ids ?? [],
    characterIds: dto.member_character_ids ?? [],
    visibility: dto.visibility,
    publicSlug: dto.public_slug,
  };
}

export function toTripRecap(dto: TripRecapDto): TripRecap {
  const trip = toTrip(dto.trip);
  return {
    tripId: trip.id,
    title: trip.title,
    cities: trip.cities,
    dateLabel: dto.date_label,
    cover: trip.cover,
    days: dto.days,
    places: dto.places,
    spentThb: dto.spent_thb,
    budgetPerPersonThb: dto.budget_per_person_thb,
    members: (dto.members ?? []).map(toMember),
    itinerary: (dto.itinerary ?? []).map(toPlanDay),
    decisions: (dto.decisions ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      detail: d.detail,
      decidedAt: d.decided_at ?? undefined,
      decidedBy: d.decided_by ?? undefined,
    })),
    spending: (dto.spending ?? []).map((s) => ({
      category: s.category,
      amountThb: s.amount_thb,
    })),
    activity: (dto.activity ?? []).map(toActivity),
    share: toShareState(dto.share),
    pointsPerPublish: dto.points_per_publish,
    canPublish: dto.can_publish,
  };
}

export function toYearStats(dto: YearStatsDto): YearStats {
  return {
    year: dto.year,
    trips: dto.trips,
    days: dto.days,
    countries: dto.countries,
    places: dto.places,
    spentThb: dto.spent_thb,
    monthlyDays: dto.monthly_days ?? [],
  };
}

export function toParsedTicket(dto: ParsedTicketDto): ParsedTicket {
  return {
    flights: (dto.flights ?? []).map((f) => ({
      code: f.code,
      from: f.from,
      to: f.to,
      date: f.date,
      time: f.time ?? undefined,
      direction: f.direction,
    })),
    startDate: dto.start_date,
    endDate: dto.end_date,
    partySize: dto.party_size,
    cities: dto.cities ?? [],
    simulated: dto.simulated,
  };
}

export function toInvite(dto: InviteDto): InviteLink {
  return { token: dto.token, url: dto.url, expiresAt: dto.expires_at, role: dto.role };
}
