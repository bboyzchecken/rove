'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Trip room tabs (DEV_SPEC §3.2). "วันเดินทาง" comes first because a trip with
 * no agreed dates cannot meaningfully have a plan or a budget yet — it is the
 * step the group is actually on.
 */
const TABS = [
  { segment: '', label: 'ภาพรวม' },
  { segment: 'dates', label: 'วันเดินทาง' },
  { segment: 'wishlist', label: 'ที่อยากไป' },
  { segment: 'plan', label: 'แพลน' },
  { segment: 'budget', label: 'งบ' },
  { segment: 'expense', label: 'ค่าใช้จ่าย' },
  { segment: 'prep', label: 'เตรียมตัว' },
  { segment: 'bookings', label: 'การจอง' },
  { segment: 'discussion', label: 'คุยกัน' },
] as const;

/** Phase 2 lives here so the room's full shape is visible without pretending. */
const SOON = ['รูปภาพ', 'เอกสาร'];

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/t/${tripId}`;

  return (
    <nav className="bg-bg/90 sticky top-14 z-20 backdrop-blur-md">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2.5">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;

          return (
            <Link
              key={tab.label}
              href={href as never}
              className={cn(
                'font-display rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition',
                active ? 'bg-espresso text-bg' : 'text-muted hover:bg-surface',
              )}
            >
              {tab.label}
            </Link>
          );
        })}

        <span className="bg-surface mx-1 h-4 w-px shrink-0" />

        {SOON.map((label) => (
          <span
            key={label}
            className="text-muted/45 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm whitespace-nowrap"
            title="อยู่ในแผนเฟสถัดไป"
          >
            <Clock className="size-3" />
            {label}
          </span>
        ))}
      </div>
    </nav>
  );
}
