import Image from 'next/image';

import { getCharacter } from '@/lib/catalog/characters';
import { cn } from '@/lib/utils';

/**
 * A member's face anywhere in the app (M14 — W14.2). The character replaces
 * the OAuth avatar, which is the whole point: everyone in a trip room is a
 * recognisable little animal, not a grey circle.
 *
 * Each character image already carries its own flat colour tile (the generator
 * bakes it in, since FLUX cannot emit transparency), so the avatar is a colour
 * block on the white page with no wrapper tint needed.
 */
const SIZES = {
  xs: { box: 'size-7', px: 28 },
  sm: { box: 'size-9', px: 36 },
  md: { box: 'size-12', px: 48 },
  lg: { box: 'size-16', px: 64 },
  xl: { box: 'size-24', px: 96 },
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
  const s = SIZES[size];

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden',
        square ? 'rounded-brand-sm' : 'rounded-full',
        s.box,
        ring && 'ring-bg ring-2',
        className,
      )}
      title={character.name}
    >
      <Image
        src={character.image}
        alt={character.name}
        width={s.px}
        height={s.px}
        className="size-full object-cover"
      />
    </span>
  );
}

/** Overlapping row of faces — member lists, trip cards, expense participants. */
export function CharacterStack({
  characterIds,
  size = 'sm',
  max = 5,
}: {
  characterIds: string[];
  size?: keyof typeof SIZES;
  max?: number;
}) {
  const shown = characterIds.slice(0, max);
  const rest = characterIds.length - shown.length;

  return (
    <span className="flex items-center -space-x-2">
      {shown.map((id, i) => (
        <CharacterAvatar key={`${id}-${i}`} characterId={id} size={size} ring />
      ))}
      {rest > 0 ? (
        <span className="bg-surface text-muted ring-bg inline-flex size-9 items-center justify-center rounded-full text-[11px] font-semibold ring-2">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
