'use client';

import { useState } from 'react';

import { useCreateExpense, type ExpenseInput } from '@/features/expense/queries';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ExpenseCategory, MemberView } from '@/types/api';

/**
 * W16.2 — record what someone actually paid.
 *
 * The shared/personal toggle is the core of the feature: shared money is split
 * among whoever was there ("ขุนทอง"), personal money belongs to one person and
 * never enters a settlement.
 */

const CATEGORIES: Record<ExpenseCategory, string> = {
  food: 'อาหาร',
  stay: 'ที่พัก',
  transport: 'เดินทาง',
  ticket: 'ค่าเข้า/ตั๋ว',
  shopping: 'ช้อปปิ้ง',
  other: 'อื่น ๆ',
};

export function ExpenseForm({
  tripId,
  members,
  meId,
  open,
  onClose,
}: {
  tripId: string;
  members: MemberView[];
  meId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const createExpense = useCreateExpense(tripId);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('JPY');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [splitType, setSplitType] = useState<'shared' | 'personal'>('shared');
  const [paidBy, setPaidBy] = useState(meId ?? '');
  // Everyone splits by default — that is what "shared" means until someone
  // narrows it down.
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.user_id));

  const numericAmount = Number(amount);
  const canSubmit = title.trim().length > 0 && numericAmount > 0;

  function submit() {
    const input: ExpenseInput = {
      title: title.trim(),
      amount: numericAmount,
      currency,
      category,
      split_type: splitType,
      paid_by_user_id: paidBy || undefined,
      participants_json: splitType === 'shared' ? participants : undefined,
    };
    createExpense.mutate(input, {
      onSuccess: () => {
        setTitle('');
        setAmount('');
        onClose();
      },
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="บันทึกรายจ่าย"
      description="เงินที่จ่ายไปจริง ไม่ใช่งบที่ประมาณไว้"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={createExpense.isPending} disabled={!canSubmit} onClick={submit}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="จ่ายอะไร">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ข้าวเย็นที่ชินจูกุ"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="จำนวน">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="สกุลเงิน">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="JPY">เยน</option>
              <option value="THB">บาท</option>
            </Select>
          </Field>
          <Field label="หมวด">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {(Object.keys(CATEGORIES) as ExpenseCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORIES[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="ใครจ่าย">
          <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
                {member.user_id === meId ? ' (คุณ)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-espresso">หารกันยังไง</p>
          <div className="grid grid-cols-2 gap-2">
            <SplitOption
              active={splitType === 'shared'}
              onClick={() => setSplitType('shared')}
              title="หารกัน"
              description="ค่าอาหาร ค่าที่พัก ค่ารถ"
            />
            <SplitOption
              active={splitType === 'personal'}
              onClick={() => setSplitType('personal')}
              title="จ่ายเอง"
              description="ของฝาก ของส่วนตัว"
            />
          </div>
        </div>

        {splitType === 'shared' ? (
          <div>
            <p className="mb-2 text-sm font-medium text-espresso">
              ใครร่วมหารบ้าง ({participants.length} คน)
            </p>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const selected = participants.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setParticipants((prev) =>
                        selected
                          ? prev.filter((id) => id !== member.user_id)
                          : [...prev, member.user_id],
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm',
                      selected ? 'bg-primary text-primary-fg' : 'bg-espresso/6 text-muted',
                    )}
                  >
                    <Avatar
                      name={member.display_name}
                      avatarUrl={member.avatar_url}
                      characterId={member.character_id}
                      size="sm"
                    />
                    {member.display_name}
                  </button>
                );
              })}
            </div>
            {participants.length > 0 && numericAmount > 0 ? (
              <p className="mt-2 text-xs text-muted">
                หารแล้วคนละ {(numericAmount / participants.length).toFixed(0)} {currency}
              </p>
            ) : null}
          </div>
        ) : null}

        {createExpense.error ? (
          <p className="text-sm text-danger">{(createExpense.error as Error).message}</p>
        ) : null}
      </div>
    </Dialog>
  );
}

function SplitOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-brand p-3 text-left transition-colors',
        active ? 'bg-primary/12 ring-1 ring-primary/30' : 'bg-espresso/4 hover:bg-espresso/8',
      )}
    >
      <span className="block text-sm font-medium text-espresso">{title}</span>
      <span className="block text-xs text-muted">{description}</span>
    </button>
  );
}
