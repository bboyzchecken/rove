'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar, CharacterStack } from '@/components/ui/character-avatar';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { EXPENSES, MEMBERS, memberName, toThb, type ExpenseScope } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * Expense list + add form (M16 — W16.1, W16.2).
 *
 * Shared and personal are separate filters rather than one merged list: the
 * whole feature exists so that "ของกลาง" and "ของกู" never get confused.
 */
export function ExpenseBoard() {
  const [scope, setScope] = useState<ExpenseScope | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const rows = EXPENSES.filter((e) => scope === 'all' || e.scope === scope).sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(
          [
            ['all', 'ทั้งหมด'],
            ['shared', 'ของกลาง'],
            ['personal', 'ส่วนตัว'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              scope === key ? 'bg-espresso text-bg' : 'bg-surface text-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          image="/brand/empty/empty-expense.webp"
          title="ยังไม่มีรายจ่ายในหมวดนี้"
          hint="พอเริ่มเที่ยวจริง บันทึกทีละบิลตรงนี้ได้เลย เดี๋ยวหารให้เอง"
        />
      ) : (
        <Card className="divide-border divide-y">
          {rows.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 p-3.5">
              <CharacterAvatar
                characterId={MEMBERS.find((m) => m.id === entry.paidBy)!.characterId}
                size="sm"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-espresso truncate text-sm font-semibold">{entry.title}</p>
                  {entry.scope === 'personal' ? <Badge tone="joyfull">ส่วนตัว</Badge> : null}
                </div>
                <p className="text-muted mt-0.5 text-[11px]">
                  {memberName(entry.paidBy)} จ่าย ·{' '}
                  {formatThaiDate(entry.date, { year: undefined })} · {entry.category}
                </p>
                {entry.scope === 'shared' ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-muted text-[10px]">
                      หาร {entry.participants.length} คน
                    </span>
                    <CharacterStack
                      characterIds={entry.participants.map(
                        (id) => MEMBERS.find((m) => m.id === id)!.characterId,
                      )}
                      size="xs"
                    />
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 text-right">
                <p className="text-espresso nums text-sm font-semibold">
                  {formatMoney(toThb(entry), 'THB')}
                </p>
                {entry.currency === 'JPY' ? (
                  <p className="text-muted nums text-[10px]">
                    ¥{entry.amount.toLocaleString('en-US')}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}

      <Button block size="lg" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> บันทึกรายจ่าย
      </Button>

      {adding ? <AddExpenseSheet onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

/** Static form — the prototype shows the shape of the input, not a mutation. */
function AddExpenseSheet({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<ExpenseScope>('shared');
  const [participants, setParticipants] = useState<string[]>(MEMBERS.map((m) => m.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button className="bg-espresso/40 absolute inset-0" onClick={onClose} aria-label="ปิด" />

      <div className="bg-bg rounded-t-brand-lg sm:rounded-brand-lg animate-rove-rise relative z-10 w-full max-w-lg p-5 pb-8 sm:pb-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-espresso font-bold">บันทึกรายจ่าย</p>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="จ่ายค่าอะไร">
            <input
              className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
              placeholder="เช่น ข้าวเย็นร้านอิซากายะ"
            />
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="จำนวนเงิน">
              <input
                className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 nums text-sm outline-none"
                placeholder="0"
                inputMode="decimal"
              />
            </Field>
            <Field label="สกุล">
              <select className="bg-surface text-espresso rounded-2xl px-3.5 py-2.5 text-sm outline-none">
                <option>JPY</option>
                <option>THB</option>
              </select>
            </Field>
          </div>

          <Field label="เป็นของกลางหรือส่วนตัว">
            <div className="flex gap-1.5">
              {(
                [
                  ['shared', 'ของกลาง — หารกัน'],
                  ['personal', 'ส่วนตัว — ของฉันคนเดียว'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setScope(key)}
                  className={cn(
                    'flex-1 rounded-2xl px-3 py-2.5 text-xs font-semibold transition',
                    scope === key ? 'bg-espresso text-bg' : 'bg-surface text-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {scope === 'shared' ? (
            <Field label="ใครร่วมหารบ้าง">
              <div className="flex flex-wrap gap-1.5">
                {MEMBERS.map((m) => {
                  const on = participants.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setParticipants((prev) =>
                          on ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-1.5 text-xs font-semibold transition',
                        on ? 'bg-espresso text-bg' : 'bg-surface text-muted',
                      )}
                    >
                      <CharacterAvatar characterId={m.characterId} size="xs" />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : null}
        </div>

        <Button block size="lg" className="mt-5" onClick={onClose}>
          บันทึก
        </Button>
        <p className="text-muted mt-2 text-center text-[11px]">ต้นแบบ — ยังไม่ได้ต่อกับ API จริง</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
