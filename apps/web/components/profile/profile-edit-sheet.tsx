'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useMe, useUpdateMe } from '@/features/auth/queries';
import type { CurrentUser } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Editing the three fields a user actually owns (A3.1 — `PATCH /users/me`).
 *
 * The character is not here: it saves on tap in its own picker, and pulling it
 * into a form with a save button would make choosing an avatar slower than it
 * was. E-mail is not here either — it comes from the OAuth provider and we have
 * no way to verify a new one.
 *
 * The handle is the only field that can be refused: it is public and unique, so
 * the API answers 400 when it is taken. That message is shown as-is rather than
 * replaced with something generic, because "ชื่อผู้ใช้นี้มีคนใช้แล้ว" tells the
 * user exactly which field to change.
 */
const CURRENCIES: { code: string; label: string }[] = [
  { code: 'THB', label: 'บาท' },
  { code: 'JPY', label: 'เยน' },
  { code: 'USD', label: 'ดอลลาร์สหรัฐ' },
  { code: 'EUR', label: 'ยูโร' },
  { code: 'KRW', label: 'วอน' },
  { code: 'TWD', label: 'ดอลลาร์ไต้หวัน' },
  { code: 'SGD', label: 'ดอลลาร์สิงคโปร์' },
  { code: 'GBP', label: 'ปอนด์' },
  { code: 'AUD', label: 'ดอลลาร์ออสเตรเลีย' },
  { code: 'CNY', label: 'หยวน' },
];

/**
 * A handle ends up in a URL, so it is narrowed here rather than left to the
 * user to discover the hard way: a leading "@" is dropped because that is how
 * people type one, and everything outside [a-z0-9_.] is removed.
 */
function normaliseHandle(raw: string) {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
}

export function ProfileEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMe();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="แก้ไขโปรไฟล์"
      description="ชื่อและตัวละครคือสิ่งที่เพื่อนร่วมทริปเห็น"
    >
      {me ? <EditForm me={me} onDone={onClose} /> : null}
    </Sheet>
  );
}

/**
 * The form is its own component so that closing the sheet unmounts it.
 *
 * That is what makes "reopen shows what the server has" true without an effect
 * that copies props into state on every open: a fresh mount seeds each field
 * once, from the answer `useMe` is holding right now, and an abandoned edit
 * dies with the previous mount. The failed-save message goes with it, which is
 * also the right behaviour — the user is starting over.
 */
function EditForm({ me, onDone }: { me: CurrentUser; onDone: () => void }) {
  const updateMe = useUpdateMe();

  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle ?? '');
  const [currency, setCurrency] = useState(me.homeCurrency || 'THB');

  const trimmedName = name.trim();
  const handleTooShort = handle.length > 0 && handle.length < 3;
  const canSave = trimmedName.length > 0 && !handleTooShort && !updateMe.isPending;

  async function save() {
    if (!canSave) return;
    await updateMe.mutateAsync({
      name: trimmedName,
      // An empty string is meaningful: the API reads it as "clear my handle".
      handle,
      homeCurrency: currency,
    });
    onDone();
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-muted mb-1.5 block text-[11px] font-semibold">ชื่อที่แสดง</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          placeholder="ชื่อที่อยากให้เพื่อนเห็น"
        />
      </label>

      <label className="block">
        <span className="text-muted mb-1.5 block text-[11px] font-semibold">
          ชื่อผู้ใช้ (ใส่ก็ได้ ไม่ใส่ก็ได้)
        </span>
        <div className="bg-surface flex items-center rounded-2xl px-3.5">
          <span className="text-muted text-sm">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(normaliseHandle(e.target.value))}
            className="text-espresso w-full bg-transparent py-2.5 pl-0.5 text-sm outline-none"
            placeholder="rove_traveller"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <span
          className={cn('mt-1 block text-[11px]', handleTooShort ? 'text-danger' : 'text-muted/70')}
        >
          {handleTooShort
            ? 'ต้องยาวอย่างน้อย 3 ตัวอักษร'
            : 'ใช้ a–z, 0–9, _ และ . ได้ ปล่อยว่างไว้ก็ได้'}
        </span>
      </label>

      <div>
        <span className="text-muted mb-1.5 block text-[11px] font-semibold">สกุลเงินหลัก</span>
        <div className="flex flex-wrap gap-1.5">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCurrency(c.code)}
              aria-pressed={currency === c.code}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                currency === c.code ? 'bg-espresso text-bg' : 'bg-surface text-muted hover:bg-border',
              )}
            >
              {c.code}
              <span className="ml-1 font-normal opacity-70">{c.label}</span>
            </button>
          ))}
        </div>
        <span className="text-muted/70 mt-1 block text-[11px]">
          ใช้เป็นสกุลเงินตั้งต้นของงบและบิลที่หารกัน
        </span>
      </div>

      {updateMe.isError ? (
        <p className="text-danger text-xs font-semibold" role="alert">
          {updateMe.error instanceof Error
            ? updateMe.error.message
            : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'}
        </p>
      ) : null}

      <div className="pt-2">
        <Button block size="lg" onClick={() => void save()} disabled={!canSave}>
          {updateMe.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      </div>
    </div>
  );
}
