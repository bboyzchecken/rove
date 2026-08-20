'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Luggage, Plus, Sparkles, UserRound } from 'lucide-react';

import { ModeBanner } from '@/components/common/mode-banner';
import { RoveLogo } from '@/components/brand/rove-logo';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import { cn } from '@/lib/utils';

/**
 * App chrome. Mobile-first (§2.1): a thumb-reachable bottom bar on phones, the
 * same destinations as a top bar from `md` up. The trip room draws its own tab
 * strip underneath this.
 *
 * Five destinations, with "สร้างทริป" in the middle where the thumb rests.
 * None of them points at a single trip: with two trips in flight, a "ทริปนี้"
 * tab cannot say which one it means, so the tab is the *list* and the room is
 * one tap deeper.
 *
 * The logo goes to the public landing page — /home is this user's dashboard,
 * not the site's front door, and conflating the two is what made the map
 * confusing.
 */
const NAV = [
  { href: '/home', label: 'สรุปของฉัน', icon: LayoutDashboard },
  { href: '/trips', label: 'ทริปของฉัน', icon: Luggage },
  { href: '/new', label: 'สร้างทริป', icon: Plus, accent: true },
  { href: '/dreams', label: 'ที่อยากไป', icon: Sparkles },
  { href: '/profile', label: 'ฉัน', icon: UserRound },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();

  // A trip room lives under /t/:id, which belongs to the "ทริปของฉัน" tab.
  const isActive = (href: string) => {
    if (href === '/trips') return pathname.startsWith('/trips') || pathname.startsWith('/t/');
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
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
                  'font-display rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                  isActive(item.href) ? 'bg-espresso text-bg' : 'text-muted hover:bg-surface',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link href="/profile" aria-label="โปรไฟล์">
            <CharacterAvatar characterId={me?.characterId ?? 'shiba'} size="sm" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl">{children}</main>

      {/* Bottom bar: phones only. */}
      <nav className="border-border bg-bg/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            if ('accent' in item && item.accent) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1 px-2"
                  aria-label={item.label}
                >
                  <span className="bg-primary text-primary-fg shadow-warm flex size-9 items-center justify-center rounded-full">
                    <Icon className="size-5" strokeWidth={2.5} />
                  </span>
                  <span className="text-muted text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-2 pt-1',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
