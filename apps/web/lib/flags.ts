/**
 * Feature flags. Phase gating lives here so a half-finished Phase 2 feature can
 * sit in main without shipping (DEV_SPEC §0: no features outside the current phase).
 */
export const flags = {
  planVariants: false, // M6 — Phase 2
  publicExplore: false, // M11 — Phase 2
  booking: true, // M12 — Phase 1
  aiRefine: true, // M4
} as const;

export type FlagName = keyof typeof flags;

export function isEnabled(name: FlagName) {
  return flags[name];
}
