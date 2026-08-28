import { cn } from '@/lib/utils';

/**
 * The doodle set (ROVE_BRAND_SPEC §4) — the thing the brand is remembered by.
 *
 * Ten marks, and only ten. §4.2 is a closed vocabulary on purpose: a brand
 * recognisable from its linework stops being recognisable the moment every
 * screen draws its own squiggle. If a page needs a mark that is not here, the
 * answer is one of these used differently, not an eleventh.
 *
 * WHY HAND-AUTHORED PATHS, NOT TRACED GENERATIONS
 * §6.5 requires the shipped doodle to be an inline SVG with `stroke:
 * currentColor` and no fill — a raster generation is only ever the *input* to
 * that, and the trace-and-simplify step in between is manual work in
 * Illustrator that leaves stray points and broken joins when it is automated.
 * Authoring the curves directly lands on the same required end state with
 * clean single-stroke geometry, which is what §4.1 actually asks for. FLUX is
 * still doing the raster illustration work it is good at — see
 * `scripts/gen-brand-assets.mjs`.
 *
 * HARD RULES, ENFORCED IN CSS NOT HERE
 * `.doodle` in globals.css sets `fill: none`, `stroke: currentColor`, a 4px
 * non-scaling stroke, and round caps and joins. These components carry
 * geometry and nothing else, so a doodle cannot be authored with a fill by
 * mistake, and every mark keeps the same line weight at every size.
 *
 * COLOUR (§5.1)
 * On a hero canvas: pink, green, yellow or white. On white or cream: ink.
 * Set it with `className="text-pink"` — never hardcode a stroke.
 *
 * SIZE (§5.1.7)
 * Scale is meant to vary wildly. One anchor mark at 200px+ carries a hero and
 * the rest sit at 40–80px; doodles all cut to the same size read as clip art.
 *
 * DENSITY (§5.3)
 * Hero 3–4 — one large anchor plus two or three small. Content section 1–2,
 * in the margin. Card 0–1, and only with space to spare. A doodle may overlap
 * display type, which is the whole drawn-on effect; it must never overlap
 * body copy. Every mark is `aria-hidden` and `pointer-events: none`, but that
 * only hides it from a screen reader, not from the eye reading underneath.
 */

type DoodleProps = Omit<React.SVGProps<SVGSVGElement>, 'viewBox' | 'fill'>;

