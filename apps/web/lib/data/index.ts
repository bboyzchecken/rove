import { liveRepo } from './live/repo';
import { DATA_MODE, isMockMode } from './mode';
import { mockRepo } from './mock/repo';
import type { RoveRepo } from './repo';

/**
 * The one door to data.
 *
 * Everything above this line — hooks, components, pages — imports `repo` and
 * never knows which implementation answered. Swapping NEXT_PUBLIC_DATA_MODE
 * between `mock` and `live` is therefore a deploy-time decision, not a code
 * change, which is what makes UAT on mock data and production on MySQL the
 * same application.
 */
export const repo: RoveRepo = isMockMode ? mockRepo : liveRepo;

export { DATA_MODE, isLiveMode, isMockMode, mockSkips } from './mode';
export { resetDb as resetMockData } from './mock/db';
export type * from './types';
export type { RoveRepo } from './repo';

/** Shown by the UAT banner so a tester always knows what they are looking at. */
export const dataModeLabel = DATA_MODE === 'mock' ? 'โหมดทดลอง (Mock)' : 'ต่อระบบจริง (Live)';
