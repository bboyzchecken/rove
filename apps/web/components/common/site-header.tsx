'use client';

import Link from 'next/link';
import { Compass, LogIn } from 'lucide-react';

import { loginHref, useMe } from '@/features/auth/queries';
import { Avatar } from '@/components/ui/avatar';

import { Logo } from './logo';

/** The header outside the trip room. Inside a trip, TripHeader replaces it. */
export function SiteHeader() {
  const { data: me, isLoading } = useMe();

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Logo href={me ? '/home' : '/'} size="sm" />

        <nav className="flex items-center gap-2">
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-brand bg-espresso/6" />
          ) : me ? (
            <>
              <Link
                href="/home"
                className="hidden items-center gap-1.5 rounded-brand px-3 py-2 text-sm font-medium text-muted hover:bg-espresso/5 sm:inline-flex"
              >
                <Compass className="h-4 w-4" />
                ทริปของฉัน
              </Link>
              <Link href="/profile" aria-label="โปรไฟล์">
                <Avatar
                  name={me.display_name}
                  avatarUrl={me.avatar_url}
                  characterId={me.character_id}
                />
              </Link>
            </>
          ) : (
            <a
              href={loginHref('line')}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/20"
            >
              <LogIn className="h-4 w-4" />
              เข้าสู่ระบบ
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
