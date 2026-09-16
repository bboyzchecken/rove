'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Copy, Eye, Search, Sparkles, Star } from 'lucide-react';

import { VerifiedBadge } from '@/components/profile/verified-badge';
import { Flower, Spiral } from '@/components/brand/doodle';
import { HeroCanvas, heroNavCtaClass } from '@/components/brand/hero-canvas';
import { BrowseShell } from '@/components/common/browse-shell';
import { CountryChips, CountryFilterButton } from '@/components/public/country-filter';
import { MatchBadge } from '@/components/public/match-badge';
import { TravellerReviewsSection } from '@/components/public/traveller-reviews';
import { TripCover } from '@/components/trip/trip-cover';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { bareInputClass, fieldShellClass } from '@/components/ui/field';
import { useMe } from '@/features/auth/queries';
import { useExplore } from '@/features/public/queries';
import { useTrips } from '@/features/trip/queries';
import type { ExploreSort, ExploreTrip } from '@/lib/data';
import { countryName, flagOf } from '@/lib/data/countries';
import { cn } from '@/lib/utils';

/**
 * Explore (M11 — W11.1), reshaped by Feedback #2 (D-18, F4.1–F4.3, หน้า 15).
 *
 * The chips stop naming cities — four cities was already the ceiling and the
 * tester is thinking in "10–100 ประเทศ" — and become the four ways to read
 * the feed: ทั้งหมด / ยอดนิยม / มาใหม่ / ติดเทรนด์. Where you want to go is
 * the country filter beside the search box, which lists every country that
 * has a plan and takes several at once.
 *
 * The card is the tester's ref: the words on top, big; the picture below,
 * full width; the numbers as a quiet icon row at the very bottom.
 */

const PAGE_SIZE = 12;

const HERO_TAGS = [
  { label: 'ก๊อปได้เลย', tone: 'itinerary' },
  { label: 'ทริปจริง', tone: 'ink' },
  { label: 'เจ้าของเปิดเอง', tone: 'wishlist' },
  { label: 'แก้ต่อได้', tone: 'memo' },
  { label: 'มีรีวิว', tone: 'journal' },
] as const;

type Feed = 'all' | 'popular' | 'new' | 'trending';

const FEEDS: { id: Feed; hint: string; sort: ExploreSort }[] = [
  { id: 'all', hint: 'ทุกแพลนที่เปิดสาธารณะ', sort: 'popular' },
  { id: 'popular', hint: 'คนดูและก๊อปไปมากที่สุด', sort: 'popular' },
  { id: 'new', hint: 'เพิ่งเปิดสาธารณะ', sort: 'new' },
  { id: 'trending', hint: 'ยอดดูพุ่งใน 7 วันนี้', sort: 'trending' },
];

