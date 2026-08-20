'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { Character, Collection } from '@/types/api';

/**
 * A member's face. The character emoji is the fallback when OAuth gave us no
 * photo (W14.2) — and it is deliberately warmer than initials in a grey circle,
 * which is the whole point of the character feature.
 */

export function useCharacters() {
  return useQuery({
    queryKey: queryKeys.characters(),
    queryFn: () => api.get<Collection<Character>>('/characters'),
    // Seed data: it changes when an admin edits it, not during a session.
    staleTime: 60 * 60_000,
  });
}

const sizes = {
  sm: 'h-7 w-7 text-sm',
  md: 'h-9 w-9 text-base',
  lg: 'h-12 w-12 text-xl',
  xl: 'h-20 w-20 text-4xl',
};

export function Avatar({
  name,
  avatarUrl,
  characterId,
  size = 'md',
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  characterId?: number | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { data } = useCharacters();
  const character = characterId
    ? data?.items.find((c) => c.id === characterId)
    : undefined;

  const shell = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    sizes[size],
    className,
  );

  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- OAuth avatars come
    // from arbitrary hosts; allowlisting every provider in next.config is worse
    // than skipping the optimiser for a 36px circle.
    return <img src={avatarUrl} alt={name} className={cn(shell, 'object-cover')} />;
  }

  if (character) {
    return (
      <span className={cn(shell, 'bg-primary/12')} title={`${name} · ${character.name}`}>
        <span aria-hidden="true">{character.emoji}</span>
        <span className="sr-only">{name}</span>
      </span>
    );
  }

  return (
    <span className={cn(shell, 'bg-espresso/10 font-display font-bold text-espresso')} title={name}>
      <span aria-hidden="true">{name.trim().charAt(0) || '?'}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Overlapping avatars for a member list that has to fit on one line. */
export function AvatarStack({
  members,
  max = 5,
  size = 'sm',
}: {
  members: Array<{ user_id: string; display_name: string; avatar_url?: string | null; character_id?: number | null }>;
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = members.slice(0, max);
  const hidden = members.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((m) => (
        <Avatar
          key={m.user_id}
          name={m.display_name}
          avatarUrl={m.avatar_url}
          characterId={m.character_id}
          size={size}
          className="-ml-1.5 ring-2 ring-bg first:ml-0"
        />
      ))}
      {hidden > 0 ? (
        <span className="-ml-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-espresso/10 text-xs font-medium ring-2 ring-bg">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
