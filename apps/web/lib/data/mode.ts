/**
 * Data mode — the one switch that decides where every byte in this app comes
 * from.
 *
 *   NEXT_PUBLIC_DATA_MODE=mock   UAT / demo. No backend, no database, nothing
 *                                leaves the browser: the whole flow is playable
 *                                and edits persist in localStorage, and that is
 *                                the *only* place they persist. Nothing is
 *                                saved for real, ever.
 *
 *   NEXT_PUBLIC_DATA_MODE=live   Everything goes through the Go API at
 *                                NEXT_PUBLIC_API_URL and lands in MySQL. Real
 *                                data, real writes — no exceptions.
 *
 * There is a second, independent question this file does NOT answer: whether
 * the third parties behind a live API are real (`STUB_PROVIDERS` over there).
 * A build set to `live` in front of an API with no ANTHROPIC_API_KEY stores
 * everything for real and still hands back a canned AI draft. Ask
 * `features/meta/queries` for that one — asking here would give a confident
 * wrong answer, which is exactly how a UAT tester ends up seeing "mock traces"
 * on a screen that claims to be live.
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
 * Things mock mode deliberately cannot do, as *capabilities* rather than
 * labels.
 *
 * Use this to decide whether a control can exist at all. Do NOT use it to
 * decide whether to tell the user something is simulated — that is a question
 * about the API's providers, which mock mode cannot see; `useIsStubbed` in
 * `features/meta/queries` answers it correctly in both modes.
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
  /**
   * No R2 bucket either, so an uploaded trip cover is resized in the browser
   * and kept as a data URL in this browser's copy of the trip. Live mode has
   * nowhere to put the bytes — `cover_image_url` is a 500-char column — so the
   * cover picker offers the built-in covers only until storage exists.
   */
  imageUpload: isMockMode,
} as const;