export function ExploreScreen({ signedIn }: { signedIn: boolean }) {
  const [query, setQuery] = useState('');
  const [feed, setFeed] = useState<Feed>('all');
  const [countries, setCountries] = useState<string[]>([]);
  const [pages, setPages] = useState(1);
  /** The trip to rank against, empty for the plain feed (A11.3). */
  const [matchTripId, setMatchTripId] = useState('');

  const { data: me } = useMe();
  const { data: myTrips } = useTrips();
  const matchable = myTrips ?? [];
  const t = useTranslations('explore');

  const current = FEEDS.find((f) => f.id === feed) ?? FEEDS[0]!;

  const { data, isLoading, isError } = useExplore({
    q: query || undefined,
    countries: countries.length > 0 ? countries : undefined,
    sort: current.sort,
    match: matchTripId || undefined,
    limit: PAGE_SIZE * pages,
    offset: 0,
  });

  // "ยอดนิยม" is the popular order with the plans nobody has looked at yet
  // left out — otherwise it and "ทั้งหมด" would be the same list twice.
  const items = (data?.items ?? []).filter(
    (trip) => feed !== 'popular' || trip.viewCount + trip.cloneCount * 5 > 0,
  );
  const total = feed === 'popular' ? items.length : (data?.total ?? 0);
  const matching = Boolean(matchTripId);

  return (
    <BrowseShell
      signedIn={signedIn}
      width="wide"
      actions={
        <Link href="/new" className={heroNavCtaClass}>
          เริ่มทริปของฉัน
        </Link>
      }
      hero={
        <HeroCanvas
          eyebrow="สำรวจแพลนสาธารณะ"
          headline={
            <>
              <span className="block">ตามรอยทริป</span>
              <span className="block">ที่คนไป</span>
              <span className="block">
                มาแล้ว<span className="knockout">จริงๆ.</span>
              </span>
            </>
          }
          lead="ทุกแพลนคือทริปจริงที่เจ้าของเปิดสาธารณะ — กดก๊อปไปเป็นของตัวเองแล้วแก้ต่อได้เลย"
          tags={HERO_TAGS}
          anchor={Spiral}
          anchorTone="text-green-light"
          marks={
            <Flower className="text-yellow-solid pointer-events-none absolute top-[26%] -right-14 z-20 hidden size-20 sm:block" />
          }
        />
      }
    >
      {signedIn ? (
        <h1 className="t-h2 text-ink mt-6">ตามรอยทริปที่คนไปมาแล้วจริงๆ</h1>
      ) : null}

      {/* ---------------------------------------------- search + country */}
      <div className="mt-4 flex items-center gap-2">
        <label className={cn(fieldShellClass, 'h-11 flex-1')}>
          <Search className="text-muted size-4 shrink-0" />
          <input
            className={cn(bareInputClass, 'ml-2')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPages(1);
            }}
          />
        </label>
        <CountryFilterButton
          selected={countries}
          onChange={(codes) => {
            setCountries(codes);
            setPages(1);
          }}
        />
      </div>

      <div className="mt-2">
        <CountryChips
          selected={countries}
          onChange={(codes) => {
            setCountries(codes);
            setPages(1);
          }}
        />
      </div>

      {/* ------------------------------------------------------- feeds */}
      <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto">
        {FEEDS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={feed === option.id && !matching}
            title={option.hint}
            onClick={() => {
              setFeed(option.id);
              setMatchTripId('');
              setPages(1);
            }}
            className={cn(
              'font-display rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
              feed === option.id && !matching
                ? 'bg-ink text-bg'
                : 'bg-surface text-ink hover:bg-border',
            )}
          >
            {t(option.id)}
          </button>
        ))}
      </div>

      {me && matchable.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-muted flex items-center gap-1.5 text-xs">
            <Sparkles className="size-3.5" />
            เรียงตามที่เข้ากับทริปของฉัน
          </span>
          <select
            className="bg-surface text-ink rounded-full px-3 py-1.5 text-xs font-medium outline-none"
            value={matchTripId}
            onChange={(e) => {
              setMatchTripId(e.target.value);
              setPages(1);
            }}
          >
            <option value="">ไม่ใช้ — เรียงตามปกติ</option>
            {matchable.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {matching ? (
        <p className="text-muted mt-2 text-[11px] leading-relaxed">
          คะแนนมาจากช่วงเวลา งบต่อคน สิ่งที่อยากไป และขนาดกลุ่ม — ทริปคนละประเทศไม่ถูกนับว่าเข้ากัน
        </p>
      ) : feed === 'trending' ? (
        <p className="text-muted mt-2 text-[11px] leading-relaxed">
          ติดเทรนด์ = ยอดดู 7 วันนี้เทียบกับ 7 วันก่อน — ช่วงที่ยังมีข้อมูลน้อยจะเรียงตามยอดนิยมไปก่อน
        </p>
      ) : null}

      {isError && matching ? (
        <Card className="mt-4 p-4">
          <p className="text-ink text-sm font-medium">เทียบกับทริปนี้ไม่ได้</p>
          <p className="text-muted mt-1 text-xs">
            ทริปอาจถูกลบไปแล้ว — เลือกทริปอื่นหรือกลับไปเรียงตามปกติ
          </p>
        </Card>
      ) : null}

      {isLoading && items.length === 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-brand bg-surface h-72 animate-pulse" />
          ))}
        </div>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-ink text-sm font-medium">ยังไม่เจอแพลนที่ตรงกับที่ค้นหา</p>
          <p className="text-muted mt-1 text-xs">
            ลองคำอื่น เอาประเทศออกสักอัน หรือเป็นคนแรกที่เปิดทริปแนวนี้ให้คนอื่นตามรอย
          </p>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((trip) => (
          <ExploreCard key={trip.slug} trip={trip} />
        ))}
      </div>

      {items.length < total && feed !== 'popular' ? (
        <div className="mt-6 flex justify-center">
          <Button variant="soft" onClick={() => setPages((p) => p + 1)}>
            ดูเพิ่ม ({items.length}/{total})
          </Button>
        </div>
      ) : null}

      <TravellerReviewsSection className="mt-14" limit={3} label="คนที่เที่ยวตามบอกว่า" />
    </BrowseShell>
  );
}

/**
 * The card per the ref (F4.3): the words on top — title big, then a row of
 * coloured chips for days / where / budget — the drawing below, full width,
 * and the numbers as a small icon row at the very bottom.
 */
function ExploreCard({ trip }: { trip: ExploreTrip }) {
  return (
    <Link
      href={`/p/${trip.slug}` as never}
      className="group block transition hover:-translate-y-0.5"
    >
      <Card className="flex h-full flex-col overflow-hidden p-0">
        <div className="p-4 pb-3">
          {trip.match ? <MatchBadge match={trip.match} className="mb-2" /> : null}
          <p className="font-display text-ink line-clamp-2 text-lg leading-snug font-medium">
            {trip.title}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip className="bg-yellow-light">{trip.days} วัน</Chip>
            <Chip className="bg-blue-light">
              {trip.country ? `${flagOf(trip.country)} ` : ''}
              {trip.cities.length > 0 ? trip.cities.join(' · ') : countryName(trip.country)}
            </Chip>
            {trip.budgetPerPersonThb > 0 ? (
              <Chip className="bg-orange-light">
                ~฿{trip.budgetPerPersonThb.toLocaleString('th-TH')}/คน
              </Chip>
            ) : null}
          </div>
        </div>

        <TripCover src={trip.cover} frame="card" className="mt-auto" />

        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <CharacterAvatar characterId={trip.creator.characterId} size="xs" />
            <span className="text-muted truncate text-[11px]">{trip.creator.name}</span>
            {trip.creator.verified ? <VerifiedBadge compact /> : null}
          </span>
          <span className="text-muted flex shrink-0 items-center gap-2.5 text-[11px]">
            <span className="flex items-center gap-0.5" title="ยอดดู">
              <Eye className="size-3" />
              {trip.viewCount.toLocaleString('th-TH')}
            </span>
            <span className="flex items-center gap-0.5" title="ก๊อปไปแล้ว">
              <Copy className="size-3" />
              {trip.cloneCount.toLocaleString('th-TH')}
            </span>
            {trip.reviews.count > 0 ? (
              <span className="flex items-center gap-0.5" title="รีวิว">
                <Star className="size-3" />
                {trip.reviews.averageRating} ({trip.reviews.count})
              </span>
            ) : null}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'text-ink inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
