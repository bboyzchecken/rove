'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar, CharacterStack } from '@/components/ui/character-avatar';
import { FieldLabel, Input, Select, fieldClass } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import { useAddExpense, useExpenses, useRemoveExpense } from '@/features/expense/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { ExpenseScope } from '@/lib/data';
import { toIsoDate } from '@/lib/data/domain';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Expense list + add form (M16 — W16.1, W16.2).
 *
 * Shared and personal are separate filters rather than one merged list: the
 * whole feature exists so that "ของกลาง" and "ของกู" never get confused.
 */
const CATEGORIES = ['อาหาร', 'เดินทาง', 'ที่พัก', 'ตั๋ว/กิจกรรม', 'ช้อปปิ้ง', 'อื่นๆ'];

export function ExpenseBoard({ tripId, fxRate }: { tripId: string; fxRate: number }) {
  const { data: summary } = useExpenses(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const removeExpense = useRemoveExpense(tripId);

  const [scope, setScope] = useState<ExpenseScope | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const entries = summary?.entries ?? [];
  const rows = entries
    .filter((e) => scope === 'all' || e.scope === scope)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '—';
  const characterOf = (id: string) => members.find((m) => m.id === id)?.characterId ?? 'shiba';

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
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
              scope === key ? 'bg-ink text-bg' : 'bg-surface text-muted',
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
          {rows.map((entry) => {
            const thb = entry.currency === 'JPY' ? Math.round(entry.amount * fxRate) : entry.amount;
            return (
              <div key={entry.id} className="flex items-center gap-3 p-3.5">
                <CharacterAvatar characterId={characterOf(entry.paidBy)} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-ink truncate text-sm font-medium">{entry.title}</p>
                    {entry.scope === 'personal' ? <Badge tone="pink">ส่วนตัว</Badge> : null}
                  </div>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {nameOf(entry.paidBy)} จ่าย · {formatThaiDate(entry.date, { year: undefined })}{' '}
                    · {entry.category}
                  </p>
                  {entry.scope === 'shared' && entry.participants.length > 0 ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-muted text-[10px]">
                        หาร {entry.participants.length} คน
                      </span>
                      <CharacterStack
                        characterIds={entry.participants.map(characterOf)}
                        size="xs"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-ink nums text-sm font-medium">{formatMoney(thb, 'THB')}</p>
                  {entry.currency === 'JPY' ? (
                    <p className="text-muted nums text-[10px]">
                      ¥{entry.amount.toLocaleString('en-US')}
                    </p>
                  ) : null}
                </div>

                <button
                  aria-label={`ลบ ${entry.title}`}
                  onClick={() => removeExpense.mutate(entry.id)}
                  className="text-muted hover:text-danger flex size-8 shrink-0 items-center justify-center rounded-full"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </Card>
      )}

      <Button variant="outline" block size="lg" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> บันทึกรายจ่าย
      </Button>

      <AddExpenseSheet tripId={tripId} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddExpenseSheet(props: { tripId: string; open: boolean; onClose: () => void }) {
  if (!props.open) return null;
  // Remounted each time it opens, so the form starts clean without an effect.
  return <AddExpenseForm {...props} />;
}

function AddExpenseForm({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: members = [] } = useTripMembers(tripId);
  const { data: me } = useMe();
  const addExpense = useAddExpense(tripId);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'JPY' | 'THB'>('JPY');
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [scope, setScope] = useState<ExpenseScope>('shared');
  const [date, setDate] = useState(toIsoDate(new Date()));
  // Whoever is filling the form is the likeliest payer, and a shared bill
  // usually splits across everyone — both stay overridable below.
  const [payer, setPayer] = useState<string | null>(null);
  const [splitWith, setSplitWith] = useState<string[] | null>(null);
  const paidBy = payer ?? me?.id ?? members[0]?.id ?? '';
  const participants = splitWith ?? members.map((m) => m.id);
  const setPaidBy = setPayer;
  const setParticipants = setSplitWith;

  async function save() {
    if (!title.trim() || !amount || !paidBy) return;
    await addExpense.mutateAsync({
      date,
      title: title.trim(),
      category,
      scope,
      amount: Number(amount),
      currency,
      paidBy,
      participants: scope === 'shared' ? participants : [],
    });
    setTitle('');
    setAmount('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="บันทึกรายจ่าย"
      description="ของกลางจะถูกหารตามคนที่เลือก ส่วนตัวไม่แตะยอดใคร"
      footer={
        <Button
          block
          size="lg"
          onClick={() => void save()}
          disabled={addExpense.isPending || !title.trim() || !amount}
        >
          {addExpense.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <FieldLabel>จ่ายอะไร</FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ข้าวเย็นวันแรก"
          />
        </label>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <FieldLabel>จำนวนเงิน</FieldLabel>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(fieldClass, 'nums')}
            />
          </label>
          <div>
            <FieldLabel>สกุล</FieldLabel>
            <div className="bg-surface flex rounded-full p-1">
              {(['JPY', 'THB'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setCurrency(option)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition',
                    currency === option ? 'bg-ink text-bg' : 'text-muted',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <FieldLabel>วันที่</FieldLabel>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <FieldLabel>หมวด</FieldLabel>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
        </div>

        <div>
          <FieldLabel>ประเภท</FieldLabel>
          <div className="bg-surface flex rounded-full p-1">
            {(
              [
                ['shared', 'ของกลาง (หารกัน)'],
                ['personal', 'ส่วนตัว'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScope(key)}
                className={cn(
                  'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
                  scope === key ? 'bg-ink text-bg' : 'text-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>ใครจ่าย</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {members.map((member) => (
              <button
                key={member.id}
                onClick={() => setPaidBy(member.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-medium transition',
                  paidBy === member.id ? 'bg-ink text-bg' : 'bg-surface text-muted',
                )}
              >
                <CharacterAvatar characterId={member.characterId} size="xs" />
                {member.name}
              </button>
            ))}
          </div>
        </div>

        {scope === 'shared' ? (
          <div>
            <FieldLabel>หารกับใครบ้าง ({participants.length} คน)</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {members.map((member) => {
                const on = participants.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() =>
                      setParticipants(
                        on
                          ? participants.filter((id) => id !== member.id)
                          : [...participants, member.id],
                      )
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-medium transition',
                      on ? 'bg-primary/12 text-primary' : 'bg-surface text-muted opacity-60',
                    )}
                  >
                    <CharacterAvatar characterId={member.characterId} size="xs" />
                    {member.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
