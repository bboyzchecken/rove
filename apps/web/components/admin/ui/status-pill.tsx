import { cn } from '@/lib/utils';

/**
 * StatusPill (Phase 5 — W25.3).
 *
 * The admin surface spends its accent colours on status and nothing else
 * (§4.2), and this is where that rule is written down: green = done, yellow =
 * waiting, purple = information, danger = careful, plain = nothing to say.
 *
 * The tone is a prop rather than derived from the label, because the same word
 * means different things on different screens — "new" is neutral on a lead
 * queue and alarming on a moderation queue.
 *
 * TINTED FILL, COLOURED TYPE — the dark-surface inversion of the product's
 * black-on-pastel chips.
 *
 * §2.4's "black text on every colour" is a rule about the product's white
 * page: it holds because all twelve colours are pastels sitting on white. The
 * admin surface redeclares those same tokens as desaturated mid-tones on a
 * near-black page (see brand.css), where `--brand-ink` has inverted to
 * near-white — so a filled pastel pill carrying `text-ink` would be light
 * type on a light fill, which is the one combination that fails everywhere.
 *
 * The admin reading of the same rule is therefore the mirror of it: the fill
 * drops to a wash of the hue and the hue itself becomes the type.
 */
const TONE = {
  ok: 'bg-green-solid/15 text-green-light',
  wait: 'bg-yellow-solid/15 text-yellow-light',
  info: 'bg-purple-solid/15 text-purple-light',
  danger: 'bg-danger/15 text-danger',
  plain: 'bg-bg text-muted',
} as const;

export type StatusTone = keyof typeof TONE;

export function StatusPill({
  tone = 'plain',
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-brand-sm inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * KeyValueList (Phase 5 — W25.3) — the detail half of every admin screen.
 *
 * A drawer showing one record is a list of labelled facts, and building that
 * out of divs each time is how six screens end up with six alignments. Terms
 * on the left, values right-aligned so figures line up down the column.
 */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; hint?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn('divide-border divide-y', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted shrink-0 text-xs">{item.label}</dt>
          <dd className="text-ink nums min-w-0 text-right text-sm font-medium">
            {item.value}
            {item.hint ? (
              <span className="text-muted block text-[11px] font-normal">{item.hint}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
