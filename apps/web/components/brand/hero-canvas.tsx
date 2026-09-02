import { SquiggleArrow } from '@/components/brand/doodle';
import { TAG_TONE, TiltedTag, type TiltedTagTone } from '@/components/brand/tilted-tag';
import { HERO_TOP, SHELL_SECTION } from '@/components/common/public-shell';
import { cn } from '@/lib/utils';

/**
 * The hero band, built once (ROVE_BRAND_SPEC v3 §3, §5.3).
 *
 * Every marketing and public page wears this rather than composing its own.
 * That is not only DRY: the first pass placed doodles and tags by hand per
 * page, and the marks landed on the knockout word, across body copy, and on
 * top of each other at 390px. Those are §5.3 and §8 violations, and they are
 * the kind you only find by looking. Centralising the geometry means a page
 * chooses *what* the tags say and the layout is already correct.
 *
 * THE NAME IS NOW A FOSSIL. v3 deletes the canvas this was built around: there
 * is no full-bleed cobalt band and no white display type, because §2.1 makes
 * white the page background on EVERY screen and §2.4 allows white text only on
 * black. The hero is the same white page as the rest of the site, and what
 * carries it instead is the drawing on top — the doodle overlay is the one
 * place §5.1 lets the solid accents be strokes, and the one knockout word is
 * the only inversion.
 *
 * That inverts the layer order too. Every layer that was white because the
 * ground was dark is now black on white:
 *
 *   0   page            white, no fill of its own
 *   0   anchor doodle   large, partly behind the headline, bleeding off-frame
 *   10  headline        black 700, lines broken by hand
 *   10  knockout        one word, black block with white text (`.knockout`)
 *   20  small doodles   two marks in the gaps
 *   30  tilted tags     up to six pastel pills clipping letter edges (lg+)
 *   10  CTA             black pill, with the curl arrow outside it
 *
 * The headline sitting between the anchor (0) and the small marks (20) is the
 * interleaving the hero wants — it is what makes the marks read as drawn on
 * rather than pasted over, and on a white page it is doing more work than it
 * used to, since the marks no longer have a colour field to separate them.
 */

/**
 * Tag positions, as a fixed set of slots rather than free coordinates.
 *
 * HOW FAR A TAG INTRUDES IS MEASURED AGAINST THE TAG, NOT THE HEADLINE.
 * Each slot pins to an edge of the headline box and then slides back out by
 * `shiftX` percent of its *own* width, so a pill always leaves the same
 * fraction of itself over the type. Expressed as a percentage of the headline
 * instead — which is what this did first — the same number is a graze on a
 * wide English line and a pill parked across the middle of a short Thai one.
 * That is how "คุยกันในแพลน" ended up sitting on top of "วาง": §4.2.4 asks for
 * the edge of a letter, and the box-relative maths could not promise it.
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
 *
 * THE WHOLE CLUSTER IS `lg` AND UP, because A TAG NEEDS SOMEWHERE TO HANG AND
 * A PHONE HAS NOWHERE. Each slot pins to an edge of the headline and slides
 * most of itself back out of it; that only reads as a tag clipping a letter if
 * there is page gutter on the far side to spill into. At 1440px the headline
 * box starts 219px in and there is room. At 390px the box starts at the 16px
 * gutter, so the same rule threw the two left-hand pills of the pricing hero
 * out to x=-61 and x=-63 — half a word of each, sliced off by the viewport.
 * §10 says a tag never covers more than one letter on a phone; a tag the phone
 * has cut in half is worse than a tag the phone never drew.
 *
 * This used to be a per-slot `wide` flag that kept exactly one right-anchored
 * tag on a phone and dropped the rest. That was the right call when a hero
 * carried two tags and they were decoration. It stopped being right when
 * Feedback #1 turned the cluster into the page's introduction to all six
 * feature colours: one visible pill out of six, on the platform most readers
 * are on, teaches a sixth of the palette and looks like a stray. So below `lg`
 * the tags move out of the overlay entirely and become a flat wrapped row
 * under the lead — same words, same tones, no tilt, nothing clipped. See
 * the render below.
 */
