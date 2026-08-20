'use client';

import posthog from 'posthog-js';

import { env } from './env';

/**
 * Analytics (DEV_SPEC §13). Every event name is declared here rather than
 * passed as a loose string, because a typo in an event name is invisible until
 * a funnel is silently missing a step weeks later.
 *
 * With no PostHog key configured, every call below is a no-op — local
 * development never sends anything.
 */

export type AnalyticsEvent =
  // Trip & plan
  | { name: 'trip_created'; props: { entry_type: string } }
  | { name: 'member_invited'; props?: { role?: string } }
  | { name: 'member_joined'; props?: Record<string, never> }
  | { name: 'wishlist_item_added'; props: { kind: string } }
  | { name: 'profile_completed'; props: { pace: string } }
  | { name: 'ai_generate_started'; props?: Record<string, never> }
  | { name: 'ai_generate_finished'; props: { ms: number; issues: number } }
  | { name: 'ai_refine_applied'; props: { diff_count: number } }
  | { name: 'item_added'; props: { source: string } }
  | { name: 'item_moved'; props: { source: string } }
  | { name: 'item_deleted'; props: { source: string } }
  | { name: 'vote_cast'; props: { target_type: string } }
  | { name: 'plan_frozen'; props?: Record<string, never> }
  | { name: 'budget_viewed'; props?: Record<string, never> }
  | { name: 'export'; props: { format: string } }
  | { name: 'share_link_created'; props: { visibility: string } }
  | { name: 'trip_published'; props: { has_points_incentive: boolean } }
  | { name: 'public_plan_viewed'; props: { slug: string } }
  | { name: 'trip_cloned'; props?: Record<string, never> }
  | { name: 'booking_click'; props: { partner: string; item_type: string } }
  | { name: 'booking_marked'; props: { status: string } }
  // Personal features
  | { name: 'character_selected'; props: { character_id: number } }
  | { name: 'dream_item_added'; props?: Record<string, never> }
  | { name: 'dream_item_converted_to_trip'; props?: Record<string, never> }
  | { name: 'expense_added'; props: { split_type: string; category: string } }
  | { name: 'expense_summary_viewed'; props?: Record<string, never> }
  | { name: 'points_balance_viewed'; props?: Record<string, never> }
  | { name: 'home_dashboard_viewed'; props?: Record<string, never> }
  | { name: 'calendar_viewed'; props?: Record<string, never> };

let started = false;

export function initAnalytics() {
  if (started || typeof window === 'undefined' || !env.posthogKey) return;
  started = true;

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    // The App Router changes the URL without a page load, so pageviews are
    // captured by the route hook below instead.
    capture_pageview: false,
    // Nothing on a trip page is safe to record blind: it carries names, wishes
    // and money.
    autocapture: false,
    person_profiles: 'identified_only',
  });
}

export function track<E extends AnalyticsEvent>(event: E) {
  if (typeof window === 'undefined' || !env.posthogKey) return;
  posthog.capture(event.name, event.props ?? {});
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !env.posthogKey) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (typeof window === 'undefined' || !env.posthogKey) return;
  posthog.reset();
}

export function capturePageview(path: string) {
  if (typeof window === 'undefined' || !env.posthogKey) return;
  posthog.capture('$pageview', { $current_url: path });
}
