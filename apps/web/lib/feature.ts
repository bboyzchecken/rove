/**
 * The colour-to-feature map (ROVE_BRAND_SPEC v3 §2.2, §2.5).
 *
 * §1 is blunt about why this file exists: "A user should know which part of
 * ROVE they're in from a glance at the colour, before reading anything. That
 * is the whole idea." Recognition comes from a *consistent* mapping, so the
 * mapping has to be data in one place rather than a hue picked per screen —
 * which is exactly how v2 drifted into the "generic playful" look UAT
 * rejected.
 *
 * A `Feature` is set as `data-feature` on a shell, and brand.css turns it into
 * `--feature-light` / `--feature-solid` for everything underneath. Components
 * then use `bg-feature` and `bg-feature-solid` and never name a hue at all.
 *
 * WHY THE SEGMENT MAP LIVES HERE RATHER THAN IN EACH ROUTE
 * §2.5 allows exactly one feature colour per screen. If each page set its own
 * attribute, "one per screen" would be a convention, and a new route would
 * default to whatever its author liked. Resolved centrally from the URL, a
 * screen cannot be two colours, and an unmapped route falls to `none` — which
 * renders neutral gray, i.e. visibly unfinished rather than quietly wrong.
 */
export type Feature =
  | 'itinerary'
  | 'wishlist'
  | 'countdown'
  | 'journal'
  | 'documents'
  | 'memo'
  | 'none';

/**
 * Trip-room tab → feature.
 *
 * The key is the route segment under `/t/:tripId`, and `''` is the room's own
 * overview. Several tabs share a feature, which is correct: Documents &
 * Finance is one identity covering budget, expense and documents, and a user
 * reading three orange screens learns that faster than they would learn three
 * separate hues.
 *
 * Judgement calls worth recording, since the spec names features and the app
 * has tabs:
 *
 *   dates      → countdown. The tab is "when are we going", which is the
 *                anticipation §2.2 gives yellow, not a document.
 *   bookings   → itinerary. A booking is a fixed point on the route. It is
 *                *not* Documents & Finance: orange is the "needs checking"
 *                signal, and a confirmed booking is the opposite of that.
 *   photos     → journal. Green is specified as "private writing, calm", and
 *                the photo wall is where a trip gets written down.
 *   prep       → memo. A packing checklist is quick capture, not a document.
 *   discussion → memo. Same reasoning: notes the group leaves each other.
 *   now        → itinerary. Trip Mode answers "where am I in the route".
 */
const TRIP_TABS: Record<string, Feature> = {
  '': 'countdown',
  dates: 'countdown',
  wishlist: 'wishlist',
  plan: 'itinerary',
  bookings: 'itinerary',
  now: 'itinerary',
  budget: 'documents',
  expense: 'documents',
  documents: 'documents',
  photos: 'journal',
  prep: 'memo',
  discussion: 'memo',
};

/**
 * Top-level app routes that belong to a feature.
 *
 * Most do not, and that is deliberate — §1's direction is a white page with
 * pastel rooms in it, so the account, settings and auth screens stay neutral.
 * Colouring everything would put the product back where v2 was, with colour
 * that decorates rather than locates.
 */
const APP_ROUTES: Record<string, Feature> = {
  dreams: 'wishlist',
  billing: 'documents',
  points: 'documents',
  recap: 'journal',
  /* The trip list is "how long until each of these", which is the countdown
   * feature seen from outside a room rather than a list-shaped thing of its
   * own — so its status chips read in the same yellow as the room they open. */
  trips: 'countdown',

  /* Browsing published plans, and the two pages it leads to: a plan (/p/:slug)
   * and a creator (/u/:handle). All three are about routes somebody else has
   * already walked, which is Itinerary & Map read from the outside. */
  explore: 'itinerary',
  p: 'itinerary',
  u: 'itinerary',
};

/** The trip room's feature, from the segment the layout is showing. */
export function tripFeature(segment: string | null): Feature {
  return TRIP_TABS[segment ?? ''] ?? 'none';
}

/**
 * The feature for any app pathname.
 *
 * Deliberately a plain string match rather than a route matcher: this runs on
 * every navigation in a client shell, and the answer only ever depends on the
 * first one or two segments.
 */
export function pathFeature(pathname: string): Feature {
  const [, first = '', , third] = pathname.split('/');

  // `/t/:tripId/:tab` — the room resolves through its own tab table. The trip
  // id sits between them, which is why this reads the third segment.
  if (first === 't') return tripFeature(third ?? '');

  return APP_ROUTES[first] ?? 'none';
}
