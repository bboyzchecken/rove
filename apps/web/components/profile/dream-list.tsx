'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useAddDream, useDreams, useRemoveDream } from '@/features/auth/queries';
import type { DreamItem } from '@/lib/data';

/**
 * Dream Trip bucket list (M15 — W15.1 … W15.3).
 *
 * This is the pre-trip surface: things you saw and saved before any trip
 * exists. The "เริ่มแพลนทริปนี้" button is the bridge into the entry flow, and
 * it carries the destination across so the city chip is already filled in.
 */
const ACCENTS: DreamItem['accent'][] = ['primary', 'matcha', 'sky', 'sun', 'joyfull'];

export function DreamList() {
  const router = useRouter();
  const { data: dreams = [], isLoading } = useDreams();
  const removeDream = useRemoveDream();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2.5">
      {isLoading ? <div className="rounded-brand bg-surface h-24 animate-pulse" /> : null}

      {!isLoading && dreams.length === 0 ? (
        <EmptyState
          image="/brand/empty/empty-dream.webp"
          title="ยังไม่มีที่อยากไป"
          hint="เจออะไรน่าไปตอนเลื่อนฟีด เก็บไว้ตรงนี้ก่อน แล้วค่อยเอามาทำเป็นทริปจริง"
        />
      ) : null}

      {dreams.map((dream) => (
        <Card key={dream.id} accent={dream.accent} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-espresso text-sm font-semibold">{dream.title}</p>
              <p className="text-muted mt-0.5 text-[11px]">{dream.destination}</p>
              {dream.note ? (
                <p className="text-muted mt-1.5 text-xs leading-relaxed">{dream.note}</p>
              ) : null}
              {dream.url ? (
                <a
                  href={dream.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted mt-1.5 inline-flex items-center gap-1 text-[11px] underline"
                >
                  <Link2 className="size-3" /> ลิงก์ที่เก็บไว้
                </a>
              ) : null}
            </div>
            <button
              aria-label={`ลบ ${dream.title}`}
              onClick={() => removeDream.mutate(dream.id)}
              className="text-muted hover:text-danger flex size-8 shrink-0 items-center justify-center rounded-full"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <Button
            variant="soft"
            size="sm"
            className="mt-3"
            onClick={() =>
              router.push(
                `/new?from=route&city=${encodeURIComponent(cityOf(dream.destination))}` as never,
              )
            }
          >
            เริ่มแพลนทริปนี้
          </Button>
        </Card>
      ))}

      <Button variant="outline" block size="lg" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> เพิ่มที่อยากไป
      </Button>

      <AddDreamSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** "ญี่ปุ่น · ฮิเมจิ" → "ฮิเมจิ" — the entry flow wants a city, not a country. */
function cityOf(destination: string) {
  const parts = destination.split('·').map((p) => p.trim());
  return parts[parts.length - 1] ?? destination;
}

function AddDreamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addDream = useAddDream();
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');

  async function save() {
    if (!title.trim()) return;
    await addDream.mutateAsync({
      title: title.trim(),
      destination: destination.trim() || 'ยังไม่ระบุ',
      url: url.trim() || undefined,
      note: note.trim() || undefined,
      accent: ACCENTS[Math.floor(title.length % ACCENTS.length)]!,
    });
    setTitle('');
    setDestination('');
    setUrl('');
    setNote('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="เพิ่มที่อยากไป"
      description="ยังไม่ต้องมีวัน ไม่ต้องมีแผน — เก็บไว้ก่อนได้"
      footer={
        <Button block size="lg" onClick={() => void save()} disabled={addDream.isPending || !title.trim()}>
          {addDream.isPending ? 'กำลังเก็บ…' : 'เก็บไว้ก่อน'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="อยากไปทำอะไร" value={title} onChange={setTitle} placeholder="เช่น นอนดูแสงเหนือในกระท่อมกระจก" />
        <Field label="ที่ไหน" value={destination} onChange={setDestination} placeholder="ประเทศ · เมือง" />
        <Field label="ลิงก์ที่เจอมา (ใส่ก็ได้ ไม่ใส่ก็ได้)" value={url} onChange={setUrl} placeholder="วาง URL ที่เลื่อนเจอ" />
        <Field label="โน้ตของตัวเอง" value={note} onChange={setNote} placeholder="ช่วงไหนไปดี ต้องจองล่วงหน้าไหม" />
      </div>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-[11px] font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}
