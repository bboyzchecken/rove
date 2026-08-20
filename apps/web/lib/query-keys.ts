/**
 * The query key factory. Every useQuery and invalidateQueries call in the app
 * goes through here so keys can never drift apart (DEV_SPEC §7.1, §17).
 *
 * Keys nest so a broad invalidation works: invalidating `trip(id)` also clears
 * that trip's members, wishlist, coverage and expense, which is exactly what an
 * SSE event usually wants.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  characters: () => ['characters'] as const,

  trips: () => ['trips'] as const,
  tripList: (page: number) => ['trips', 'list', page] as const,
  trip: (tripId: string) => ['trip', tripId] as const,
  tripOverview: (tripId: string) => ['trip', tripId, 'overview'] as const,
  tripMembers: (tripId: string) => ['trip', tripId, 'members'] as const,
  tripInvites: (tripId: string) => ['trip', tripId, 'invites'] as const,
  tripActivity: (tripId: string) => ['trip', tripId, 'activity'] as const,

  wishlist: (tripId: string) => ['trip', tripId, 'wishlist'] as const,
  coverage: (tripId: string) => ['trip', tripId, 'coverage'] as const,
  profile: (tripId: string) => ['trip', tripId, 'profile'] as const,

  plans: (tripId: string) => ['trip', tripId, 'plans'] as const,
  plan: (planId: string) => ['plan', planId] as const,
  planBudget: (planId: string) => ['plan', planId, 'budget'] as const,
  planValidate: (planId: string) => ['plan', planId, 'validate'] as const,

  expense: (tripId: string) => ['trip', tripId, 'expense'] as const,
  expenseSummary: (tripId: string) => ['trip', tripId, 'expense', 'summary'] as const,

  prep: (tripId: string) => ['trip', tripId, 'prep'] as const,
  bookings: (tripId: string) => ['trip', tripId, 'bookings'] as const,
  comments: (tripId: string, targetType: string, targetId: string) =>
    ['trip', tripId, 'comments', targetType, targetId] as const,
  discussion: (tripId: string) => ['trip', tripId, 'comments'] as const,

  aiJob: (jobId: string) => ['ai-job', jobId] as const,
  poiSearch: (q: string, city?: string) => ['poi', 'search', q, city ?? ''] as const,

  userStats: () => ['user', 'me', 'stats'] as const,
  userCalendar: () => ['user', 'me', 'calendar'] as const,
  dreams: () => ['user', 'me', 'dream'] as const,
  points: () => ['user', 'me', 'points'] as const,
  pointsHistory: () => ['user', 'me', 'points', 'history'] as const,

  invite: (token: string) => ['invite', token] as const,
  publicPlan: (token: string) => ['public', 'plan', token] as const,
  explore: (filters: string) => ['public', 'explore', filters] as const,

  adminDashboard: () => ['admin', 'dashboard'] as const,
  adminPOIs: (page: number, city: string) => ['admin', 'pois', page, city] as const,
  adminCharacters: () => ['admin', 'characters'] as const,
  adminPartners: () => ['admin', 'partners'] as const,
  adminFlags: () => ['admin', 'flags'] as const,
} as const;
