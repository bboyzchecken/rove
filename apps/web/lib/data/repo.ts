import type {
  ActivityEvent,
  AdaptDiff,
  AdaptInput,
  AdminStats,
  AgentLead,
  Airport,
  AiCredits,
  AiGenerateInput,
  AiJob,
  AvailabilityBoard,
  AvailabilityMark,
  BillingSummary,
  BookingEntry,
  BookingKind,
  BookingStatus,
  BudgetSummary,
  BuyCreditsInput,
  CalendarTrip,
  Character,
  Comment,
  CommentTarget,
  CoverageSummary,
  CreateItemInput,
  CreateLeadInput,
  CreateTripInput,
  CreatePollInput,
  CreatorProfile,
  CurrentUser,
  DiscountCode,
  EarningsStatement,
  DateWindow,
  DestinationSuggestion,
  DreamItem,
  ExpenseEntry,
  ExpenseSummary,
  ExploreFilters,
  ExploreResult,
  ExportFormat,
  ExportResult,
  Inbox,
  FlightLegInput,
  InviteLink,
  InvitePreview,
  LockedDates,
  Member,
  MemberProfile,
  MoveItemInput,
  Order,
  ParsedTicket,
  PastTrip,
  PhotoBookOptions,
  PhotoBookTheme,
  PlanDay,
  PlanItem,
  PlanVariant,
  PlanVersion,
  Poi,
  Poll,
  PrepTask,
  ProviderMode,
  PublicTripPayload,
  RedemptionBoard,
  ReviewBoard,
  SaveReviewInput,
  ShareState,
  Subscription,
  SubscriptionPlan,
  Trip,
  TripConflict,
  TripDocument,
  TripPhoto,
  TripOverview,
  TripRecap,
  TripRoute,
  TripSummary,
  TripVisibility,
  UpdateTripInput,
  UploadDocumentInput,
  UploadPhotoInput,
  VariantList,
  VariantVotes,
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
  billing: BillingRepo;
  share: ShareRepo;
  poi: PoiRepo;
  photos: PhotoRepo;
  documents: DocumentRepo;
  community: CommunityRepo;
  reviews: ReviewRepo;
  rewards: RewardRepo;
  leads: LeadRepo;
  profile: ProfileRepo;
  admin: AdminRepo;
  meta: MetaRepo;
}

export interface AuthRepo {
  /** null for an anonymous visitor — never throws. */
  me(): Promise<CurrentUser | null>;
  /**
   * Mock mode signs in a seeded user and returns them; live mode returns a URL
   * to follow. `next` is where the user should land once signed in — live mode
   * carries it across the OAuth round trip, mock mode leaves it to the caller.
   */
  startLogin(
    provider: 'line' | 'google',
    next?: string,
  ): Promise<{ redirectUrl: string | null; user: CurrentUser | null }>;
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
  /** The read-only archive of a finished trip (M17 — A17.4). */
  recap(tripId: string): Promise<TripRecap>;
  stats(): Promise<YearStats>;
}

export interface MemberRepo {
  list(tripId: string): Promise<Member[]>;
  invite(tripId: string, role: 'editor' | 'viewer'): Promise<InviteLink>;
  /** What the invite landing page shows before asking anyone to sign in. */
  preview(token: string): Promise<InvitePreview>;
  join(token: string): Promise<{ tripId: string }>;
  updateRole(tripId: string, memberId: string, role: 'owner' | 'editor' | 'viewer'): Promise<Member>;
  remove(tripId: string, memberId: string): Promise<void>;

  /** My trip-scoped profile (A3.1); a default with `filled:false` if unset. */
  myProfile(tripId: string): Promise<MemberProfile>;
  saveProfile(
    tripId: string,
    input: Omit<MemberProfile, 'userId' | 'filled'>,
  ): Promise<MemberProfile>;
  /** Every member's saved profile — the AI dialog and conflict check read these. */
  profiles(tripId: string): Promise<MemberProfile[]>;
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

