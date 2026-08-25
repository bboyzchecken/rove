/**
 * The query key factory. Every useQuery/invalidateQueries call in the app goes
 * through here so keys can never drift apart (DEV_SPEC §7.1, §17).
 *
 * Trip-scoped keys all start with ['trip', tripId] so one SSE event can
 * invalidate an entire room with a single prefix.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  /** Which providers behind this screen are real — see features/meta. */
  mode: () => ['meta', 'mode'] as const,
  characters: () => ['characters'] as const,
  dreams: () => ['dreams'] as const,
  inbox: () => ['inbox'] as const,

  /**
   * Bill & Payment (M20). Not trip-scoped: a receipt outlives the trip it was
   * bought for, and a subscription belongs to nobody's trip at all.
   */
  billing: () => ['billing'] as const,
  billingSummary: () => ['billing', 'summary'] as const,
  billingOrders: () => ['billing', 'orders'] as const,
  billingOrder: (orderId: string) => ['billing', 'orders', orderId] as const,
  billingSubscription: () => ['billing', 'subscription'] as const,
  billingPlans: () => ['billing', 'plans'] as const,

  trips: () => ['trips'] as const,
  tripsUpcoming: () => ['trips', 'upcoming'] as const,
  tripsPast: () => ['trips', 'past'] as const,
  stats: () => ['stats'] as const,

  airports: (query: string) => ['airports', query] as const,

  trip: (tripId: string) => ['trip', tripId] as const,
  tripRoute: (tripId: string) => ['trip', tripId, 'route'] as const,
  tripOverview: (tripId: string) => ['trip', tripId, 'overview'] as const,
  tripMembers: (tripId: string) => ['trip', tripId, 'members'] as const,
  tripProfileMe: (tripId: string) => ['trip', tripId, 'profile', 'me'] as const,
  tripProfiles: (tripId: string) => ['trip', tripId, 'profiles'] as const,
  tripActivity: (tripId: string) => ['trip', tripId, 'activity'] as const,
  tripRecap: (tripId: string) => ['trip', tripId, 'recap'] as const,

  dateBoard: (tripId: string, month?: string) => ['trip', tripId, 'dates', month ?? 'current'] as const,
  dateWindows: (tripId: string) => ['trip', tripId, 'dates', 'windows'] as const,
  destinations: (tripId: string) => ['trip', tripId, 'destinations'] as const,

  wishlist: (tripId: string) => ['trip', tripId, 'wishlist'] as const,
  coverage: (tripId: string) => ['trip', tripId, 'coverage'] as const,

  planDays: (tripId: string) => ['trip', tripId, 'plan'] as const,
  planVersions: (tripId: string) => ['trip', tripId, 'plan', 'versions'] as const,
  variants: (tripId: string) => ['trip', tripId, 'variants'] as const,
  conflicts: (tripId: string) => ['trip', tripId, 'conflicts'] as const,
  prepNote: (tripId: string) => ['trip', tripId, 'prep', 'note'] as const,
  budget: (tripId: string) => ['trip', tripId, 'budget'] as const,
  expenses: (tripId: string) => ['trip', tripId, 'expenses'] as const,
  prep: (tripId: string) => ['trip', tripId, 'prep'] as const,
  photos: (tripId: string, filter = '') => ['trip', tripId, 'photos', filter] as const,
  documents: (tripId: string) => ['trip', tripId, 'documents'] as const,
  polls: (tripId: string) => ['trip', tripId, 'polls'] as const,
  bookings: (tripId: string) => ['trip', tripId, 'bookings'] as const,
  bookingOffers: (tripId: string, kind: string) => ['trip', tripId, 'bookings', 'offers', kind] as const,

  comments: (tripId: string, targetType: string, targetId: string) =>
    ['trip', tripId, 'comments', targetType, targetId] as const,
  votes: (tripId: string, targetType: string, targetId: string) =>
    ['trip', tripId, 'votes', targetType, targetId] as const,

  aiCredits: (tripId: string) => ['trip', tripId, 'ai', 'credits'] as const,
  aiJob: (tripId: string, jobId: string) => ['trip', tripId, 'ai', 'job', jobId] as const,

  share: (tripId: string) => ['trip', tripId, 'share'] as const,
  publicTrip: (tokenOrSlug: string) => ['public', tokenOrSlug] as const,
  reviews: (tripId: string) => ['trip', tripId, 'reviews'] as const,
  /** Points out and money owed (M22). Both belong to a person, not a trip. */
  redemptions: () => ['me', 'redemptions'] as const,
  earnings: () => ['me', 'earnings'] as const,
  leads: (tripId: string) => ['trip', tripId, 'leads'] as const,
  photoBookThemes: (tripId: string) => ['trip', tripId, 'photobook', 'themes'] as const,
  explore: (filters: string) => ['explore', filters] as const,
  creator: (handle: string) => ['creator', handle] as const,
  /** The diff a copy would apply — keyed by the frame it was asked for. */
  adaptPreview: (tokenOrSlug: string, input: string) =>
    ['adapt-preview', tokenOrSlug, input] as const,

  poiSearch: (q: string, city?: string) => ['poi', 'search', q, city ?? ''] as const,

  /** Pre-auth invite landing page — keyed by token, not tripId. */
  invitePreview: (token: string) => ['invite', token] as const,
} as const;
