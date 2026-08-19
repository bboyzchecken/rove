/**
 * The query key factory. Every useQuery/invalidateQueries call in the app goes
 * through here so keys can never drift apart (DEV_SPEC §7.1, §17).
 */
export const queryKeys = {
  me: () => ['me'] as const,

  trips: () => ['trips'] as const,
  trip: (tripId: string) => ['trip', tripId] as const,
  tripOverview: (tripId: string) => ['trip', tripId, 'overview'] as const,
  tripMembers: (tripId: string) => ['trip', tripId, 'members'] as const,
  tripActivity: (tripId: string) => ['trip', tripId, 'activity'] as const,

  wishlist: (tripId: string) => ['trip', tripId, 'wishlist'] as const,
  coverage: (tripId: string) => ['trip', tripId, 'coverage'] as const,
  profile: (tripId: string) => ['trip', tripId, 'profile'] as const,

  plans: (tripId: string) => ['trip', tripId, 'plans'] as const,
  plan: (planId: string) => ['plan', planId] as const,
  planBudget: (planId: string) => ['plan', planId, 'budget'] as const,
  planValidate: (planId: string) => ['plan', planId, 'validate'] as const,

  prep: (tripId: string) => ['trip', tripId, 'prep'] as const,
  bookings: (tripId: string) => ['trip', tripId, 'bookings'] as const,
  comments: (tripId: string, targetType: string, targetId: string) =>
    ['trip', tripId, 'comments', targetType, targetId] as const,

  aiJob: (jobId: string) => ['ai-job', jobId] as const,
  poiSearch: (q: string, city?: string) => ['poi', 'search', q, city ?? ''] as const,
} as const;
