'use client';

import { useState } from 'react';
import { BarChart3, Check, Lock, Plus, Trash2, X } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Field, Input } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import {
  useAnswerPoll,
  useClosePoll,
  useCreatePoll,
  usePolls,
  useRemovePoll,
} from '@/features/community/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { Member, Poll } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Polls (M9 — A9.3): the decisions that are not a whole plan. Which hotel,
 * which day for the theme park, who rents the car.
 *
 * Deliberately not a chat message with numbers in it: a poll has a tally that
 * everyone reads the same way, and it closes.
 */
export function PollBoard({ tripId }: { tripId: string }) {
  const { data: polls = [] } = usePolls(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: me } = useMe();
  const [composing, setComposing] = useState(false);

  const isOwner = members.find((m) => m.id === me?.id)?.role === 'owner';

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionHeader label={polls.length > 0 ? `โพล ${polls.length} รายการ` : 'โพล'} />
        <Button variant="soft" size="sm" onClick={() => setComposing(true)}>
          <Plus className="size-3.5" />
          ตั้งคำถาม
        </Button>
      </div>

      {polls.length === 0 ? (
        <Card accent="sun" className="p-5 text-center">
          <BarChart3 className="text-espresso mx-auto size-7" strokeWidth={2} />
          <p className="text-espresso mt-2 text-sm font-semibold">ยังไม่มีโพลในทริปนี้</p>
          <p className="text-muted mx-auto mt-1 max-w-xs text-xs leading-relaxed">
            เถียงกันในแชทแล้วไม่จบสักที? ตั้งเป็นโพลให้ทุกคนกดเลือก แล้วค่อยปิดเมื่อได้ข้อสรุป
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              tripId={tripId}
              poll={poll}
              members={members}
              meId={me?.id ?? ''}
              isOwner={isOwner}
            />
          ))}
        </div>
      )}

      {composing ? <PollComposer tripId={tripId} onClose={() => setComposing(false)} /> : null}
    </section>
  );
}

function PollCard({
  tripId,
  poll,
  members,
  meId,
  isOwner,
}: {
  tripId: string;
  poll: Poll;
  members: Member[];
  meId: string;
  isOwner: boolean;
}) {
  const answer = useAnswerPoll(tripId);
  const close = useClosePoll(tripId);
  const remove = useRemovePoll(tripId);

  const mine = poll.createdBy === meId;
  const canManage = mine || isOwner;
  const leader = Math.max(...poll.options.map((o) => o.votes), 0);

  return (
    <Card accent={poll.closed ? 'none' : 'sky'} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-espresso text-sm font-extrabold">{poll.question}</p>
          <p className="text-muted mt-0.5 text-[11px]">
            {poll.closed ? 'ปิดแล้ว · ' : ''}
            ตอบแล้ว {poll.answered}/{members.length} คน
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            {!poll.closed ? (
              <button
                onClick={() => close.mutate(poll.id)}
                disabled={close.isPending}
                aria-label="ปิดโพลนี้"
                className="text-muted hover:text-espresso"
              >
                <Lock className="size-3.5" />
              </button>
            ) : null}
            <button
              onClick={() => remove.mutate(poll.id)}
              disabled={remove.isPending}
              aria-label="ลบโพลนี้"
              className="text-muted hover:text-espresso"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {poll.options.map((option) => {
          const chosen = poll.myAnswer === option.index;
          const share = poll.answered > 0 ? option.votes / poll.answered : 0;
          const winning = option.votes > 0 && option.votes === leader;

          return (
            <button
              key={option.index}
              // Tapping the same option again withdraws the answer, the same
              // gesture as un-voting a variant.
              onClick={() => answer.mutate({ pollId: poll.id, option: chosen ? -1 : option.index })}
              disabled={poll.closed || answer.isPending}
              className={cn(
                'bg-bg/70 w-full rounded-2xl px-3 py-2.5 text-left transition',
                !poll.closed && 'hover:bg-bg',
                poll.closed && 'cursor-default',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border',
                    chosen ? 'bg-espresso border-espresso' : 'border-field-border',
                  )}
                >
                  {chosen ? <Check className="text-bg size-2.5" strokeWidth={4} /> : null}
                </span>

                <span
                  className={cn(
                    'text-espresso min-w-0 flex-1 truncate text-sm',
                    winning && 'font-bold',
                  )}
                >
                  {option.label}
                </span>

                <span className="text-muted nums shrink-0 text-[11px]">{option.votes}</span>

                {option.who.slice(0, 3).map((memberId) => (
                  <CharacterAvatar
                    key={memberId}
                    characterId={members.find((m) => m.id === memberId)?.characterId ?? 'shiba'}
                    size="xs"
                  />
                ))}
              </span>

              <Progress value={share} tone={winning ? 'espresso' : 'primary'} className="mt-1.5" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Asking is a two-field job: the question, and the things to pick between. */
function PollComposer({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const create = useCreatePoll(tripId);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const setOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  };

  const submit = () => {
    setError(null);
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError('ใส่คำถามด้วย');
    if (filled.length < 2) return setError('ใส่ตัวเลือกอย่างน้อย 2 อย่าง');

    create.mutate(
      { question: question.trim(), options: filled },
      {
        onSuccess: onClose,
        onError: (cause) =>
          setError(cause instanceof Error ? cause.message : 'ตั้งโพลไม่สำเร็จ'),
      },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="ตั้งคำถามให้กลุ่มโหวต"
      description="ทุกคนในห้องจะได้รับแจ้งเตือน"
      footer={
        <Button block onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'กำลังตั้ง…' : 'เปิดโพล'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="คำถาม">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="เช่น เอาโรงแรมย่านไหนดี"
          />
        </Field>

        <div>
          <p className="text-muted mb-1.5 text-[11px] font-semibold">ตัวเลือก</p>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={option}
                  onChange={(event) => setOption(index, event.target.value)}
                  placeholder={`ตัวเลือกที่ ${index + 1}`}
                />
                {options.length > 2 ? (
                  <button
                    onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                    aria-label={`เอาตัวเลือกที่ ${index + 1} ออก`}
                    className="text-muted hover:text-espresso shrink-0"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {options.length < 6 ? (
            <button
              onClick={() => setOptions((current) => [...current, ''])}
              className="text-muted hover:text-espresso mt-2 flex items-center gap-1 text-xs font-semibold"
            >
              <Plus className="size-3.5" />
              เพิ่มตัวเลือก
            </button>
          ) : null}
        </div>

        {error ? <p className="text-warning text-xs">{error}</p> : null}
      </div>
    </Sheet>
  );
}
