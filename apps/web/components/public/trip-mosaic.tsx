'use client';

import Image from 'next/image';
import Link from 'next/link';

import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useExplore } from '@/features/public/queries';
import { flagOf } from '@/lib/data/airports';
import type { ExploreTrip } from '@/lib/data/types';
import { COVER_HEIGHT, COVER_WIDTH } from '@/lib/covers';
import { cn } from '@/lib/utils';

/**
 * Published trips on the landing page, sized by how many people looked at them
 * (Feedback #1, หน้า 6).
 *
 * This replaces a drawing. The section it sits in says "จะไปมุมไหนของโลก ก็วาง
 * แพลนที่นี่ได้" and its lead calls the row above "ตัวอย่างจากทริปที่คนเปิด
 * สาธารณะไว้" — and what stood underneath that sentence was an illustration of
 * five landmarks. The claim was evidence-shaped and the picture was not
 * evidence, so the feedback asked for the trips themselves: "อยากได้เป็น
 * ตัวอย่างทริปจริงๆที่ทำไว้แล้ว".
 *
 * SIZE IS THE DATA, which is the part that makes this a mosaic rather than a
 * grid: "ทริปไหนคนดูเยอะคือ อันใหญ่กว่า เหมือนตารางหุ้นว่าถืออันไหนเยอะคือใหญ่
 * สุด". The feed is asked for `sort=popular`, which the API already orders by
 * `view_count + clone_count * 5`, so rank *is* position and position *is*
 * area. Nothing here re-sorts: if this component ever needs to reorder the
 * list it was given, the ranking belongs in the query instead.
 *
 * Unequal but symmetrical, per the same note ("ไม่ต้องเท่ากันแต่สมมาตร"): the
 * tiles differ in area while the block they make is a clean rectangle. See
 * SPANS.
 */

/**
 * How much of the 4-column grid each rank takes, biggest first.
 *
 * The seven add up to exactly twelve cells — 4+2+2+1+1+1+1 — so a full feed
 * lands as three flush rows and the mosaic reads as one rectangle:
 *
 *   ┌───────┬───────┐
 *   │       │   1   │   0  2x2   the most-viewed trip
 *   │   0   ├───────┤   1  2x1
 *   │       │   2   │   2  2x1
 *   ├───┬───┼───┬───┤
 *   │ 3 │ 4 │ 5 │ 6 │   3-6  1x1
 *   └───┴───┴───┴───┘
 *
 * A shorter feed does not get a ragged edge: `grid-auto-flow: dense` packs the
 * later small tiles into whatever the big ones left, and the guard below hides
 * the section entirely under four trips, which is the point at which the shape
 * stops being a mosaic and starts being an accident.
 *
 * On a phone the whole thing is two columns and only the leader is wide —
 * every tile below that is already as narrow as a tile can be and still hold
 * a country and a price.
 */
const SPANS = [
  'col-span-2 row-span-2 sm:col-span-2 sm:row-span-2',
  'col-span-2 sm:col-span-2',
  'col-span-2 sm:col-span-2',
] as const;

/** Below this the block cannot make a rectangle worth showing. */
const MIN_TRIPS = 4;
/** What SPANS is drawn for. */
const MAX_TRIPS = 7;

/**
 * The tile grounds, cycled in palette order.
 *
 * §2.5's marketing exception, and the one place on this page where a colour is
 * NOT a feature — these are trips, and a trip is not a room in the product.
 * Feedback #1 asked for the tiles to alternate ("สลับสี"), which is what makes
 * the mosaic read as a set of blocks rather than a contact sheet, and cycling
 * the six pastels is how that is done without inventing a seventh colour or
 * implying that the pink trips have something in common.
 *
 * DO NOT "fix" this to a feature mapping. A reader who tries to decode it
 * finds nothing, which is the correct answer: the colour here is rhythm.
 *
 * Every cover is generated on cream and is never re-cropped (see `TripCover`),
 * so the pastel is what fills the space around a 3:2 picture in a tile that is
 * not 3:2. That is the same rule TripCover states, with the tile's own colour
 * doing the job cream does elsewhere.
 */
const GROUNDS = [
  'bg-pink-light',
  'bg-blue-light',
  'bg-yellow-light',
  'bg-green-light',
  'bg-purple-light',
  'bg-orange-light',
] as const;

/**
 * "ญี่ปุ่น" from "JP", in the reader's own language, without a lookup table.
 *
 * A hand-kept map would cover exactly the countries we seeded and then fail
 * silently the first time somebody publishes a trip to one we did not think
 * of. `Intl.DisplayNames` knows every region code and returns the code itself
 * for anything it cannot name, so an unknown country degrades to "XK" beside
 * its flag rather than to an empty tile.
 */
const REGION = new Intl.DisplayNames(['th'], { type: 'region' });

function countryName(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return REGION.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function TripMosaicSection({ className }: { className?: string }) {
  const { data } = useExplore({ sort: 'popular', limit: MAX_TRIPS });
  const trips = (data?.items ?? []).slice(0, MAX_TRIPS);

  // No skeleton, and no empty state. Same rule as `PlatformStatsSection`: this
  // block is allowed not to exist, and a placeholder that resolves to nothing
  // is worse than arriving late. The section around it closes back up.
  if (trips.length < MIN_TRIPS) return null;

  return (
    <div className={cn('grid auto-rows-[132px] grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      {trips.map((trip, i) => (
        <Tile key={trip.slug} trip={trip} span={SPANS[i]} ground={GROUNDS[i % GROUNDS.length]!} />
      ))}
    </div>
  );
}

function Tile({ trip, span, ground }: { trip: ExploreTrip; span?: string; ground: string }) {
  // The leader carries the picture and the owner; the small tiles carry the
  // line of facts alone. Feedback #1 spelled the split out — big tiles are
  // "Photo / Country / กี่วัน งบ โปรไฟล์เจ้าของ" and small ones "Country / วัน
  // งบ" — and it is the right call: a 3:2 cover inside a 1x1 tile is a stamp,
  // and a stamp of a drawing is not evidence of anything.
  const lead = Boolean(span);

  return (
    <Link
      href={`/p/${trip.slug}` as never}
      className={cn(
        'rounded-brand group relative flex flex-col overflow-hidden p-4 transition hover:-translate-y-0.5',
        ground,
        span,
      )}
    >
      {lead ? (
        // `object-contain`, never `cover`: the artwork is 3:2 and §15 says it
        // is never re-cropped. The tile's own pastel is the leftover space.
        <Image
          src={trip.cover}
          alt=""
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
          className="min-h-0 w-full flex-1 object-contain"
        />
      ) : null}

      <div className={cn('flex flex-col', lead && 'mt-2')}>
        {/* Black on every pastel (§2.4) — the grounds above are all light
            halves of the pairs, so ink is legible on all six. */}
        <p className="t-h3 text-ink line-clamp-1">
          {flagOf(trip.country)} {countryName(trip.country)}
        </p>
        <p className="text-ink/70 t-small mt-0.5 line-clamp-1">
          {trip.days} วัน
          {trip.budgetPerPersonThb > 0
            ? ` · ~฿${trip.budgetPerPersonThb.toLocaleString('th-TH')}/คน`
            : ''}
        </p>

        {lead ? (
          <span className="text-ink/70 mt-2 flex items-center gap-1.5 text-xs">
            <CharacterAvatar characterId={trip.creator.characterId} size="xs" />
            <span className="line-clamp-1">{trip.creator.name}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}