  /* ---- variants & compare (M6) ---- */

  variants(tripId: string): Promise<VariantList>;
  /** Snapshots the live plan as a named candidate (A6.1). */
  forkVariant(tripId: string, input: { label: string; keyDecision?: string }): Promise<PlanVariant>;
  /** Asks the AI for 2–3 candidates in one job (A6.2). Costs one credit each. */
  generateVariants(tripId: string, input: { count: 2 | 3; brief?: string }): Promise<AiJob>;
  voteVariant(tripId: string, variantId: string, value: -1 | 0 | 1): Promise<VariantVotes>;
  /** Owner only — writes the candidate over the live plan. */
  adoptVariant(tripId: string, variantId: string): Promise<PlanDay[]>;
  removeVariant(tripId: string, variantId: string): Promise<void>;
  /** Owner only — "ตกลงตามนี้": edits refuse until unfrozen (A6.4). */
  freeze(tripId: string): Promise<Trip>;
  unfreeze(tripId: string): Promise<Trip>;
  /** The pre-generate disagreement check (A6.5). */
  conflicts(tripId: string): Promise<TripConflict[]>;
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
  /**
   * Buys extra drafts and files the receipt (M20): a purchase returns the order
   * it created, so the payment sheet can link straight to it. Mock mode always
   * succeeds and says the charge was simulated.
   */
  buyCredits(
    tripId: string,
    input: BuyCreditsInput,
  ): Promise<AiCredits & { simulated: boolean; order: Order | null }>;
}

/**
 * Bill & Payment (M20).
 *
 * Read-only on purpose. An order is written by whatever was sold — buying
 * drafts today, a subscription renewal later — never by the screen that lists
 * them. What this contract owes the UI is the history and the receipts.
 */
export interface BillingRepo {
  /** Headline numbers plus the standing plan. */
  summary(): Promise<BillingSummary>;
  /** Newest first. */
  orders(): Promise<Order[]>;
  /** One receipt; null when the id belongs to nothing this user bought. */
  order(orderId: string): Promise<Order | null>;
  subscription(): Promise<Subscription>;
  /** The price list. One entry today, and it is not on sale yet. */
  plans(): Promise<SubscriptionPlan[]>;
}

export interface ShareRepo {
  state(tripId: string): Promise<ShareState>;
  setVisibility(tripId: string, visibility: TripVisibility): Promise<ShareState>;
  rotateToken(tripId: string): Promise<ShareState>;
  exportTrip(tripId: string, format: ExportFormat): Promise<ExportResult>;
  /** Read-only payload behind /s/:token and /p/:slug. */
  publicTrip(tokenOrSlug: string): Promise<PublicTripPayload | null>;

  /* ---- public model (M11) ---- */

  /** The explore feed of published trips (A11.2). */
  explore(filters: ExploreFilters): Promise<ExploreResult>;
  /** A creator's public page (W11.2); null when the handle matches nobody. */
  creator(handle: string): Promise<CreatorProfile | null>;
  /** Copies a published trip into MY account (A11.1). Requires sign-in. */
  cloneFromPublic(tokenOrSlug: string): Promise<Trip>;

  /**
   * What copying this plan into my own dates, group and budget would change
   * (A11.4). Writes nothing — this is the preview the confirm dialog shows.
   */
  adaptPreview(tokenOrSlug: string, input: AdaptInput): Promise<AdaptDiff>;
  /** The same copy with those changes applied. Requires sign-in. */
  cloneAdapted(tokenOrSlug: string, input: AdaptInput): Promise<{ trip: Trip; diff: AdaptDiff }>;
}

/**
 * Trip photos (M18). Uploads are `File`s already resized in the browser —
 * see lib/image.ts `photoFromFile`; the repo never resizes for you, because
 * a 12MB original crossing hotel wifi is the thing that has to not happen.
 */
