import { cn } from '@/lib/utils';

/**
 * The hero overlay pills (ROVE_BRAND_SPEC §4).
 *
 * HERO ONLY. §7 is explicit that tilting is a hero-only device and that
 * content-area tags are flat and untilted — that contrast between a loud hero
 * and calm content *is* the design (§1). For a tag inside a card or a section,
 * use `Badge`, not this.
 *
 * A tag is scattered, rotated, and overlapping the headline. Sitting neatly in
 * the margin at 0° looks timid and reads as an accident rather than a choice.
 *
 * §4.2 in code:
 *   1. 4–6 per hero — fewer reads accidental, more reads cluttered
 *   2. every tag a different angle, between -12° and +12°, never 0°
 *   3. never aligned to each other — no shared baseline, no even spacing
 *   4. overlap the *edge* of a letter, never the middle of a word
 *   5. two accent colours plus one ink tag, which anchors the cluster
 *   6. text is a real category, one or two words, sentence case
 *   7. never cover the knockout word
 *
 * Points 1–4 belong to the caller placing them; this component owns the shape
 * and the colour pairs, which are the parts that must not drift.
 */
/**
 * The hero is one of the three places §2.5 lets several feature colours sit
 * together, so a tag cluster may name hues — and it should, because naming
 * them is the point: a marketing hero scattered with the six pastels is where
 * a first-time visitor meets the palette they will later navigate by.
 *
 * The tones are the FEATURES, not the hues, for the same reason the scopes in
 * brand.css are. A tag that says "รายจ่าย" should take `documents` and get
 * orange because that is where the feature lives, so a future palette change
 * moves the hero with it rather than stranding it on a colour that no longer
 * means anything.
 *
 * Every one carries black text (§2.4) — including the anchor, where black is
 * on white rather than the other way round.
 */
const TONE = {
  itinerary: 'bg-blue-light text-ink',
  wishlist: 'bg-pink-light text-ink',
  countdown: 'bg-yellow-light text-ink',
  journal: 'bg-green-light text-ink',
  documents: 'bg-orange-light text-ink',
  memo: 'bg-purple-light text-ink',
  /** The anchor. One per cluster (§4.2.5), and the only white text on the
   *  page — legal because it is on black (§2.4). */
  ink: 'bg-ink text-white',
} as const;

export type TiltedTagTone = keyof typeof TONE;

/**
 * The same colour pairs, for the one caller that needs them without the tilt.
 *
 * `HeroCanvas` renders the cluster twice: tilted over the headline at `lg`,
 * and as a flat wrapped row under the lead below it, where there is no gutter
 * for a pill to hang into. Both are the same tags in the same tones, so the
 * map has to be shared — a second hand-written copy is how a tone ends up
 * meaning orange in one breakpoint and yellow in the other.
 */
export const TAG_TONE = TONE;

export function TiltedTag({
  tone = 'ink',
  rotate,
  shiftX = 0,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: TiltedTagTone;
  /** Degrees, -12 to 12. Never 0, and never the same value twice in a hero. */
  rotate: number;
  /**
   * How far the tag slides out of its anchor edge, as a percentage of its own
   * width. `-80` leaves a fifth of the pill over the text.
   *
   * It lives here rather than as a Tailwind `translate-x-*` class because the
   * rotation below is already an inline `transform`, and an inline style beats
   * a utility outright — the class would simply have been dropped.
   */
  shiftX?: number;
}) {
  return (
    <span
      className={cn(
        'font-display inline-block rounded-full px-3.5 py-1.5 text-[12px] font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
      // Marks the overlay layer for the readability audit, which checks that
      // no tag lands on the knockout word or on body copy.
      data-tilted-tag=""
      // Inline because both values are per-tag and arbitrary: a Tailwind class
      // built from a runtime value is never generated, and a fixed set of
      // rotate utilities would push every hero toward reusing the same five
      // angles — which is the alignment §4.2.2 rules out.
      style={{ transform: `translateX(${shiftX}%) rotate(${rotate}deg)` }}
      {...props}
    />
  );
}
