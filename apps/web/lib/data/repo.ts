import type {
  ActivityEvent,
  AdminStats,
  Airport,
  AiCredits,
  AiGenerateInput,
  AiJob,
  AvailabilityBoard,
  AvailabilityMark,
  BookingEntry,
  BookingKind,
  BookingStatus,
  BudgetSummary,
  CalendarTrip,
  Character,
  Comment,
  CommentTarget,
  CoverageSummary,
  CreateItemInput,
  CreateTripInput,
  CurrentUser,
  DateWindow,
  DestinationSuggestion,
  DreamItem,
  ExpenseEntry,
  ExpenseSummary,
  ExportFormat,
  ExportResult,
  FlightLegInput,
  InviteLink,
  LockedDates,
  Member,
  MoveItemInput,
  ParsedTicket,
  PastTrip,
  PlanDay,
  PlanItem,
  PlanVersion,
  Poi,
  PrepTask,
  ShareState,
  Trip,
  TripOverview,
  TripRoute,
  TripSummary,
  TripVisibility,
  UpdateTripInput,
  Vote,
  VoteTarget,
  WishlistItem,
  YearStats,
} from './types';

/**
 * The repository contract.
 *
 * Two implementations exist and they must stay interchangeable: `lib/data/mock`
 * (browser-persisted seed data, UAT) and `lib/data/live` (the Go API + MySQL).
 * If a method cannot be honoured in mock mode it still resolves — simulated and
 * flagged — rather than throwing, so a UAT run never dead-ends.
 */
export interface RoveRepo {
  auth: AuthRepo;
  airports: AirportRepo;
  trips: TripRepo;
  members: MemberRepo;
  dates: DateRepo;
  wishlist: WishlistRepo;
  plan: PlanRepo;
  budget: BudgetRepo;
  expense: ExpenseRepo;
  prep: PrepRepo;
  booking: BookingRepo;
  collab: CollabRepo;
  ai: AiRepo;
  share: ShareRepo;
  poi: PoiRepo;
  profile: ProfileRepo;
  admin: AdminRepo;
}

export interface AuthRepo {
  /** null for an anonymous visitor — never throws. */
  me(): Promise<CurrentUser | null>;
  /** Mock mode signs in a seeded user; live mode returns the OAuth URL. */
  startLogin(provider: 'line' | 'google'): Promise<{ redirectUrl: string | null; user: CurrentUser | null }>;
  logout(): Promise<void>;
  updateMe(patch: Partial<Pick<CurrentUser, 'name' | 'handle' | 'characterId' | 'homeCurrency'>>): Promise<CurrentUser>;
}

/**
 * Worldwide airport search (M1 — A1.3). Public data: the entry flow calls it
 * before anyone has signed in, exactly like a flight-booking search.
 */
export interface AirportRepo {
  /** Ranked: an exact IATA code first, then city, airport name, country. */
  search(query: string, limit?: number): Promise<Airport[]>;
  get(iata: string): Promise<Airport | null>;
  /** Resolves several codes at once — the route builder needs them together. */
  resolve(codes: string[]): Promise<Record<string, Airport>>;
}

export interface TripRepo {
  list(): Promise<TripSummary[]>;
  get(tripId: string): Promise<Trip>;
  overview(tripId: string): Promise<TripOverview>;
  create(input: CreateTripInput): Promise<Trip>;
  update(tripId: string, patch: UpdateTripInput): Promise<Trip>;
  remove(tripId: string): Promise<void>;
  clone(tripId: string): Promise<Trip>;
  /** Reads a pasted booking e-mail into a trip frame (M1 — A1.2). */
  parseTicket(text: string): Promise<ParsedTicket>;
  /** The legs of a trip, plus everything derived from them (M1 — A1.3). */
  route(tripId: string): Promise<TripRoute>;
  /** Replaces the whole route; the trip frame follows the legs. */
  setRoute(tripId: string, legs: FlightLegInput[]): Promise<TripRoute>;
  upcoming(): Promise<CalendarTrip[]>;
  past(): Promise<PastTrip[]>;
  stats(): Promise<YearStats>;
}

export interface MemberRepo {
  list(tripId: string): Promise<Member[]>;
  invite(tripId: string, role: 'editor' | 'viewer'): Promise<InviteLink>;
  join(token: string): Promise<{ tripId: string }>;
  updateRole(tripId: string, memberId: string, role: 'owner' | 'editor' | 'viewer'): Promise<Member>;
  remove(tripId: string, memberId: string): Promise<void>;
}

/** Date coordination — the step that happens before a trip has dates at all. */
export interface DateRepo {
  board(tripId: string, month?: string): Promise<AvailabilityBoard>;
  /** Replaces this member's marks for the given dates; empty mark clears. */
  setAvailability(
    tripId: string,
    memberId: string,
    dates: string[],
    mark: AvailabilityMark | null,
  ): Promise<AvailabilityBoard>;
  /** Marks the member done so the board stops nudging them. */
  submit(tripId: string, memberId: string): Promise<AvailabilityBoard>;
  windows(tripId: string): Promise<DateWindow[]>;
  lock(tripId: string, startDate: string, endDate: string): Promise<LockedDates>;
  unlock(tripId: string): Promise<void>;
  /** Ranked destinations for the locked window. */
  destinations(tripId: string): Promise<DestinationSuggestion[]>;
  chooseDestination(tripId: string, destinationId: string): Promise<Trip>;
}

