import { serverEnv } from '@/lib/env';
import type { ExploreCard, PublicPlan } from '@/types/api';

/**
 * The public endpoints live outside /api/v1 and are fetched from the server so
 * the share page can be rendered and cached (DEV_SPEC §5.11, §7.1).
 */

export async function fetchPublicPlan(token: string): Promise<PublicPlan | null> {
  const res = await fetch(`${serverEnv.apiUrl}/public/plans/${token}`, {
    // A shared plan changes rarely; a minute of cache is the difference between
    // one query per visitor and one per minute.
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicPlan;
}

export async function fetchExplore(params: Record<string, string> = {}) {
  const url = new URL('/public/explore', serverEnv.apiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) return { items: [] as ExploreCard[], total: 0 };
  return (await res.json()) as { items: ExploreCard[]; total: number };
}

/** Fire-and-forget view counter; never blocks or fails the page. */
export async function countPublicView(token: string): Promise<void> {
  try {
    await fetch(`${serverEnv.apiUrl}/public/plans/${token}/view`, {
      method: 'POST',
      cache: 'no-store',
    });
  } catch {
    // A missed view count is not worth a broken page.
  }
}