const SLOTS = [
  /* Slot 0 pins to the top right — where the *longest* line ends, so whatever
   * it covers is a whole letter rather than the white space after a short one.
   *
   * 86 and not 74: at 74 it left 18px of pill on the type, two thirds of a ว
   * at 44px, with nothing left to read it by. 14% is the graze §4.2.4 asks
   * for.
   *
   * -24px and not -3%: the top of a Thai line is not the empty band above a
   * Latin x-height, it is where the vowels and tone marks live, and a mark is
   * not decoration — ที and ที่ are different words. At -3% the pill's lower
   * half lay across that band and ate the ่ off the end of the pricing hero's
   * first line. A fixed lift rather than another percentage, because the box
   * is 158px tall on a phone and 346px at desktop, and a percentage that
   * grazes one clears the other entirely. -24px leaves ~4px of pill over the
   * marks at every size: it still clips the line, it no longer reads it. */
  { at: '-top-6 right-0', shiftX: 86, rotate: -9 },
  { at: 'top-[13%] right-0', shiftX: 92, rotate: 5 },
  { at: 'top-[4%] left-0', shiftX: -82, rotate: 7 },
  { at: 'top-[34%] left-0', shiftX: -88, rotate: -12 },
  { at: 'top-[78%] left-0', shiftX: -80, rotate: 11 },
  /* The sixth, added when Feedback #1 asked for one tag per feature colour.
   * Right-hand side, because the first five run 2 right / 3 left and a sixth
   * on the left would stack four pills down one edge. Between slot 1 (13%) and
   * the 90% floor the comment above keeps clear of body copy, far enough from
   * both to avoid the shared baseline §4.2.3 rules out. -6° is the only angle
   * in range not already spoken for. */
  { at: 'top-[58%] right-0', shiftX: 88, rotate: -6 },
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
  /**
   * Stroke colour for the anchor mark.
   *
   * A LIGHT accent, not a solid one, and that is §2.3 rather than timidity.
   * The marketing hero is the one place §5.1.2 lets a doodle leave black
   * behind — but the anchor is the largest thing on the page, and §2.3's split
   * is "large areas take the light colour, small elements take the solid". A
   * 400px flower in `#FF70D1` was measurably the loudest object in the hero:
   * louder than the headline it sits behind and louder than the black CTA,
   * which is precisely the "colour competes with the CTA" §1 rules out.
   *
   * In the light half of the pair it does the job the anchor is actually for —
   * filling the right of the composition and giving the headline something to
   * be drawn over — while the small marks keep the solids and stay the things
   * the eye lands on. Big and calm, small and loud.
   */
  anchorTone = 'text-pink-light',
  /** Two small marks in the gaps, over the display type. */
  marks,
  /** Points the curl arrow at the CTA from outside it. */
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
  arrow?: boolean;
  className?: string;
}) {
  // More than the slots can hold would have to double up somewhere, and §4.2.1
  // calls more than six cluttered. Silently dropping the overflow keeps the
  // layout correct rather than letting a seventh tag pile onto a sixth.
  const placed = tags.slice(0, SLOTS.length);
  const Anchor = anchor;

  return (
    // `bg-bg` and not a colour: §2.1's white page, on the hero like everywhere
    // else. `overflow-hidden` still matters — it is what crops the anchor
    // doodle where it bleeds off-frame.
    <section className={cn('bg-bg relative overflow-hidden', className)}>
      <div className={cn(SHELL_SECTION, HERO_TOP, 'relative pb-14 sm:pb-20')}>
        <div className="animate-rove-rise relative z-10 max-w-2xl pt-10 sm:pt-16">
          {eyebrow ? (
            <p className="text-muted font-display text-sm font-medium">{eyebrow}</p>
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

                HOW FAR THE ANCHOR INTRUDES IS MEASURED AGAINST THE ANCHOR,
                the same rule `SLOTS` states for the tags, and for the same
                reason. This was `-right-[45%] sm:-right-[85%]`: percentages
                of the headline's *width*, on an element sized from the
                headline's *height*. The two only track each other on a box
                whose lines happen to be long. They are not on a phone, and
                they are not on `/pricing`, whose three short lines make a box
                185px wide and 158px tall — there -64% put the flower's left
                edge at x=134 against a headline ending at x=201, i.e. a
                doodle laid across the last third of all three lines.

                Pinned with `left-full` and pulled back by 8% of its own
                width, the overhang is 32px at desktop and 15px on a phone
                whatever the headline says: the last letter is grazed, never
                covered, which is the "partly behind the headline" §6 asks
                for. The section's `overflow-hidden` crops the rest. */}
            {Anchor ? (
              <Anchor
                className={cn(
                  'pointer-events-none absolute -top-[8%] left-full z-0 aspect-square h-[116%] -translate-x-[8%]',
                  anchorTone,
                )}
              />
            ) : null}

            <h1 className="t-hero text-ink relative z-10">{headline}</h1>

            {marks}

            {/* The overlay cluster — `lg` and up only. See SLOTS. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-30 hidden lg:block"
            >
              {placed.map((tag, i) => {
                const slot = SLOTS[i]!;
                return (
                  <TiltedTag
                    key={tag.label}
                    tone={tag.tone}
                    rotate={slot.rotate}
                    shiftX={slot.shiftX}
                    className={cn('absolute', slot.at)}
                  >
                    {tag.label}
                  </TiltedTag>
                );
              })}
            </div>
          </div>

          {lead ? <p className="t-body text-ink mt-7 max-w-md">{lead}</p> : null}

          {/*
            The same tags below `lg`, as a row rather than an overlay.

            Flat and untilted on purpose. §7 makes tilt a hero-only device and
            this is still the hero, so the rule permits it — but tilt exists to
            make a pill read as dropped onto the type, and a pill sitting in
            its own row has no type to be dropped onto. Angled here it would
            just look crooked. Squared up, it reads as what it now is: the
            list of what the product does, in the colours those features wear
            for the rest of the site.

            Not `aria-hidden`, unlike the overlay. The overlay is decoration
            duplicating nothing — but below `lg` this row is the only place
            these words exist, so hiding it would delete six of the page's
            claims from every screen reader on a phone.
          */}
          {placed.length ? (
            <ul className="mt-6 flex flex-wrap gap-2 lg:hidden">
              {placed.map((tag) => (
                <li
                  key={tag.label}
                  className={cn(
                    'font-display rounded-full px-3.5 py-1.5 text-[12px] font-medium whitespace-nowrap',
                    TAG_TONE[tag.tone],
                  )}
                >
                  {tag.label}
                </li>
              ))}
            </ul>
          ) : null}

          {actions ? (
            <div className="relative mt-9 inline-flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              {actions}
              {arrow ? (
                <SquiggleArrow className="pointer-events-none absolute -top-2 -right-24 hidden h-20 w-14 rotate-[80deg] text-ink lg:block" />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The hero's own CTA: §6's black pill, one size up so the hero's single action
 * outweighs the page's ordinary buttons, near-full-width on a phone.
 *
 * v2 made this white-on-cobalt, which was the correct answer on a dark canvas
 * and is the wrong one now — a white pill on a white page has no edge at all.
 * It is a black pill, the same as every other primary action in the product;
 * the hero earns its emphasis from size and from the doodles around it rather
 * than from a colour nothing else is allowed to use.
 *
 * Exported as class strings rather than components so pages can put them on
 * `next/link` — a hero button is always navigation, and wrapping an `<a>`
 * would cost client-side routing on every marketing page.
 */
export const heroButtonClass =
  'font-display bg-ink text-white inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-8 font-medium transition hover:bg-ink/85 active:scale-[0.98] sm:w-auto';

/** The quiet one beside it — §6's tertiary, a 1.5px ink line, never a second
 *  filled pill. */
export const heroButtonGhostClass =
  'font-display text-ink border-ink inline-flex h-14 items-center justify-center rounded-full border-[1.5px] px-8 font-medium transition hover:bg-ink/5';

/**
 * §6 Nav: white, black wordmark, black pill CTA on the right.
 *
 * These exist as a separate export from `Button` for the same reason the hero
 * CTA does — marketing nav items are links. They are no longer a separate
 * *look*: v2 needed a white-on-cobalt nav to survive floating over the canvas,
 * and with the canvas gone the marketing nav is simply the app's nav. Kept as
 * named exports so the marketing pages keep one import rather than sprouting
 * per-page class strings again.
 */
export const heroNavLinkClass =
  'font-display text-muted hover:text-ink px-3 text-sm font-medium transition';

export const heroNavCtaClass =
  'font-display bg-ink text-white hover:bg-ink/85 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition';
