'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FlaskConical,
  Gauge,
  MapPin,
  MessageSquareQuote,
  Receipt,
  Users,
} from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { StatusPill } from '@/components/admin/ui/status-pill';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import { useProviderMode } from '@/features/meta/queries';
import { cn } from '@/lib/utils';

/**
 * The admin console's chrome (Phase 5 — W25.2).
 *
 * Two deliberate departures from the rest of the product, both written down in
 * docs/phase-5-admin.md §4 so nobody has to guess later:
 *
 *  1. **Desktop-first**, against DEV_SPEC §7's mobile-first rule for everything
 *     else. Admin work is tables and forms at a desk, not a screen you hold on
 *     a train. The sidebar collapses to a row of icons on a phone so the
 *     numbers and the lead queue stay reachable, and that is the whole of the
 *     mobile story on purpose.
 *
 *  2. **Thai only.** docs/i18n-plan.md puts the admin screens outside the i18n
 *     scope, so nothing here goes through next-intl. That is a decision, not an
 *     oversight — do not "fix" it by extracting keys.
 *
 * The dark surface comes entirely from `data-surface="admin"` on the layout
 * above: every component below is the same `Card`, `Button` and `Input` the
 * traveller-facing app uses, reading the same tokens.
 */
const NAV = [
  { href: '/admin', label: 'ภาพรวม', icon: Gauge, exact: true },
  { href: '/admin/poi', label: 'สถานที่', icon: MapPin },
  { href: '/admin/users', label: 'ผู้ใช้', icon: Users },
  { href: '/admin/leads', label: 'คิวเอเจนต์', icon: MessageSquareQuote },
  { href: '/admin/payouts', label: 'จ่ายครีเอเตอร์', icon: Receipt },
] as const;

/**
 * Which destinations exist yet.
 *
 * The endpoints behind POI, leads and payouts are already written and have no
 * screen (docs/phase-5-admin.md §1, "ชั้น 2"), and users needs a store method
 * that does not exist. Listing them greyed out is the honest version of a menu:
 * it says what this console is going to be, and refuses to pretend the screens
 * are one click away. M27 turns them on.
 */
const READY = new Set<string>(['/admin']);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: mode } = useProviderMode();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  /*
    The guard lives here rather than on each page, so a screen added in M26 or
    M27 is protected by existing rather than by remembering.

    It is a courtesy, not a control: `proxy.ts` keeps anonymous visitors out
    and every /admin endpoint is behind `IsAdmin` on the API. What this stops
    is a signed-in traveller who typed the URL seeing a console frame full of
    failed requests — and it waits for `me` to load rather than flashing the
    refusal at an admin who is simply still loading.
  */
  if (me && !me.isAdmin) {
    return (
      <div className="bg-bg text-espresso flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl font-extrabold">หน้านี้สำหรับแอดมิน</h1>
          <p className="text-muted mt-2 text-sm">
            บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้าหลังบ้าน — ถ้าคิดว่าผิดพลาด ติดต่อทีมงาน
          </p>
          <Link href="/home" className="text-primary mt-4 inline-block text-sm font-semibold">
            กลับไปหน้าผู้ใช้
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg text-espresso min-h-dvh md:flex">
      {/* --------------------------------------------------------- sidebar */}
      <aside className="bg-surface md:border-border shrink-0 md:w-56 md:border-r">
        <div className="flex h-14 items-center gap-2 px-4">
          <RoveMark className="text-primary size-4" />
          <span className="font-display text-espresso text-sm font-extrabold tracking-tight">
            ROVE แอดมิน
          </span>
        </div>

        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-4">
          {NAV.map((item) => {
            const ready = READY.has(item.href);
            const active = isActive(item.href, 'exact' in item ? item.exact : false);

            const className = cn(
              'rounded-brand-sm flex items-center gap-2.5 px-3 py-2 text-sm font-semibold whitespace-nowrap transition',
              active ? 'bg-primary text-primary-fg' : 'text-muted',
              ready && !active && 'hover:bg-bg hover:text-espresso',
              !ready && 'cursor-not-allowed opacity-40',
            );

            if (!ready) {
              return (
                <span key={item.href} className={className} title="ยังไม่เปิดใช้งาน (M27)">
                  <item.icon className="size-4 shrink-0" strokeWidth={2.2} />
                  {item.label}
                </span>
              );
            }

            return (
              <Link key={item.href} href={item.href as never} className={className}>
                <item.icon className="size-4 shrink-0" strokeWidth={2.2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* --------------------------------------------------- topbar + body */}
      <div className="min-w-0 flex-1">
        <header className="border-border flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6">
          {/*
            The env badge is not decoration: half the reason an admin opens
            this console is to work out whether what they are looking at is
            real, and answering that at the top of every screen is cheaper than
            answering it in support.
          */}
          <div className="flex items-center gap-2">
            {mode ? (
              <StatusPill tone={mode.live ? 'ok' : 'wait'}>{mode.env}</StatusPill>
            ) : null}
            {mode?.stubbed?.length ? (
              <StatusPill tone="info" className="hidden sm:inline-flex">
                <FlaskConical className="size-3" />
                จำลอง {mode.stubbed.length} บริการ
              </StatusPill>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/home" className="text-muted hover:text-espresso text-xs transition">
              กลับไปหน้าผู้ใช้
            </Link>
            <CharacterAvatar characterId={me?.characterId ?? 'shiba'} size="sm" />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
