import { SquiggleArrow } from '@/components/brand/doodle';
import { TiltedTag, type TiltedTagTone } from '@/components/brand/tilted-tag';
import { HERO_TOP, SHELL_SECTION } from '@/components/common/public-shell';
import { cn } from '@/lib/utils';

/**
 * The hero band, built once (ROVE_BRAND_SPEC §6).
 *
 * Every marketing and public page wears this rather than composing its own.
 * That is not only DRY: the first pass placed doodles and tags by hand per
 * page, and the marks landed on the knockout word, across body copy, and on
 * top of each other at 390px. Those are §4.2.7, §5.3 and §10 violations, and
 * they are the kind you only find by looking. Centralising the geometry means
 * a page chooses *what* the tags say and the layout is already correct.
 *
 * §6's layer order is the z-index scale here, bottom to top:
 *
 *   0   canvas          full-bleed `--brand-canvas` or ink
 *   0   anchor doodle   large, partly behind the headline, bleeding off-frame
 *   10  headline        white 700, lines broken by hand
 *   10  knockout        inside the headline, one word (see `.knockout`)
 *   20  small doodles   two marks in the gaps
 *   30  tilted tags     four to five pills clipping letter edges
 *   10  CTA             white pill, with the curl arrow outside it
 *
 * The headline sitting between the anchor (0) and the small marks (20) is the
 * interleaving §6 asks for — it is what makes the marks read as drawn on
 * rather than pasted over.
 */

/**
 * Tag positions, as a fixed set of slots rather than free coordinates.
 *
 * Each slot is a percentage inside the *headline box*, and each is anchored
 * to the edge it is nearest — `right-[4%]` and not `left-[52%]` — because a
 * left percentage that clips a letter at 1440px lands mid-word at 390px,
 * where the same headline is a third as wide. §10's mobile rule is that a tag
 * never covers more than one letter, and edge anchoring is what holds that at
 * both ends.
 *
 * Two zones are deliberately unreachable. Nothing sits in the middle-left of
 * the last line, which is where the knockout falls and §4.2.7 keeps clean;
 * and nothing sits below 90%, which is body copy — §9 permits an overlay on
 * display type only.
 *
 * Rotations are baked in, all different and none 0 (§4.2.2), so a caller
 * cannot accidentally repeat an angle or line two tags up (§4.2.3).
 */
const SLOTS = [
  // Line one, right edge. Barely negative on the top: above this box is the
  // eyebrow, and an eyebrow is body copy (§9).
  { at: '-top-[3%] -right-[9%]', rotate: -9, wide: false },
  // Line one again, further out — the pair reads as a cluster, not a column.
  { at: 'top-[13%] -right-[19%]', rotate: 5, wide: true },
  // Line one's left edge. This one started on line two's right, which on a
  // page whose second line is short sat close enough to the knockout below to
  // graze it by 85 square pixels on a phone. Distance from that word is worth
  // more than a perfectly even scatter.
  { at: 'top-[4%] -left-[12%]', rotate: 7, wide: false },
  // Line two, left edge.
  { at: 'top-[34%] -left-[8%]', rotate: -12, wide: false },
  // Line three, LEFT only. The knockout is by convention the last thing on
  // the last line, so the right of line three is the one place a tag can
  // never go — §4.2.7 keeps that word clean, and a slot there grazed it on
  // every page the moment the headline got shorter. Encoding it here means no
  // page can reintroduce the collision by rewording its hero.
  { at: 'top-[78%] -left-[11%]', rotate: 11, wide: true },
] as const;

export interface HeroTag {
  label: string;
  /** §4.2.5 — two accent colours plus one ink tag anchoring the cluster. */
  tone: TiltedTagTone;
}

