'use client';

import posthog from 'posthog-js';

import { DATA_MODE } from './data/mode';
import { env } from './env';

/**
 * Product analytics (DEV_SPEC §13).
 *
 * One typed event map, one `track()`. Every name and payload in the spec's
 * funnels is declared here, so a funnel that stops working is a compile error
 * rather than a dashboard that silently goes flat.
 *
 * Nothing is sent without a key, and nothing identifies a person beyond the
 * id they already have: no e-mail, no trip titles, no wish text. What someone
 * wants out of their holiday is not telemetry.
 */
export interface AnalyticsEvents {
  // M1 — the three doors: a booked route, dates first, or no dates at all.
  trip_created: { entry_type: 'route' | 'date' | 'clone' | 'coordinate' };
  /** How the legs got there — typed by hand, or read out of a pasted ticket. */
  route_built: { legs: number; countries: number; source: 'manual' | 'ticket' };
  member_invited: { role: 'editor' | 'viewer' };
  member_joined: Record<string, never>;
  wishlist_item_added: { kind: 'must' | 'nice' | 'avoid' };
  profile_completed: Record<string, never>;

  // M2.5 — the date board.
  availability_marked: { days: number; mark: 'free' | 'maybe' | 'clear' };
  availability_submitted: Record<string, never>;
  dates_locked: { days: number; everyone: boolean };
  destination_chosen: { destination_id: string; fit: number };

  ai_generate_started: { pace: string; has_brief: boolean };
  ai_generate_finished: { ms: number; simulated: boolean; days: number };
  ai_draft_applied: { days: number; items: number };
  ai_credits_purchased: { quantity: number; channel: string };

  // M18/M19 — memories and paperwork.
  photo_uploaded: { from_item: boolean };
  photobook_export_started: { format: 'pdf' | 'print' };
  document_uploaded: { category: string };

  // M6 — variants & compare.
  plan_variant_created: Record<string, never>;
  vote_cast: Record<string, never>;
  plan_frozen: Record<string, never>;

  item_added: { source: 'poi_search' | 'free_text' };
  item_moved: { same_day: boolean };
  item_deleted: Record<string, never>;
  plan_undo: Record<string, never>;

  budget_viewed: Record<string, never>;
  budget_set: { per_person_thb: number };
  expense_added: { split_type: 'shared' | 'personal'; category: string };
  expense_summary_viewed: Record<string, never>;
  expense_settled: Record<string, never>;

  trip_recap_viewed: { has_decisions: boolean };

  export: { format: 'pdf' | 'ics' | 'json' | 'html' };
  share_link_created: { visibility: 'link' | 'public' };
  trip_published: { has_points_incentive: boolean };
  public_plan_viewed: { slug: string };
  trip_cloned: Record<string, never>;

  booking_click: { partner: string; item_type: string };
  booking_marked: { status: 'booked' | 'cancelled' };

  character_selected: { character_id: string };
  dream_item_added: Record<string, never>;
  dream_item_converted_to_trip: Record<string, never>;
  points_balance_viewed: Record<string, never>;

  // M20 — bill & payment.
  billing_viewed: { orders: number };
  receipt_viewed: { kind: 'ai_credit' | 'subscription' | 'points_topup' };
  home_dashboard_viewed: Record<string, never>;
  calendar_viewed: Record<string, never>;
}

let started = false;

/**
 * Called once from the provider tree. Without a key this is a no-op, which is
 * the normal state in development and in every UAT run.
 */
export function initAnalytics() {
  if (started || typeof window === 'undefined' || !env.posthogKey) return;
  started = true;

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    // The app is a handful of routes with client navigation; capturing views
    // manually is what keeps a trip id out of the URL property.
    capture_pageview: false,
    autocapture: false,
    persistence: 'localStorage',
  });

  // Mock and live traffic must never end up in the same funnel.
  posthog.register({ data_mode: DATA_MODE });
}

export function track<K extends keyof AnalyticsEvents>(
  event: K,
  properties: AnalyticsEvents[K],
) {
  if (!env.posthogKey || !started) return;
  posthog.capture(event, properties);
}

/** Ties events to the signed-in user once they are known. */
export function identify(userId: string) {
  if (!env.posthogKey || !started) return;
  posthog.identify(userId);
}

export function resetAnalytics() {
  if (!env.posthogKey || !started) return;
  posthog.reset();
}
