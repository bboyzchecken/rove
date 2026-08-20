'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BedDouble,
  CalendarRange,
  Heart,
  MessagesSquare,
  Receipt,
  Ticket,
  Wallet,
} from 'lucide-react';

import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Logo } from '@/components/common/logo';
import { useTripOverview } from '@/features/trip/queries';
import { useTripEvents } from '@/lib/sse';
import { formatDateRange } from '@/lib/format';
import { route } from '@/lib/routes';
import { cn } from '@/lib/utils';

/**
 * W2.1 — the trip room frame: a header, tabs on desktop, a bottom bar on
 * mobile. The SSE subscription lives here so it is opened once per trip rather
 * than once per tab, and every tab underneath sees fresh data.
 */

const tabs = [
  { key: '', label: 'ภาพรวม', icon: CalendarRange },
  { key: 'wishlist', label: 'ที่อยากไป', icon: Heart },
  { key: 'plan', label: 'แพลน', icon: CalendarRange },
  { key: 'budget', label: 'งบ', icon: Wallet },
  { key: 'expense', label: 'รายจ่าย', icon: Receipt },
  { key: 'prep', label: 'เตรียมตัว', icon: BedDouble },
  { key: 'bookings', label: 'การจอง', icon: Ticket },
  { key: 'discussion', label: 'คุยกัน', icon: MessagesSquare },
] as const;

/** The tabs that fit on a phone's bottom bar; the rest live in Overview. */
const mobileTabs = tabs.filter((t) =>
  ['', 'wishlist', 'plan', 'expense', 'discussion'].includes(t.key),
);

export function TripShell({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useTripOverview(tripId);
  const { connected } = useTripEvents(tripId);

  const base = `/t/${tripId}`;
  const current = pathname === base ? '' : pathname.replace(`${base}/`, '').split('/')[0];

  return (
    <div className="min-h-dvh pb-16 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo href="/home" size="sm" className="hidden sm:inline-flex" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold text-espresso">
                  {data?.trip.title ?? 'กำลังโหลด…'}
                </p>
                <p className="truncate text-xs text-muted">
                  {data ? formatDateRange(data.trip.start_date, data.trip.end_date) : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* A quiet dot, not a banner: people notice a missing connection
                  when something they expected did not update. */}
              <span
                title={connected ? 'อัปเดตสดอยู่' : 'กำลังเชื่อมต่อใหม่'}
                className={cn(
                  'h-2 w-2 rounded-full',
                  connected ? 'bg-matcha' : 'bg-espresso/20',
                )}
              />
              {data ? <AvatarStack members={data.members} /> : null}
            </div>
          </div>

          <nav className="hidden gap-1 overflow-x-auto pb-2 sm:flex">
            {tabs.map((tab) => (
              <TabLink
                key={tab.key}
                href={tab.key ? `${base}/${tab.key}` : base}
                label={tab.label}
                active={current === tab.key}
              />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>

      {/* Mobile bottom nav — the trip room is used standing in a station. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-surface/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((tab) => {
            const active = current === tab.key;
            return (
              <Link
                key={tab.key}
                href={route(tab.key ? `${base}/${tab.key}` : base)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px]',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={route(href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'shrink-0 rounded-brand px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-espresso/5',
      )}
    >
      {label}
    </Link>
  );
}

/** Re-exported so a tab can show who is in the trip without another query. */
export { Avatar };
