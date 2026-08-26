'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * Trip room tabs (DEV_SPEC §3.2). "วันเดินทาง" comes first because a trip with
 * no agreed dates cannot meaningfully have a plan or a budget yet — it is the
 * step the group is actually on.
 *
 * Labels come from messages/th.json (W0.6) — this strip is the proof the
 * next-intl pipe works, so a second language starts here.
 */
const TABS = [
  { segment: '', key: 'overview' },
  { segment: 'dates', key: 'dates' },
  { segment: 'wishlist', key: 'wishlist' },
  { segment: 'plan', key: 'plan' },
  { segment: 'budget', key: 'budget' },
  { segment: 'expense', key: 'expense' },
  { segment: 'prep', key: 'prep' },
  { segment: 'bookings', key: 'bookings' },
  { segment: 'photos', key: 'photos' },
  { segment: 'documents', key: 'documents' },
  { segment: 'discussion', key: 'discussion' },
] as const;

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const t = useTranslations('trip');
  const base = `/t/${tripId}`;

  return (
    <nav className="bg-bg/90 sticky top-14 z-20 backdrop-blur-md">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2.5">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;

          return (
            <Link
              key={tab.key}
              href={href as never}
              className={cn(
                'font-display rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition',
                active ? 'bg-espresso text-bg' : 'text-muted hover:bg-surface',
              )}
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