export interface WishlistRepo {
  list(tripId: string): Promise<WishlistItem[]>;
  coverage(tripId: string): Promise<CoverageSummary>;
  add(tripId: string, input: Omit<WishlistItem, 'id' | 'coverage'>): Promise<WishlistItem>;
  update(tripId: string, wishId: string, patch: Partial<WishlistItem>): Promise<WishlistItem>;
  remove(tripId: string, wishId: string): Promise<void>;
}

export interface PlanRepo {
  days(tripId: string): Promise<PlanDay[]>;
  addItem(tripId: string, input: CreateItemInput): Promise<PlanItem>;
  updateItem(tripId: string, itemId: string, patch: Partial<PlanItem>): Promise<PlanItem>;
  moveItem(tripId: string, input: MoveItemInput): Promise<PlanDay[]>;
  removeItem(tripId: string, itemId: string): Promise<void>;
  /** Recomputes travel times and warnings — the "จัดใหม่" button. */
  revalidate(tripId: string): Promise<PlanDay[]>;
  /** Restores the most recent snapshot (W5.5). */
  undo(tripId: string): Promise<PlanDay[]>;
  /** What changed recently, newest first (W5.7). */
  versions(tripId: string): Promise<PlanVersion[]>;
}

export interface BudgetRepo {
  summary(tripId: string): Promise<BudgetSummary>;
  setBudget(tripId: string, perPersonThb: number): Promise<BudgetSummary>;
  refreshFx(tripId: string): Promise<BudgetSummary>;
}

export interface ExpenseRepo {
  summary(tripId: string): Promise<ExpenseSummary>;
  add(tripId: string, input: Omit<ExpenseEntry, 'id'>): Promise<ExpenseEntry>;
  update(tripId: string, expenseId: string, patch: Partial<ExpenseEntry>): Promise<ExpenseEntry>;
  remove(tripId: string, expenseId: string): Promise<void>;
  settle(tripId: string, fromMemberId: string, toMemberId: string): Promise<ExpenseSummary>;
}

export interface PrepRepo {
  list(tripId: string): Promise<PrepTask[]>;
  add(tripId: string, input: Omit<PrepTask, 'id' | 'done'>): Promise<PrepTask>;
  toggle(tripId: string, taskId: string, done: boolean): Promise<PrepTask>;
  update(tripId: string, taskId: string, patch: Partial<PrepTask>): Promise<PrepTask>;
  remove(tripId: string, taskId: string): Promise<void>;
  /** Seeds the country template (visa, sim, insurance...) once. */
  applyTemplate(tripId: string): Promise<PrepTask[]>;
  /** The trip's free-form markdown block (W8.2). */
  note(tripId: string): Promise<string>;
  saveNote(tripId: string, body: string): Promise<string>;
}

export interface BookingRepo {
  list(tripId: string): Promise<BookingEntry[]>;
  /** Partner offers for a kind — affiliate links, mock returns the seeded set. */
  offers(tripId: string, kind: BookingKind): Promise<BookingEntry[]>;
  save(tripId: string, input: Omit<BookingEntry, 'id'>): Promise<BookingEntry>;
  setStatus(tripId: string, bookingId: string, status: BookingStatus): Promise<BookingEntry>;
  remove(tripId: string, bookingId: string): Promise<void>;
}

export interface CollabRepo {
  comments(tripId: string, targetType: CommentTarget, targetId: string): Promise<Comment[]>;
  addComment(tripId: string, targetType: CommentTarget, targetId: string, body: string): Promise<Comment>;
  resolveComment(tripId: string, commentId: string, resolved: boolean): Promise<Comment>;
  votes(tripId: string, targetType: VoteTarget, targetId: string): Promise<Vote[]>;
  vote(tripId: string, targetType: VoteTarget, targetId: string, value: 1 | -1): Promise<Vote[]>;
  activity(tripId: string): Promise<ActivityEvent[]>;
}

export interface AiRepo {
  credits(tripId: string): Promise<AiCredits>;
  /** Starts a job; poll with `job()` or subscribe with `subscribe()`. */
  generate(tripId: string, input: AiGenerateInput): Promise<AiJob>;
  job(tripId: string, jobId: string): Promise<AiJob>;
  /** Push updates. Returns an unsubscribe function. */
  subscribe(tripId: string, jobId: string, onUpdate: (job: AiJob) => void): () => void;
  /** Applies a finished draft to the plan. */
  apply(tripId: string, jobId: string): Promise<PlanDay[]>;
  /** Buys extra drafts. Mock mode always succeeds and says it was simulated. */
  buyCredits(tripId: string, quantity: number, channel: string): Promise<AiCredits & { simulated: boolean }>;
}

export interface ShareRepo {
  state(tripId: string): Promise<ShareState>;
  setVisibility(tripId: string, visibility: TripVisibility): Promise<ShareState>;
  rotateToken(tripId: string): Promise<ShareState>;
  exportTrip(tripId: string, format: ExportFormat): Promise<ExportResult>;
  /** Read-only payload behind /s/:token and /p/:slug. */
  publicTrip(tokenOrSlug: string): Promise<{ trip: Trip; days: PlanDay[]; members: Member[] } | null>;
}

export interface PoiRepo {
  search(query: string, city?: string): Promise<Poi[]>;
  get(poiId: string): Promise<Poi | null>;
}

export interface AdminRepo {
  stats(): Promise<AdminStats>;
}

export interface ProfileRepo {
  characters(): Promise<Character[]>;
  dreams(): Promise<DreamItem[]>;
  addDream(input: Omit<DreamItem, 'id'>): Promise<DreamItem>;
  removeDream(dreamId: string): Promise<void>;
}
