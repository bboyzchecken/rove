'use client';

import { AppShell } from '@/components/common/app-shell';
import { PublicShell, type ShellWidth } from '@/components/common/public-shell';
import { cn } from '@/lib/utils';

/**
 * The chrome for the pages both halves of the product share: สำรวจ, a
 * published plan, a creator profile.
 *
 * These pages have two audiences and used to have one frame. `/explore` is a
 * tab in `AppShell.NAV` (P4.0), so a signed-in user tapped "สำรวจ" in the
 * bottom bar and landed on a page with no bottom bar — no way back to their
 * own trips, no inbox, and a logo that goes to the *landing page* rather than
 * to `/home`. Then the cards on it lead to `/p/[slug]` and `/u/[handle]`,
 * which had the same frame, so the hole got deeper with every tap.
 *
 * So the frame follows the reader, not the URL:
 *
 *   signed in  → `AppShell` — same header, same five tabs, same everything as
 *                every other screen behind the sign-in wall. สำรวจ is simply
 *                one of the places the app goes.
 *   anonymous  → `PublicShell` — site header, marketing footer, and the CTA
 *                that turns a visitor into an account.
 *
 * `signedIn` comes from the server (`lib/session`), never from `useMe()`: the
 * hook answers one render late and the chrome would visibly swap.
 *
 * **`actions` are for anonymous visitors only** — by design, not by omission.
 * Every action these pages offered ("เริ่มทริปของฉัน", "สำรวจแพลนอื่น") is
 * already a tab in `AppShell`, so rendering them for a signed-in user puts the
 * same destination on screen twice and pushes the page content down to make
 * room for it.
 */

/** Widths mirror `PublicShell`'s, so a page reads the same in either frame. */
const WIDTH: Record<ShellWidth, string> = {
  wide: 'max-w-5xl',
  page: 'max-w-2xl',
  focused: 'max-w-md',
};

export function BrowseShell({
  signedIn,
  width = 'page',
  center = false,
  actions,
  hero,
  children,
}: {
  signedIn: boolean;
  width?: ShellWidth;
  center?: boolean;
  /** Rendered only for anonymous visitors — see the note above. */
  actions?: React.ReactNode;
  /**
   * A full-bleed `HeroCanvas`, for anonymous visitors only.
   *
   * Same reasoning as `actions`, and now also ROVE_BRAND_SPEC §1: to someone
   * without an account this page is marketing and gets the loud treatment, and
   * to someone signed in it is a tab in their own app and must stay as calm as
   * every other screen behind the wall. The mode follows the reader, exactly
   * as the chrome already does.
   */
  hero?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!signedIn) {
    return (
      // `bleed` when there is a hero: a full-bleed canvas cannot live inside a
      // constrained `main`, so the shell hands the page its own gutter back.
      <PublicShell
        width={width}
        center={center}
        actions={actions}
        bleed={Boolean(hero)}
        chrome={hero ? 'canvas' : 'default'}
      >
        {hero}
        {hero ? (
          <div className={cn('mx-auto w-full px-4', WIDTH[width])}>{children}</div>
        ) : (
          children
        )}
      </PublicShell>
    );
  }

  // `AppShell`'s own `<main>` is `max-w-5xl` with no gutter, because the app
  // screens each bring their own `px-4`. These pages were written for
  // `PublicShell`, which supplies the gutter itself, so the wrapper does it
  // here rather than making every branch of every screen know which frame it
  // is currently inside.
  return (
    <AppShell>
      <div
        className={cn(
          'mx-auto w-full px-4',
          WIDTH[width],
          // A dead end ("ไม่พบแพลนนี้") centres itself in the space left over,
          // minus the header and the bottom bar it now sits between.
          center && 'flex min-h-[calc(100dvh-8.5rem)] flex-col justify-center',
        )}
      >
        {children}
      </div>
    </AppShell>
  );
}
