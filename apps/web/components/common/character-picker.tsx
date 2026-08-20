'use client';

import { useState } from 'react';

import { useSetCharacter } from '@/features/user/queries';
import { useCharacters } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';

/**
 * W14.1 / W14.3 — pick a character.
 *
 * This is the first thing a new account does, before anything else is asked of
 * them, because it is the one step that is pure fun. It also solves a real
 * problem: LINE users often have no photo, and a grid of grey initials makes a
 * trip room feel like a spreadsheet.
 */
export function CharacterPicker({
  currentId,
  onPicked,
  autoSave = true,
}: {
  currentId?: number | null;
  onPicked?: (characterId: number) => void;
  autoSave?: boolean;
}) {
  const { data, isLoading } = useCharacters();
  const setCharacter = useSetCharacter();
  const [selected, setSelected] = useState<number | null>(currentId ?? null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const characters = data?.items ?? [];

  function pick(id: number) {
    setSelected(id);
    if (autoSave) setCharacter.mutate(id);
    onPicked?.(id);
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {characters.map((character) => {
          const active = selected === character.id;
          return (
            <button
              key={character.id}
              type="button"
              aria-pressed={active}
              title={character.name}
              onClick={() => pick(character.id)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-brand text-2xl transition',
                active
                  ? 'bg-primary/20 ring-2 ring-primary'
                  : 'bg-espresso/5 hover:bg-espresso/10',
              )}
            >
              <span aria-hidden="true">{character.emoji}</span>
              <span className="sr-only">{character.name}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <p className="mt-2 text-center text-sm text-muted">
          {characters.find((c) => c.id === selected)?.name}
          {setCharacter.isPending ? ' · กำลังบันทึก…' : ''}
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-muted">เลือกตัวที่ชอบได้เลย</p>
      )}
    </div>
  );
}

/** The onboarding step wrapper — same picker, with a way forward. */
export function CharacterOnboarding({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-display text-2xl">เลือกตัวละครของคุณ</h1>
        <p className="mt-1 text-sm text-muted">
          เพื่อน ๆ จะเห็นตัวนี้แทนรูปโปรไฟล์ในห้องทริป เปลี่ยนทีหลังได้
        </p>
      </div>

      <CharacterPicker onPicked={setPicked} />

      <Button full disabled={!picked} onClick={onDone}>
        {picked ? 'ไปต่อ' : 'เลือกสักตัวก่อน'}
      </Button>
    </div>
  );
}
