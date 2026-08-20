/**
 * Data mode — the one switch that decides where every byte in this app comes
 * from.
 *
 *   NEXT_PUBLIC_DATA_MODE=mock   UAT / demo. No backend, no database. The whole
 *                                flow is playable and edits persist in the
 *                                browser, but anything that needs a real third
 *                                party (AI, Maps, OAuth, payment, e-mail) is
 *                                simulated and clearly labelled.
 *
 *   NEXT_PUBLIC_DATA_MODE=live   Everything goes through the Go API at
 *                                NEXT_PUBLIC_API_URL and lands in MySQL.
 *
 * Nothing outside lib/data may read this value — components ask the repository,
 * never the mode. The single exception is the "โหมดทดลอง" banner, which exists
 * precisely to make the mode visible during UAT.
 */
export type DataMode = 'mock' | 'live';

function read(): DataMode {
  const raw = (process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock').trim().toLowerCase();
  return raw === 'live' ? 'live' : 'mock';
}

export const DATA_MODE: DataMode = read();

export const isMockMode = DATA_MODE === 'mock';
export const isLiveMode = DATA_MODE === 'live';

/**
 * Things mock mode deliberately does not do. Feature code checks these instead
 * of checking the mode, so the reason a step is skipped is written down.
 */
export const mockSkips = {
  /** No Anthropic call — the planner replays a canned draft on a timer. */
  aiGeneration: isMockMode,
  /** No OAuth round trip — sign-in picks a seeded user. */
  oauth: isMockMode,
  /** No PromptPay/card — the payment sheet always succeeds. */
  payment: isMockMode,
  /** No Google Places — POI search filters the seeded POI list. */
  places: isMockMode,
  /** No LINE/e-mail push — invites resolve to a copyable link. */
  notifications: isMockMode,
  /** No R2 upload — export returns a data URL built in the browser. */
  fileExport: isMockMode,
} as const;
