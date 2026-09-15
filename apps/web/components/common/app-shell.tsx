'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Compass, Heart, Luggage, Plus, UserRound } from 'lucide-react';

import { LocaleSwitchCompact } from '@/components/common/locale-switch';
import { ModeBanner } from '@/components/common/mode-banner';
import { RoveLogo } from '@/components/brand/rove-logo';
import { InboxBell } from '@/components/collab/inbox-bell';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import { pathFeature } from '@/lib/feature';
import { cn } from '@/lib/utils';

import { DEFAULT_CHARACTER_ID } from '@/lib/catalog/characters';
/**
 * App chrome. Mobile-first (§2.1): a thumb-reachable bottom bar on phones, the
 * same destinations as a top bar from `md` up. The trip room draws its own tab
 * strip underneath this.
 *
 * Four destinations (five on phones), with "สร้างทริป" in the middle where the thumb rests.
 * None of them points at a single trip: with two trips in flight, a "ทริปนี้"
 * tab cannot say which one it means, so the tab is the *list* and the room is
 * one tap deeper.
 *
 * The logo goes to the public landing page — /home is this user's dashboard,
 * not the site's front door, and conflating the two is what made the map
 * confusing.
 *
 * "ที่อยากไป" is not in the desktop nav even though it is a real destination:
 * /dreams is one tap from /home, /profile and the profile menu. The phone bar
 * carries it as "ดรีมทริป" (Feedback #3 — D-5) to balance two tabs each side.
 *
 * The header here and `PublicShell`'s are deliberately the same frame —
 * `max-w-5xl`, the same gutter, the same height, logo left and actions right —
 * so signing in does not move the chrome. Change one and change the other.
 */
/**
 * Feedback #2 — D-6: "สรุปของฉัน" and "ทริปของฉัน" were two tabs showing the
 * same rooms in two shapes. One tab now, and it is the home screen; `/trips`
 * redirects there so old links keep working.
 */
const NAV = [
  { href: '/home', key: 'myTrips', icon: Luggage },
  { href: '/explore', key: 'explore', icon: Compass },
  { href: '/new', key: 'newTrip', icon: Plus, accent: true },
  { href: '/profile', key: 'me', icon: UserRound },
] as const;

/**
 * Feedback #3 — D-5/D-7: the phone bar is five even columns with สร้างทริป in
 * the middle, so "ดรีมทริป" joins it there. The desktop pill nav keeps `NAV`.
 */
const BOTTOM_NAV = [
  NAV[0],
  NAV[1],
  NAV[2],
  { href: '/dreams', key: 'dreams', icon: Heart },
  NAV[3],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const t = useTranslations('nav');

  // A trip room lives under /t/:id and a finished one under /recap/:id — both
  // belong to the "ทริปของฉัน" tab.
  //
  // Browsing works the same way: a published plan (/p/:slug) and a creator
  // profile (/u/:handle) are where สำรวจ leads, so the tab stays lit while the
  // reader is down there. Without this, tapping a card put out the only light
  // saying where they were.
  const isActive = (href: string) => {
    if (href === '/home') {
      return (
        pathname.startsWith('/home') ||
        pathname.startsWith('/trips') ||
        pathname.startsWith('/t/') ||
        pathname.startsWith('/recap/')
      );
    }
    if (href === '/explore') {
      return (
        pathname.startsWith('/explore') || pathname.startsWith('/p/') || pathname.startsWith('/u/')
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Trip Mode is the screen you hold while walking to a station (W10.6). It
  // gets the whole viewport: no header, no bottom bar, no reason to leave.
  if (pathname.endsWith('/now')) {
    return <div className="min-h-dvh">{children}</div>;
  }

  return (
    // §2.5's feature colour for the top-level app routes that have one —
    // /dreams, /billing, /points, /recap. Most do not and resolve to `none`,
    // which is the neutral gray: §1 wants a white page with pastel rooms in
    // it, not a product where every screen is painted.
    //
    // The trip room re-declares this on its own wrapper, and the nested
    // declaration wins for its subtree. So /t/:id/wishlist is pink even though
    // this shell put `none` on the element above it.
    <div data-feature={pathFeature(pathname)} className="min-h-dvh pb-20 md:pb-0">
      <ModeBanner />

      <header className="bg-bg/85 sticky top-0 z-30 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" aria-label="ROVE — หน้าแรกของเว็บ">
            <RoveLogo size="sm" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'font-display rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                  isActive(item.href) ? 'bg-ink text-bg' : 'text-muted hover:bg-surface',
                )}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <LocaleSwitchCompact className="mr-1" />
            <InboxBell />
            <Link href="/profile" aria-label="โปรไฟล์">
              <CharacterAvatar characterId={me?.characterId ?? DEFAULT_CHARACTER_ID} size="sm" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl">{children}</main>

      {/* Bottom bar: phones only. */}
      <nav className="border-border bg-bg/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-stretch px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            if ('accent' in item && item.accent) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-w-0 flex-col items-center justify-end gap-1"
                  aria-label={t(item.key)}
                >
                  <span className="bg-primary text-primary-fg flex size-9 items-center justify-center rounded-full">
                    <Icon className="size-5" strokeWidth={2.5} />
                  </span>
                  <span className="text-muted text-[10px] font-medium whitespace-nowrap">
                    {t(item.key)}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-end gap-1 pt-1',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium whitespace-nowrap">{t(item.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
