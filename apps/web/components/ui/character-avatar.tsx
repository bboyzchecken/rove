'use client';

import { useVariant } from '@/components/uat/variant-provider';
import { getCharacter } from '@/lib/catalog/characters';
import { flowerSvg } from '@/lib/catalog/flowers';
import { cn } from '@/lib/utils';

/**
 * A member's face anywhere in the app (M14 — W14.2). The character replaces
 * the OAuth avatar, which is the whole point: everyone in a trip room is a
 * recognisable little flower, not a grey circle.
 *
 * Drawn inline from `lib/catalog/flowers` rather than loaded as a bitmap
 * (Feedback #2 — F0.4): the same spec that writes the static files draws the
 * avatar, so the two cannot drift, and the LOOK — arms and legs or not — can
 * follow the UAT switcher while the tester is still deciding. Each spec
 * carries its own flat colour tile, so the avatar is a colour block on the
 * white page with no wrapper tint needed.
 *
 * A client component for that one hook; it has no state of its own.
 */
const SIZES = {
  xs: 'size-7',
  sm: 'size-9',
  md: 'size-12',
  lg: 'size-16',
  xl: 'size-24',
} as const;

export function CharacterAvatar({
  characterId,
  size = 'md',
  className,
  ring = false,
  square = false,
}: {
  characterId: string;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
  /** Rounded square instead of a circle — for picker grids and big tiles. */
  square?: boolean;
}) {
  const character = getCharacter(characterId);
  const look = useVariant('flower');

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden [&>svg]:size-full',
        square ? 'rounded-brand-sm' : 'rounded-full',
        SIZES[size],
        ring && 'ring-bg ring-2',
        className,
      )}
      title={character.name}
      // Our own markup, built from a fixed spec — nothing user-supplied.
      dangerouslySetInnerHTML={{
        __html: flowerSvg(character.flower, look, { label: character.name }),
      }}
    />
  );
}

/** Overlapping row of faces — member lists, trip cards, expense participants. */
export function CharacterStack({
  characterIds,
  size = 'sm',
  max = 5,
  className,
}: {
  characterIds: string[];
  size?: keyof typeof SIZES;
  max?: number;
  className?: string;
}) {
  const shown = characterIds.slice(0, max);
  const rest = characterIds.length - shown.length;

  return (
    <span className={cn('flex items-center -space-x-2', className)}>
      {shown.map((id, i) => (
        <CharacterAvatar key={`${id}-${i}`} characterId={id} size={size} ring />
      ))}
      {rest > 0 ? (
        <span className="bg-surface text-muted ring-bg inline-flex size-9 items-center justify-center rounded-full text-[11px] font-medium ring-2">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
