import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteHeader } from '@/components/common/site-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { fetchExplore } from '@/features/public/api';
import { formatDateRange } from '@/lib/format';
import { route } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'ทริปสาธารณะ',
  description: 'ดูแพลนเที่ยวญี่ปุ่นที่คนอื่นเปิดให้ ก๊อปมาแก้เป็นของตัวเองได้',
};

/**
 * Browse the trips people chose to publish. Phase 1 keeps the filters to city
 * and sort order — with a small catalogue, a full filter panel mostly returns
 * empty pages (the rest is M11, Phase 2).
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; sort?: string }>;
}) {
  const filters = await searchParams;
  const { items } = await fetchExplore({
    city: filters.city ?? '',
    sort: filters.sort ?? '',
  });

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <h1 className="font-display text-2xl">ทริปที่คนอื่นเปิดให้ดู</h1>
        <p className="mt-1 text-muted">ก๊อปมาแก้วันและที่พักเป็นของตัวเองได้เลย</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip href="/explore" label="ทั้งหมด" active={!filters.city} />
          {['tokyo', 'yokohama', 'kamakura', 'fujikawaguchiko'].map((city) => (
            <FilterChip
              key={city}
              href={`/explore?city=${city}`}
              label={CITY_LABELS[city] ?? city}
              active={filters.city === city}
            />
          ))}
        </div>

        {items.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="ยังไม่มีทริปสาธารณะในหมวดนี้"
              description="เป็นคนแรกก็ได้ — เปิดทริปของคุณให้คนอื่นตาม แล้วรับแต้มเมื่อมีคนจองผ่าน"
            />
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((card) => (
              <li key={card.trip_id}>
                <Link href={card.slug ? `/p/${card.slug}` : `/s/${card.trip_id}`}>
                  <Card className="h-full transition-shadow hover:shadow-brand-lg">
                    <p className="section-label mb-1">
                      {card.destination_cities.join(' · ')}
                    </p>
                    <p className="font-display font-bold leading-snug text-espresso">
                      {card.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {card.days} วัน · {formatDateRange(card.start_date, null)}
                    </p>
                    {card.summary ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{card.summary}</p>
                    ) : null}
                    <p className="mt-3 text-xs text-muted">
                      โดย {card.author.display_name}
                      {card.clone_count > 0 ? ` · ก๊อปไปแล้ว ${card.clone_count}` : ''}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

const CITY_LABELS: Record<string, string> = {
  tokyo: 'โตเกียว',
  yokohama: 'โยโกฮาม่า',
  kamakura: 'คามาคุระ',
  fujikawaguchiko: 'ฟูจิ',
};

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={route(href)}
      className={
        active
          ? 'rounded-full bg-espresso px-3.5 py-1.5 text-sm text-white'
          : 'rounded-full bg-espresso/6 px-3.5 py-1.5 text-sm text-muted hover:bg-espresso/10'
      }
    >
      {label}
    </Link>
  );
}
