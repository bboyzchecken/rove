'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DREAMS } from '@/lib/mock';

/**
 * Dream Trip bucket list (M15 — W15.1 … W15.3).
 *
 * This is the pre-trip surface: things you saw and saved before any trip
 * exists. The "เริ่มแพลนจากอันนี้" button is the bridge into the entry flow.
 */
export function DreamList() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2.5">
      {DREAMS.map((dream) => (
        <Card key={dream.id} accent={dream.accent} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-espresso text-sm font-semibold">{dream.title}</p>
              <p className="text-muted mt-0.5 text-[11px]">{dream.destination}</p>
              {dream.note ? (
                <p className="text-muted mt-1.5 text-xs leading-relaxed">{dream.note}</p>
              ) : null}
              {dream.url ? (
                <span className="text-muted mt-1.5 inline-flex items-center gap-1 text-[11px]">
                  <Link2 className="size-3" /> มีลิงก์ที่เก็บไว้
                </span>
              ) : null}
            </div>
          </div>

          <Button
            variant="soft"
            size="sm"
            className="mt-3"
            onClick={() => router.push('/new?from=city')}
          >
            เริ่มแพลนทริปนี้
          </Button>
        </Card>
      ))}

      <Button variant="outline" block size="lg" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> เพิ่มที่อยากไป
      </Button>

      {adding ? <AddDreamSheet onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddDreamSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button className="bg-espresso/40 absolute inset-0" onClick={onClose} aria-label="ปิด" />

      <div className="bg-bg rounded-t-brand-lg sm:rounded-brand-lg animate-rove-rise relative z-10 w-full max-w-lg p-5 pb-8 sm:pb-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-espresso font-bold">เพิ่มที่อยากไป</p>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3">
          {[
            { label: 'อยากไปทำอะไร', placeholder: 'เช่น นอนดูแสงเหนือในกระท่อมกระจก' },
            { label: 'ที่ไหน', placeholder: 'ประเทศ · เมือง' },
            { label: 'ลิงก์ที่เจอมา (ใส่ก็ได้ ไม่ใส่ก็ได้)', placeholder: 'วาง URL ที่เลื่อนเจอ' },
            { label: 'โน้ตของตัวเอง', placeholder: 'ช่วงไหนไปดี ต้องจองล่วงหน้าไหม' },
          ].map((field) => (
            <label key={field.label} className="block">
              <span className="text-muted mb-1.5 block text-[11px] font-semibold">
                {field.label}
              </span>
              <input
                className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>

        <Button block size="lg" className="mt-5" onClick={onClose}>
          เก็บไว้ก่อน
        </Button>
        <p className="text-muted mt-2 text-center text-[11px]">ต้นแบบ — ยังไม่ได้ต่อกับ API จริง</p>
      </div>
    </div>
  );
}