export interface PhotoRepo {
  list(tripId: string, filter?: { dayId?: string; itemId?: string; userId?: string }): Promise<TripPhoto[]>;
  upload(tripId: string, input: UploadPhotoInput): Promise<TripPhoto>;
  remove(tripId: string, photoId: string): Promise<void>;
  /** The palettes the renderer can print (Photo Book V2). */
  photoBookThemes(tripId: string): Promise<PhotoBookTheme[]>;
  /** The printable photo book (A18.4) — a URL the caller opens in a tab. */
  photoBookUrl(tripId: string, options?: PhotoBookOptions): string;
}

/** The document folder (M19): tickets, vouchers, insurance papers. */
export interface DocumentRepo {
  list(tripId: string): Promise<TripDocument[]>;
  upload(tripId: string, input: UploadDocumentInput): Promise<TripDocument>;
  remove(tripId: string, documentId: string): Promise<void>;
}

/**
 * The parts of a room that are about the people in it (M9): the inbox, polls,
 * and who is looking right now.
 */
export interface CommunityRepo {
  /** Everything addressed to me, across every trip. */
  inbox(): Promise<Inbox>;
  /** Empty id marks the whole inbox read. */
  markRead(notificationId?: string): Promise<Inbox>;

  polls(tripId: string): Promise<Poll[]>;
  createPoll(tripId: string, input: CreatePollInput): Promise<Poll>;
  /** -1 withdraws the answer, same gesture as un-voting a variant. */
  answerPoll(tripId: string, pollId: string, option: number): Promise<Poll>;
  closePoll(tripId: string, pollId: string): Promise<Poll>;
  removePoll(tripId: string, pollId: string): Promise<void>;

  /**
   * "I am here" — fire and forget (W9.3). Nothing is stored: presence is true
   * for a few seconds and false after, which is an event, not a row.
   */
  ping(tripId: string, state: { typing: boolean; tab: string }): Promise<void>;
}

/**
 * Trip reviews (M21 — A11.5): how it went, and what it really cost.
 *
 * Member-only and post-trip. The roll-up is public — it rides along with the
 * published plan — but writing one is something only the people who went can
 * do, and only once the trip is behind them.
 */
export interface ReviewRepo {
  list(tripId: string): Promise<ReviewBoard>;
  /** Upsert: saving again replaces my review rather than adding a second. */
  save(tripId: string, input: SaveReviewInput): Promise<ReviewBoard>;
  remove(tripId: string): Promise<void>;
}

/**
 * What points turn into and what a published plan earns (M22).
 *
 * Two currencies, kept apart on purpose: points are a score this product
 * mints, earnings are money a partner owes in baht.
 */
export interface RewardRepo {
  /** My balance, the tiers I can afford, and the codes I already hold. */
  redemptions(): Promise<RedemptionBoard>;
  /** Burns the points and returns the code (A12.10). */
  redeem(amountThb: number): Promise<DiscountCode>;
  /** What my public plans have earned me, and what has been paid (A12.11). */
  earnings(): Promise<EarningsStatement>;
}

/** Handing a trip to a partner agent (A12.12). */
export interface LeadRepo {
  list(tripId: string): Promise<AgentLead[]>;
  create(tripId: string, input: CreateLeadInput): Promise<AgentLead>;
}

export interface PoiRepo {
  search(query: string, city?: string): Promise<Poi[]>;
  get(poiId: string): Promise<Poi | null>;
}

export interface AdminRepo {
  stats(): Promise<AdminStats>;
}

/**
 * "Is what I am looking at real?"
 *
 * Asked through the repository like everything else, so the answer comes from
 * whichever half of the app is actually serving the screen: mock mode answers
 * from its own definition (nothing is real, nothing is stored), live mode asks
 * the API which providers it is standing in for.
 */
export interface MetaRepo {
  mode(): Promise<ProviderMode>;
}

export interface ProfileRepo {
  characters(): Promise<Character[]>;
  dreams(): Promise<DreamItem[]>;
  addDream(input: Omit<DreamItem, 'id'>): Promise<DreamItem>;
  removeDream(dreamId: string): Promise<void>;
}
