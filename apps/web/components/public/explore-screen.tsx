'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, Search, Sparkles } from 'lucide-react';

import { BrowseShell } from '@/components/common/browse-shell';
import { MatchBadge } from '@/components/public/match-badge';
import { TravellerReviewsSection } from '@/components/public/traveller-reviews';
import { Stars } from '@/components/trip/trip-review';
import { TripCover } from '@/components/trip/trip-cover';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { bareInputClass, fieldShellClass } from '@/components/ui/field';
import { useMe } from '@/features/auth/queries';
import { useExplore } from '@/features/public/queries';
import { useTrips } from '@/features/trip/queries';
import type { ExploreTrip } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Explore (M11 — W11.1): plans other people published, worth copying. The
 * filters are the questions a traveller actually asks — where, and what is
 * good — not a faceted search nobody fills in.
 */

const PAGE_SIZE = 12;

const QUICK_FILTERS = [
  { id: '', label: 'ทั้งหมด' },
  { id: 'tokyo', label: 'โตเกียว' },
  { id: 'osaka', label: 'โอซาก้า' },
  { id: 'seoul', label: 'โซล' },
];

export function ExploreScreen({ signedIn }: { signedIn: boolean }) {
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState('');
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const [pages, setPages] = useState(1);
  /** The trip to rank against, empty for the plain feed (A11.3). */
  const [matchTripId, setMatchTripId] = useState('');

  const { data: me } = useMe();
  const { data: myTrips } = useTrips();
  const matchable = myTrips ?? [];

  const { data, isLoading, isError } = useExplore({
    q: query || quick,
    sort,
    match: matchTripId || undefined,
    limit: PAGE_SIZE * pages,
    offset: 0,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const matching = Boolean(matchTripId);

  return (
    <BrowseShell
      signedIn={signedIn}
      width="wide"
      // Anonymous only: a signed-in reader already has "สร้างทริป" in the
      // middle of the bottom bar and in the desktop nav.
      actions={
        <ButtonLink href="/new" size="sm" variant="soft">
          เริ่มทริปของฉัน
        </ButtonLink>
      }
    >
      <h1 className="font-display text-ink mt-6 text-2xl font-bold tracking-tight">
        ตามรอยทริปที่คนไปมาแล้วจริงๆ
      </h1>
      <p className="text-muted mt-1 text-sm">
        ทุกแพลนคือทริปจริงที่เจ้าของเปิดสาธารณะ — กดก๊อปไปเป็นของตัวเองแล้วแก้ต่อได้เลย
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className={cn(fieldShellClass, 'sm:max-w-xs')}>
          <Search className="text-muted size-4 shrink-0" />
          <input
            className={cn(bareInputClass, 'ml-2')}
            placeholder="ค้นหาเมืองหรือชื่อทริป"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPages(1);
            }}
          />
        </label>

        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => {
                setQuick(filter.id);
                setQuery('');
                setPages(1);
              }}
              className={cn(
                'font-display rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
                quick === filter.id && !query
                  ? 'bg-ink text-bg'
                  : 'bg-surface text-ink hover:bg-border',
              )}
            >
              {filter.label}
            </button>
          ))}

          <span className="bg-border mx-1 h-4 w-px shrink-0" />

          {(['popular', 'new'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setSort(mode);
                setMatchTripId('');
                setPages(1);
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition',
                sort === mode && !matching
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted hover:bg-surface',
              )}
            >
              {mode === 'popular' ? 'ยอดนิยม' : 'มาใหม่'}
            </button>
          ))}
        </div>
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
            <div key={i} className="rounded-brand bg-surface h-64 animate-pulse" />
          ))}
        </div>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-ink text-sm font-medium">ยังไม่เจอแพลนที่ตรงกับที่ค้นหา</p>
          <p className="text-muted mt-1 text-xs">ลองคำอื่น หรือเป็นคนแรกที่เปิดทริปแนวนี้ให้คนอื่นตามรอย</p>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((trip) => (
          <ExploreCard key={trip.slug} trip={trip} />
        ))}
      </div>

      {items.length < total ? (
        <div className="mt-6 flex justify-center">
          <Button variant="soft" onClick={() => setPages((p) => p + 1)}>
            ดูเพิ่ม ({items.length}/{total})
          </Button>
        </div>
      ) : null}

      {/*
        W24.2 — under the feed rather than above it. Somebody who scrolled this
        far is deciding whether following a plan is worth it, and a review is
        the only thing on this page written by someone who actually went.
      */}
      <TravellerReviewsSection className="mt-14" limit={3} label="คนที่เที่ยวตามบอกว่า" />
    </BrowseShell>
  );
}

function ExploreCard({ trip }: { trip: ExploreTrip }) {
  return (
    <Link
      href={`/p/${trip.slug}` as never}
      className="group block transition hover:-translate-y-0.5"
    >
      <Card className="overflow-hidden p-0">
        <TripCover src={trip.cover} frame="card" />
        <div className="p-3.5">
          {trip.match ? <MatchBadge match={trip.match} className="mb-2" /> : null}
          <p className="text-ink line-clamp-1 text-sm font-bold">{trip.title}</p>
          <p className="text-muted mt-0.5 line-clamp-1 text-xs">
            {trip.days} วัน · {trip.cities.join(' · ')}
            {trip.budgetPerPersonThb > 0
              ? ` · ~฿${trip.budgetPerPersonThb.toLocaleString('th-TH')}/คน`
              : ''}
          </p>
          {trip.reviews.count > 0 ? (
            <p className="text-muted mt-1.5 flex items-center gap-1.5 text-[11px]">
              <Stars value={Math.round(trip.reviews.averageRating)} />
              {trip.reviews.averageRating} ({trip.reviews.count})
              {trip.reviews.budgetSaid > 0
                ? ` · ใช้จริง ฿${trip.reviews.actualBudgetPerPerson.toLocaleString('th-TH')}/คน`
                : ''}
            </p>
          ) : null}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CharacterAvatar characterId={trip.creator.characterId} size="xs" />
              <span className="text-muted text-[11px]">{trip.creator.name}</span>
            </span>
            <span className="text-muted flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-0.5">
                <Eye className="size-3" />
                {trip.viewCount.toLocaleString('th-TH')}
              </span>
              <span className="flex items-center gap-0.5">
                <Copy className="size-3" />
                {trip.cloneCount.toLocaleString('th-TH')}
              </span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
