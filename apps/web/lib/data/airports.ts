import type { Airport } from './types';

/**
 * The worldwide airport index, in the browser (M1 — A1.3).
 *
 * Live mode searches through the API; this is what mock mode searches, and it
 * is the same 3.6k-row dataset the Go service embeds — every airport with a
 * IATA code, scheduled service and a large/medium classification, which is the
 * set a flight-booking search offers.
 *
 * The JSON is ~320 kB, so it is loaded with a dynamic import: nothing pays for
 * it until someone opens the picker and types.
 *
 * Rebuild the data with `node scripts/gen-airports.mjs`.
 */

/** Row layout of airports.data.json — mirrored in the Go service. */
type Row = [
  iata: string,
  name: string,
  city: string,
  countryCode: string,
  timezone: string,
  large: 0 | 1,
  lat: number,
  lon: number,
  rank: number,
];

interface Payload {
  countries: Record<string, [th: string, en: string]>;
  thai: Record<string, [name: string, city: string]>;
  airports: Row[];
}

interface Entry {
  airport: Airport;
  rank: number;
  haystacks: string[];
}

let index: Promise<Entry[]> | null = null;

function load(): Promise<Entry[]> {
  index ??= import('./airports.data.json').then((mod) => {
    const payload = (mod.default ?? mod) as unknown as Payload;

    return payload.airports.map((row) => {
      const [iata, name, city, countryCode, timezone, large, lat, lon, rank] = row;
      const country = payload.countries[countryCode] ?? ['', ''];
      const thai = payload.thai[iata];

      const airport: Airport = {
        iata,
        name,
        nameTh: thai?.[0],
        city,
        cityTh: thai?.[1],
        countryCode,
        country: country[1] || countryCode,
        countryTh: country[0] || country[1] || countryCode,
        timezone,
        lat,
        lon,
        major: large === 1,
      };

      return {
        airport,
        rank,
        // Ordered by how strong a match against it should score: code, city,
        // name, country. Same policy as pkg/services/airports/airports.go.
        haystacks: [
          iata.toLowerCase(),
          city.toLowerCase(),
          airport.cityTh ?? '',
          name.toLowerCase(),
          airport.nameTh ?? '',
          airport.country.toLowerCase(),
          airport.countryTh,
        ],
      };
    });
  });

  return index;
}

const BASE = [0, 600, 600, 480, 480, 220, 220];
const MAX_LIMIT = 25;

/** Ranked search over the index. The scoring mirrors the Go service. */
export async function searchAirports(query: string, limit = 8): Promise<Airport[]> {
  const entries = await load();
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const take = Math.min(Math.max(limit, 1), MAX_LIMIT);

  // An empty query is the picker opening: answer with the hubs, not nothing.
  if (!q) {
    return entries
      .filter((e) => e.rank > 0)
      .slice(0, take)
      .map((e) => e.airport);
  }

  const hits: { score: number; entry: Entry }[] = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, q);
    if (score > 0) hits.push({ score, entry });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.entry.rank - a.entry.rank ||
      Number(b.entry.airport.major) - Number(a.entry.airport.major) ||
      a.entry.airport.iata.localeCompare(b.entry.airport.iata),
  );

  return hits.slice(0, take).map((h) => h.entry.airport);
}

export async function getAirport(iata: string): Promise<Airport | null> {
  const code = iata.trim().toUpperCase();
  const entries = await load();
  return entries.find((e) => e.airport.iata === code)?.airport ?? null;
}

/** Resolves several codes at once — what the route builder needs per keystroke. */
export async function getAirports(codes: string[]): Promise<Record<string, Airport>> {
  const wanted = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const entries = await load();
  const out: Record<string, Airport> = {};
  for (const entry of entries) {
    if (wanted.has(entry.airport.iata)) out[entry.airport.iata] = entry.airport;
  }
  return out;
}

function scoreEntry(entry: Entry, q: string) {
  const code = entry.haystacks[0]!;
  let best = code === q ? 1000 : code.startsWith(q) ? 700 : 0;

  for (let i = 1; i < entry.haystacks.length; i += 1) {
    best = Math.max(best, matchScore(entry.haystacks[i]!, q, BASE[i]!));
  }
  return best;
}

/** Whole value, then start of string, then start of word, then anywhere. */
function matchScore(haystack: string, q: string, base: number) {
  if (!haystack) return 0;
  if (haystack === q) return base + 120;
  if (haystack.startsWith(q)) return base + 60;

  const at = haystack.indexOf(q);
  if (at < 0) return 0;
  const before = haystack[at - 1];
  return before === ' ' || before === '-' ? base + 20 : base - 120;
}

/* ------------------------------------------------------------------ label -- */

/** 🇯🇵 from "JP" — the flag is derived, never stored. */
export function flagOf(countryCode: string) {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return '🏳️';
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** "โตเกียว" when we have it, "Tokyo" otherwise. */
export function cityLabel(airport: Airport | null | undefined, fallback = '') {
  if (!airport) return fallback;
  return airport.cityTh || airport.city || airport.iata;
}

/** "NRT · โตเกียว" — how an airport reads inside a sentence. */
export function airportLabel(airport: Airport | null | undefined, fallback = '') {
  if (!airport) return fallback;
  return `${airport.iata} · ${cityLabel(airport)}`;
}