function Mark({
  box,
  className,
  children,
  ...props
}: DoodleProps & { box: string; children: React.ReactNode }) {
  return (
    <svg viewBox={box} className={cn('doodle', className)} aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/* --------------------------------------------------------------- flower --
 * Eight long rounded petals and a small centre. This is the hero anchor mark
 * (§5.2), so the petals run nearly to the edge of the box — a short-petalled
 * rosette reads as a logo at 200px, not as something drawn on.
 *
 * One path rotated eight times at jittered angles rather than at a clean 45°:
 * §5.1 wants symmetry that is approximate. */
const PETAL = 'M32 31C26.5 22 26.5 10 32 4 37.5 10 37.5 22 32 31Z';

export function Flower(props: DoodleProps) {
  return (
    <Mark box="0 0 64 64" {...props}>
      {[-2, 46, 89, 134, 178, 224, 268, 313].map((angle) => (
        <path key={angle} d={PETAL} transform={`rotate(${angle} 32 32)`} />
      ))}
      <circle cx="32" cy="32.5" r="3.2" />
    </Mark>
  );
}

/* ------------------------------------------------------------ curl arrow --
 * Curls out of a loop and then points DOWN (§5.2) — it lives at the bottom of
 * a hero aiming at the CTA, from just outside the pill and never inside it
 * (§7 Hero CTA). */
export function SquiggleArrow(props: DoodleProps) {
  return (
    <Mark box="0 0 48 72" {...props}>
      <path d="M20 8C11 8 8 18 16 20 24 22 25 10 18 9c10 4 14 25 10 46" />
      <path d="M28 55 20 46" />
      <path d="M28 55 35 45" />
    </Mark>
  );
}

/* ------------------------------------------------------------ starburst --
 * Eight sharp spikes at uneven radii — the unevenness is the whole point, an
 * even one is a sparkle. The second-largest mark in a hero (§5.2). */
export function StarBurst(props: DoodleProps) {
  return (
    <Mark box="0 0 64 64" {...props}>
      <path d="M30.9 2 34.9 24.5 48.7 14.7 39.9 28.8 61 33 39.3 35.3 49.4 50 35.2 39.9 31.5 62 28.9 39.4 15.5 48 24.1 35.2 3 32.5 24.5 29.1 13.3 13.9 28.8 24.1Z" />
    </Mark>
  );
}

/* ------------------------------------------------------ underline scribble --
 * Three passes, none of them the same length. Sits under a key phrase in a
 * headline — one phrase per section (§7). */
export function Underline(props: DoodleProps) {
  return (
    <Mark box="0 0 120 24" preserveAspectRatio="none" {...props}>
      <path d="M4 13C26 6 62 6 116 10" />
      <path d="M7 18C32 12 70 12 112 15" />
      <path d="M13 9C40 4 78 5 103 7" />
    </Mark>
  );
}

/* -------------------------------------------------------- circle-around --
 * A rough ellipse that overshoots its own start and never quite closes. Draw
 * it around one word. */
export function CircleAround(props: DoodleProps) {
  return (
    <Mark box="0 0 120 64" preserveAspectRatio="none" {...props}>
      <path d="M99 17C81 6 36 6 16 18 2 27 6 47 28 54c24 8 70 4 82-10 8-9 5-21-8-27l-6-2" />
    </Mark>
  );
}

/* -------------------------------------------------------------- spiral --
 * Three loose turns, open at the outer end. Filler for whitespace and the
 * loading state — it is the one mark that reads as "still going". */
export function Spiral(props: DoodleProps) {
  return (
    <Mark box="0 0 64 64" {...props}>
      <path d="M32 32c2.5 0 3 3 .5 3.5C28 36.5 26 30 30 27c6-4.4 14 2 13 10-1.3 10-15 14-23 8C10 37.5 13.5 20 26 15c14-5.6 31 3 32 18" />
    </Mark>
  );
}

/* ------------------------------------------------------------- sparkle --
 * Three four-point stars at three sizes. Clustered, near an AI feature. This
 * is the only mark that ships as a group — one sparkle on its own reads as a
 * rating star. */
function star(cx: number, cy: number, s: number) {
  const a = 0.13 * s;
  const b = 0.3 * s;
  return [
    `M${cx} ${cy - s}`,
    `C${cx + a} ${cy - b} ${cx + b} ${cy - a} ${cx + s} ${cy}`,
    `C${cx + b} ${cy + a} ${cx + a} ${cy + b} ${cx} ${cy + s}`,
    `C${cx - a} ${cy + b} ${cx - b} ${cy + a} ${cx - s} ${cy}`,
    `C${cx - b} ${cy - a} ${cx - a} ${cy - b} ${cx} ${cy - s}`,
    'Z',
  ].join('');
}

export function Sparkle(props: DoodleProps) {
  return (
    <Mark box="0 0 64 64" {...props}>
      <path d={star(24, 24, 16)} />
      <path d={star(47, 42, 11)} />
      <path d={star(44, 13, 7)} />
    </Mark>
  );
}

/* ---------------------------------------------------------- wave line --
 * Four crests, the last one flattening out. A section divider, and the only
 * doodle allowed to run the full width of a column. */
export function Wave(props: DoodleProps) {
  return (
    <Mark box="0 0 120 24" preserveAspectRatio="none" {...props}>
      <path d="M4 12C12 2 20 2 28 12s16 10 24 0 16-10 24 0 16 10 24 0c5-5.5 10-6.5 16-3" />
    </Mark>
  );
}

/* --------------------------------------------------------- dotted path --
 * A journey that ends somewhere. The dashes are set here rather than in
 * `.doodle` because this is the one mark that is not a continuous stroke. */
export function DottedPath(props: DoodleProps) {
  return (
    <Mark box="0 0 120 64" {...props}>
      <path d="M6 52C24 56 33 35 45 25 57 15 74 12 88 19" strokeDasharray="1 9" />
      <circle cx="96" cy="24" r="6" />
    </Mark>
  );
}

/* ----------------------------------------------------------------- heart --
 * One stroke, lopsided on purpose — the left lobe is larger. Saved, favourite,
 * community. */
export function Heart(props: DoodleProps) {
  return (
    <Mark box="0 0 64 64" {...props}>
      <path d="M32.5 55C11 41 5 28 9.5 19.5 14 11 27 12 32.5 21.5 38.5 12.5 50 13 54 21c3.5 7.5-4 19-21.5 34" />
    </Mark>
  );
}

/**
 * The set, keyed — for the places that pick a mark from data (a step index, a
 * category) rather than naming one in the markup.
 */
export const DOODLES = {
  flower: Flower,
  arrow: SquiggleArrow,
  star: StarBurst,
  underline: Underline,
  circle: CircleAround,
  spiral: Spiral,
  sparkle: Sparkle,
  wave: Wave,
  path: DottedPath,
  heart: Heart,
} as const;

export type DoodleName = keyof typeof DOODLES;

export function Doodle({ name, ...props }: DoodleProps & { name: DoodleName }) {
  const Component = DOODLES[name];
  return <Component {...props} />;
}
