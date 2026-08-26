import type { PlatformStats } from '@/lib/data';

/**
 * When the platform's own numbers are worth showing (M24 — W24.1).
 *
 * W24.1 says it plainly: real numbers only, and if there are too few, hide the
 * section rather than round up or invent. That rule needs a threshold, and the
 * threshold needs to live somewhere both halves can read — the landing section
 * that hides itself, and the admin overview that has to be able to answer "why
 * is nothing showing on the front page?" without anyone reading the source.
 *
 * The numbers are set where a figure stops being a fact about the seed data
 * and starts being a fact about the product. Both conditions have to hold, so
 * one busy creator cannot trip it alone.
 */
export const SOCIAL_PROOF_MIN = {
  planners: 25,
  publicTrips: 10,
  /** An average of two ratings is an anecdote with a decimal point on it. */
  reviews: 10,
} as const;

/** Whether the landing page will render its statistics section right now. */
export function showsPlatformStats(stats: PlatformStats | undefined): boolean {
  if (!stats) return false;
  return stats.planners >= SOCIAL_PROOF_MIN.planners && stats.publicTrips >= SOCIAL_PROOF_MIN.publicTrips;
}

/** Whether that section will quote an average rating as well as counts. */
export function showsAverageRating(stats: PlatformStats | undefined): boolean {
  if (!stats) return false;
  return stats.reviews >= SOCIAL_PROOF_MIN.reviews && stats.averageRating > 0;
}

/**
 * What is still missing before the landing section appears, in words.
 *
 * Empty when it is already showing. Written for the admin overview, where the
 * question is not "is it hidden" but "what has to happen for it to stop being
 * hidden".
 */
export function missingForPlatformStats(stats: PlatformStats | undefined): string[] {
  if (!stats) return [];

  // Phrased as bare quantities — the sentence around them supplies the "อีก",
  // and saying it twice is how the first draft of this read.
  const missing: string[] = [];
  if (stats.planners < SOCIAL_PROOF_MIN.planners) {
    missing.push(`คนวางแพลน ${SOCIAL_PROOF_MIN.planners - stats.planners} คน`);
  }
  if (stats.publicTrips < SOCIAL_PROOF_MIN.publicTrips) {
    missing.push(`แพลนสาธารณะ ${SOCIAL_PROOF_MIN.publicTrips - stats.publicTrips} ใบ`);
  }
  return missing;
}
