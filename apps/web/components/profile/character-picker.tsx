'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { CHARACTERS, CURRENT_USER } from '@/lib/mock';
import { cn } from '@/lib/utils';

/** Character picker (M14 — W14.1). Twenty fixed characters, no uploads. */
export function CharacterPicker() {
  const [selected, setSelected] = useState(CURRENT_USER.characterId);
  const current = CHARACTERS.find((c) => c.id === selected)!;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <CharacterAvatar characterId={selected} size="xl" />
        <div>
          <p className="font-display text-espresso text-lg font-extrabold">{current.name}</p>
          <p className="text-muted text-xs">ตัวนี้จะไปกับคุณทุกทริป ทุกคอมเมนต์ ทุกบิลที่หารกัน</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
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
