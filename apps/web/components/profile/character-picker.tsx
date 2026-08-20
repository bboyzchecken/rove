'use client';

import { Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useCharacters, useMe, useUpdateMe } from '@/features/auth/queries';
import { cn } from '@/lib/utils';

/**
 * Character picker (M14 — W14.1). Twenty fixed characters, no uploads.
 *
 * The pick saves on tap rather than behind a "บันทึก" button: it is one field,
 * and a confirmation step for choosing an avatar is a step nobody wants.
 */
export function CharacterPicker() {
  const { data: characters = [] } = useCharacters();
  const { data: me } = useMe();
  const updateMe = useUpdateMe();

  const selected = me?.characterId ?? 'shiba';
  const current = characters.find((c) => c.id === selected);

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <CharacterAvatar characterId={selected} size="xl" />
        <div>
          <p className="font-display text-espresso text-lg font-extrabold">
            {current?.name ?? '—'}
          </p>
          <p className="text-muted text-xs">ตัวนี้จะไปกับคุณทุกทริป ทุกคอมเมนต์ ทุกบิลที่หารกัน</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {characters.map((c) => (
          <button
            key={c.id}
            onClick={() => updateMe.mutate({ characterId: c.id })}
            className={cn(
              'relative rounded-2xl p-1 transition',
              selected === c.id ? 'bg-espresso' : 'bg-bg hover:bg-surface',
            )}
            title={c.name}
            aria-pressed={selected === c.id}
          >
            <CharacterAvatar characterId={c.id} size="md" className="mx-auto" />
            {selected === c.id ? (
              <span className="bg-primary text-primary-fg absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full">
                <Check className="size-2.5" strokeWidth={4} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Card>
  );
}