export function HeroCanvas({
  eyebrow,
  headline,
  lead,
  tags = [],
  actions,
  /** The large mark behind the headline — a doodle component, not markup. */
  anchor,
  /** Stroke colour for the anchor. §5.1 allows pink, green, yellow or white. */
  anchorTone = 'text-pink',
  /** Two small marks in the gaps, over the display type. */
  marks,
  /** Ink instead of cobalt — §2.2 allows exactly these two as a canvas. */
  tone = 'canvas',
  /** Points the curl arrow at the CTA from outside it (§7). */
  arrow = false,
  className,
}: {
  eyebrow?: React.ReactNode;
  headline: React.ReactNode;
  lead?: React.ReactNode;
  tags?: readonly HeroTag[];
  actions?: React.ReactNode;
  anchor?: React.ComponentType<{ className?: string }>;
  anchorTone?: string;
  marks?: React.ReactNode;
  tone?: 'canvas' | 'ink';
  arrow?: boolean;
  className?: string;
}) {
  // More than the slots can hold would have to double up somewhere, and §4.2.1
  // calls more than six cluttered. Silently dropping the overflow keeps the
  // layout correct rather than letting a seventh tag pile onto a sixth.
  const placed = tags.slice(0, SLOTS.length);
  const Anchor = anchor;

  return (
    <section
      className={cn(
        'relative overflow-hidden',
        tone === 'ink' ? 'bg-ink' : 'bg-canvas',
        className,
      )}
    >
      <div className={cn(SHELL_SECTION, HERO_TOP, 'relative pb-14 sm:pb-20')}>
        <div className="animate-rove-rise relative z-10 max-w-2xl pt-10 sm:pt-16">
          {eyebrow ? (
            <p className="font-display text-sm font-medium text-white/90">{eyebrow}</p>
          ) : null}

          {/* Layers 2 to 6 all measure themselves against this box, so every
              mark lands on the headline rather than near it. */}
          {/* `w-fit` is load-bearing, not tidiness. The slots are percentages
              of this box, and while it was a full-width column those
              percentages tracked the *column* rather than the type: on a page
              whose hand-broken lines are shorter than the measure, every
              right-anchored tag floated in the gutter instead of clipping a
              letter, which is exactly the timid margin §4.2.4 rules out.
              Shrunk to the widest line, the same percentages land on text. */}
          <div className="relative mt-8 w-fit max-w-full">
            {/* Layer 2 — the anchor. Sized from the headline rather than
                placed by the page: §5.1.7 wants it far larger than the other
                marks and bleeding off-frame, but a page-chosen height ran it
                straight through the lead paragraph, which §9 forbids. Tied to
                the headline it can only overhang by 8% of it — 23px at desktop
                and 12px on a phone, both inside the lead's own 28px top
                margin, so the collision cannot come back.

                The horizontal offset is large enough to actually leave the
                frame. At a smaller one it stopped short of the viewport edge
                and read as an isolated graphic parked beside the text rather
                than as a mark drawn across the poster; the section's
                `overflow-hidden` does the cropping. */}
            {Anchor ? (
              <Anchor
                className={cn(
                  'pointer-events-none absolute -top-[8%] -right-[45%] z-0 aspect-square h-[116%] sm:-right-[85%]',
                  anchorTone,
                )}
              />
            ) : null}

            <h1 className="t-hero relative z-10 text-white">{headline}</h1>

            {marks}

            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
              {placed.map((tag, i) => {
                const slot = SLOTS[i]!;
                return (
                  <TiltedTag
                    key={tag.label}
                    tone={tag.tone}
                    rotate={slot.rotate}
                    className={cn('absolute', slot.at, slot.wide && 'hidden lg:inline-block')}
                  >
                    {tag.label}
                  </TiltedTag>
                );
              })}
            </div>
          </div>

          {lead ? <p className="t-body mt-7 max-w-md text-white">{lead}</p> : null}

          {actions ? (
            <div className="relative mt-9 inline-flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              {actions}
              {arrow ? (
                <SquiggleArrow className="pointer-events-none absolute -top-2 -right-24 hidden h-20 w-14 rotate-[80deg] text-white/70 lg:block" />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The hero's own CTA (§7): white fill, ink text, 16px/32px, near-full-width on
 * a phone. Exported as class strings rather than components so pages can put
 * them on `next/link` — a hero button is always navigation, and wrapping an
 * `<a>` would cost client-side routing on every marketing page.
 */
export const heroButtonClass =
  'font-display text-ink inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 font-medium transition hover:bg-white/90 active:scale-[0.98] sm:w-auto';

/** The quiet one beside it — a white outline, never a second filled pill. */
export const heroButtonGhostClass =
  'font-display inline-flex h-14 items-center justify-center rounded-full border-[1.5px] border-white/45 px-8 font-medium text-white transition hover:bg-white/10';

/**
 * The nav over a canvas (§7 Nav): quiet white links, then one white pill.
 *
 * Exported alongside the hero because the two always travel together — a page
 * that sets `chrome="canvas"` on `PublicShell` and then leaves the default
 * dark `ButtonLink` in its actions gets an ink pill on cobalt, which is the
 * one combination §2.2's table has nothing good to say about.
 */
export const heroNavLinkClass =
  'font-display px-3 text-sm font-medium text-white/80 transition hover:text-white';

export const heroNavCtaClass =
  'font-display text-ink inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium transition hover:bg-white/90';
