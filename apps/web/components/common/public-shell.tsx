import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { LocaleSwitchCompact } from '@/components/common/locale-switch';
import { RoveLogo } from '@/components/brand/rove-logo';
import { ButtonLink } from '@/components/ui/button';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * The frame every page outside `app/(app)` wears.
 *
 * These pages grew one at a time and each invented its own container: six
 * different max-widths (`5xl`, `4xl`, `3xl`, `2xl`, `lg`, `md`), three gutters
 * (`px-4`, `px-5`, `px-6`), the logo linked home on some and inert on others,
 * and "กลับหน้าแรก" on the left of the sign-in screens but on the right of the
 * legal ones. Moving between them, the ROVE mark jumped around the viewport —
 * which reads as "different site", not "different page".
 *
 * So the chrome is fixed and the content is not. The header and footer are
 * always `max-w-5xl` at the same gutter, on every page including the landing,
 * so the logo never moves. Only the column underneath changes width, because a
 * legal document and a card grid genuinely want different measures.
 *
 * One rule for the two slots, no exceptions:
 *   left  = who this is  → the logo, always a link home
 *   right = what to do   → language, then the page's own action
 *
 * `AppShell` is the signed-in twin of this file and shares the same gutter.
 */

/**
 * The gutter and the header height, in one place.
 *
 * Both match `AppShell` exactly, so crossing from the public half of the site
 * into the signed-in half does not move the logo: `/` → `/login` → `/home` all
 * put the ROVE mark on the same pixel.
 */
export const GUTTER = 'px-4';
const HEADER_HEIGHT = 'h-14';

const WIDTH = {
  /** Card grids and the landing's own sections. */
  wide: 'max-w-5xl',
  /** Prose and single-column reading — legal, a shared plan, an invite. */
  page: 'max-w-2xl',
  /** One decision on the screen — sign-in, a dead end. */
  focused: 'max-w-md',
} as const;

export type ShellWidth = keyof typeof WIDTH;

export function PublicShell({
  width = 'page',
  /** Vertically centre the content in whatever height is left over. */
  center = false,
  /**
   * Let the page own its containers — for the landing, whose full-bleed bands
   * cannot live inside a constrained `main`. Use `SHELL_SECTION` for its
   * sections so they still line up with the header.
   */
  bleed = false,
  actions,
  children,
}: {
  width?: ShellWidth;
  center?: boolean;
  bleed?: boolean;
  /** The page's own call to action, right of the language switch. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader actions={actions} />

      <main
        className={cn(
          'flex-1',
          !bleed && ['mx-auto w-full', GUTTER, WIDTH[width]],
          center && 'flex flex-col justify-center',
        )}
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/** The landing page's sections, lined up with the header above them. */
export const SHELL_SECTION = `mx-auto ${WIDTH.wide} ${GUTTER}`;

/**
 * Top spacing for a hero's first section.
 *
 * v2 exported this as `pt-14` because the header floated *over* a full-bleed
 * cobalt hero and the content had to clear it. v3 has no coloured hero to
 * float over — the header and the hero are the same white page — so the header
 * takes an ordinary row again and the hero only needs a little air under it.
 * The constant stays so the marketing pages keep one place to change it.
 */
export const HERO_TOP = 'pt-2';

function SiteHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <header
      className={cn(
        'mx-auto flex w-full items-center justify-between',
        HEADER_HEIGHT,
        WIDTH.wide,
        GUTTER,
      )}
    >
      <Link href="/" aria-label={`${env.brandName} — หน้าแรกของเว็บ`}>
        {/* §6 Nav: black wordmark on white. The period picks up whatever
            `data-feature` is in scope, which on marketing is none — so it
            resolves to ink and reads as part of the word. */}
        <RoveLogo size="sm" />
      </Link>

      <div className="flex items-center gap-2">
        <LocaleSwitchCompact />
        {actions}
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-border mt-16 border-t">
      <div
        className={cn(
          'text-muted flex flex-wrap items-center justify-between gap-3 py-8 text-xs',
          'mx-auto w-full',
          WIDTH.wide,
          GUTTER,
        )}
      >
        <RoveLogo size="sm" tone="mono" />
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/pricing" className="hover:text-ink">
            ราคา
          </Link>
          <Link href="/terms" className="hover:text-ink">
            เงื่อนไขการใช้งาน
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            นโยบายความเป็นส่วนตัว
          </Link>
        </nav>
        <p>
          © {new Date().getFullYear()} {env.brandName} · วางแพลนเที่ยวกันทั้งกลุ่ม
        </p>
      </div>
    </footer>
  );
}

/**
 * "กลับหน้าแรก", for the dead ends — sign-in, a legal document, a 404.
 *
 * Pass it as `actions` rather than placing it in the page: it used to be
 * free-floating markup each screen positioned for itself, which is how it
 * ended up top-left on the sign-in screens and top-right on the legal ones.
 * Here it lands in the same slot as every other page action, and the logo on
 * the left is the other way home.
 */
export function BackHome() {
  return (
    <ButtonLink href="/" variant="ghost" size="sm">
      <ArrowLeft className="size-4" strokeWidth={2.5} />
      กลับหน้าแรก
    </ButtonLink>
  );
}
