'use client';

import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Lock,
  PartyPopper,
  Send,
  Sparkles,
  Unlock,
} from 'lucide-react';

import { DateStepBar, type DateStep } from '@/components/dates/date-step-bar';
import { DestinationPicker } from '@/components/dates/destination-picker';
import { AvailabilityCalendar, type DaySelection } from '@/components/dates/availability-calendar';
import { SectionHeader } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import {
  useDateBoard,
  useLockDates,
  useSetAvailability,
  useSubmitAvailability,
  useUnlockDates,
} from '@/features/dates/queries';
import type { AvailabilityMark, DateWindow } from '@/lib/data';
import {
  isWeekend,
  membersFreeInRange,
  monthDates,
  thaiMonthLabel,
  thaiRangeLabel,
} from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * "หาวันที่ตรงกัน" — the step before a trip has dates at all (M2.5).
 *
 * Everyone paints the days they are free; the board turns the overlap into
 * ranked windows; the owner locks one and the trip finally gets a date frame.
 * Every number on this screen is computed from the same marks, so there is no
 * way for the heat map, the suggestions and the lock bar to disagree.
 */
export function DateBoard({ tripId }: { tripId: string }) {
  const { data: me } = useMe();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data: board, isLoading } = useDateBoard(tripId, month);

  const [mode, setMode] = useState<'mine' | 'range'>('mine');
  const [selection, setSelection] = useState<DaySelection | null>(null);

  const setAvailability = useSetAvailability(tripId);
  const submit = useSubmitAvailability(tripId);
  const lock = useLockDates(tripId);
  const unlock = useUnlockDates(tripId);

  const meId = me?.id ?? board?.members[0]?.id ?? '';

  const myDayCount = useMemo(
    () => board?.entries.filter((e) => e.memberId === meId && e.mark === 'free').length ?? 0,
    [board?.entries, meId],
  );

  const range = useMemo(() => {
    if (!selection) return null;
    const end = selection.end ?? selection.start;
    return selection.start <= end
      ? { start: selection.start, end }
      : { start: end, end: selection.start };
  }, [selection]);

  const rangeMembers = useMemo(() => {
    if (!board || !range) return null;
    return membersFreeInRange(board.entries, board.members, range.start, range.end);
  }, [board, range]);

  if (isLoading || !board) {
    return (
      <div className="space-y-3">
        <div className="rounded-brand bg-surface h-10 animate-pulse" />
        <div className="rounded-brand bg-surface h-96 animate-pulse" />
      </div>
    );
  }

  const locked = board.locked;
  const step: DateStep = locked ? 5 : board.submittedMemberIds.length > 0 ? 3 : 2;
  const monthIndex = board.months.indexOf(board.month);
  const pending = board.members.filter((m) => !board.submittedMemberIds.includes(m.id));

  function pickWindow(window: DateWindow) {
    setMode('range');
    setSelection({ start: window.startDate, end: window.endDate });
  }

  function handleRangeDay(date: string) {
    setSelection((current) =>
      !current || current.end ? { start: date, end: null } : { ...current, end: date },
    );
  }

  /** Marks every Saturday and Sunday of the visible month free in one tap. */
  function fillWeekends() {
    const dates = monthDates(board!.month).filter(isWeekend);
    setAvailability.mutate({ memberId: meId, dates, mark: 'free' });
  }

  function clearMine() {
    setAvailability.mutate({ memberId: meId, dates: monthDates(board!.month), mark: null });
  }

  function cycleDay(date: string, next: AvailabilityMark | null) {
    setAvailability.mutate({ memberId: meId, dates: [date], mark: next });
  }

  return (
    <div className="space-y-5">
      <DateStepBar current={step} />

      {/* ------------------------------------------------------ locked ---- */}
      {locked ? (
        <Card accent="none" className="bg-espresso text-bg p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm opacity-80">
                <PartyPopper className="size-4" /> ได้วันแล้ว
              </p>
              <p className="font-display mt-1 text-xl font-extrabold tracking-tight">
                {thaiRangeLabel(locked.startDate, locked.endDate)} · {locked.days} วัน{' '}
                {locked.days - 1} คืน
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs opacity-70">
                {locked.memberIds.length === board.members.length
                  ? 'ทุกคนว่างตรงกัน'
                  : `ว่างตรงกัน ${locked.memberIds.length}/${board.members.length} คน`}
                <span className="flex -space-x-1.5">
                  {locked.memberIds.map((id) => {
                    const member = board.members.find((m) => m.id === id);
                    return member ? (
                      <CharacterAvatar key={id} characterId={member.characterId} size="xs" />
                    ) : null;
                  })}
                </span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-bg/70 hover:bg-bg/10"
              onClick={() => {
                unlock.mutate();
                setSelection(null);
                setMode('range');
              }}
              disabled={unlock.isPending}
            >
              <Unlock className="size-4" /> เปลี่ยนวัน
            </Button>
          </div>
        </Card>
      ) : null}

      {locked ? (
        <DestinationPicker tripId={tripId} locked={locked} />
      ) : (
        <>
          {/* --------------------------------------------------- toolbar -- */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="bg-surface flex rounded-full p-1">
              {(
                [
                  { key: 'mine', label: 'ใส่วันว่างของฉัน', icon: CalendarCheck },
                  { key: 'range', label: 'เลือกช่วงทริป', icon: CalendarRange },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMode(tab.key)}
                  className={cn(
                    'font-display flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                    mode === tab.key ? 'bg-espresso text-bg' : 'text-muted',
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="เดือนก่อนหน้า"
                disabled={monthIndex <= 0}
                onClick={() => setMonth(board.months[monthIndex - 1])}
                className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="font-display text-espresso min-w-32 text-center text-sm font-bold">
                {thaiMonthLabel(board.month)}
              </span>
              <button
                type="button"
                aria-label="เดือนถัดไป"
                disabled={monthIndex >= board.months.length - 1}
                onClick={() => setMonth(board.months[monthIndex + 1])}
                className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <p className="text-muted text-xs">
            {mode === 'mine'
              ? 'แตะวันเพื่อสลับ ว่าง → ไม่ค่อยสะดวก → ไม่ว่าง · สีเข้ม = คนว่างเยอะ'
              : 'แตะวันแรกแล้วแตะวันสุดท้าย หรือเลือกจาก "ช่วงที่ลงตัวที่สุด" ด้านล่าง'}
          </p>

          <AvailabilityCalendar
            board={board}
            meId={meId}
            mode={mode}
            selection={selection}
            onCycleDay={cycleDay}
            onPickRangeDay={handleRangeDay}
          />

          {/* ------------------------------------------------ mine tools -- */}
          {mode === 'mine' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={fillWeekends}>
                <Sparkles className="size-4" /> ว่างทุกเสาร์-อาทิตย์
              </Button>
              <Button variant="ghost" size="sm" onClick={clearMine}>
                <Eraser className="size-4" /> ล้างเดือนนี้
              </Button>
              <span className="text-muted ml-auto text-xs">
                ใส่ไว้แล้ว <span className="nums font-bold">{myDayCount}</span> วัน
              </span>
              <Button
                size="sm"
                onClick={() => submit.mutate(meId)}
                disabled={submit.isPending || board.submittedMemberIds.includes(meId)}
              >
                <Send className="size-4" />
                {board.submittedMemberIds.includes(meId) ? 'ส่งแล้ว' : 'ส่งวันว่าง'}
              </Button>
            </div>
          ) : null}

          {/* --------------------------------------------- selection bar -- */}
          {mode === 'range' && range && rangeMembers ? (
            <Card
              accent="primary"
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-display text-espresso text-base font-extrabold">
                  {thaiRangeLabel(range.start, range.end)} ·{' '}
                  {Math.round(
                    (new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000,
                  ) + 1}{' '}
                  วัน
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  {rangeMembers.free.length === board.members.length
                    ? 'ทุกคนว่างครบช่วงนี้'
                    : `ว่างครบช่วงนี้ ${rangeMembers.free.length}/${board.members.length} คน`}
                  {rangeMembers.maybe.length > 0
                    ? ` · อีก ${rangeMembers.maybe.length} คนไปได้แต่ไม่สะดวก`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelection(null)}>
                  เคลียร์
                </Button>
                <Button
                  size="sm"
                  onClick={() => lock.mutate({ startDate: range.start, endDate: range.end })}
                  disabled={lock.isPending}
                >
                  <Lock className="size-4" /> {lock.isPending ? 'กำลังล็อค…' : 'ล็อคช่วงนี้'}
                </Button>
              </div>
            </Card>
          ) : null}

          {/* ------------------------------------------------- suggestions */}
          <section>
            <SectionHeader
              label="ช่วงที่ลงตัวที่สุด"
              action={
                <span className="text-muted text-[11px]">
                  {board.windows.length > 0 ? `${board.windows.length} ช่วง` : 'ยังไม่พอคำนวณ'}
                </span>
              }
            />
            {board.windows.length === 0 ? (
              <Card className="p-4">
                <p className="text-muted text-sm">
                  ยังหาช่วงที่ตรงกันไม่ได้ — ต้องมีอย่างน้อย 2 คนที่ใส่วันว่างซ้อนกัน
                </p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {board.windows.map((window) => {
                  const active = range?.start === window.startDate && range?.end === window.endDate;
                  return (
                    <li key={window.id}>
                      <button
                        type="button"
                        onClick={() => pickWindow(window)}
                        className={cn(
                          'rounded-brand w-full p-3.5 text-left transition',
                          active ? 'bg-primary/12 ring-primary ring-2' : 'bg-surface',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-espresso text-sm font-extrabold">
                            {thaiRangeLabel(window.startDate, window.endDate)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {window.everyone ? <Badge tone="solid">ทุกคนว่าง</Badge> : null}
                            <Badge tone="matcha">{window.days} วัน</Badge>
                          </span>
                        </div>
                        <p className="text-muted mt-1 text-xs">{window.reason}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="flex -space-x-1.5">
                            {window.memberIds.map((id) => {
                              const member = board.members.find((m) => m.id === id);
                              return member ? (
                                <CharacterAvatar
                                  key={id}
                                  characterId={member.characterId}
                                  size="xs"
                                  ring
                                />
                              ) : null;
                            })}
                          </span>
                          <span className="bg-border h-1.5 flex-1 overflow-hidden rounded-full">
                            <span
                              className="bg-primary block h-full rounded-full"
                              style={{ width: `${window.score}%` }}
                            />
                          </span>
                          <span className="nums text-muted text-[11px]">{window.score}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ----------------------------------------------------- members */}
          <section>
            <SectionHeader
              label={`สมาชิก ${board.members.length} คน`}
              action={
                pending.length > 0 ? (
                  <span className="text-primary text-[11px] font-semibold">
                    รออีก {pending.length} คน
                  </span>
                ) : (
                  <span className="text-muted text-[11px]">ใส่วันว่างครบแล้ว</span>
                )
              }
            />
            <Card className="divide-border divide-y">
              {board.members.map((member) => {
                const count = board.entries.filter(
                  (e) => e.memberId === member.id && e.mark === 'free',
                ).length;
                const submitted = board.submittedMemberIds.includes(member.id);

                return (
                  <div key={member.id} className="flex items-center gap-3 p-3">
                    <CharacterAvatar characterId={member.characterId} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-espresso text-sm font-semibold">
                        {member.name}
                        {member.id === meId ? (
                          <span className="text-muted font-normal"> (คุณ)</span>
                        ) : null}
                      </p>
                      <p className="text-muted text-[11px]">
                        {submitted ? `ใส่วันว่างแล้ว · ${count} วัน` : 'ยังไม่ได้ใส่วันว่าง'}
                      </p>
                    </div>
                    <Badge tone={submitted ? 'matcha' : 'outline'}>
                      {submitted ? 'พร้อม' : 'รออยู่'}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          </section>

          <Card accent="sun" className="p-4">
            <p className="text-espresso text-xs leading-relaxed">
              <strong>พอล็อควันแล้ว</strong> ระบบจะแนะนำปลายทางที่เหมาะกับจำนวนวัน ฤดูกาล
              และงบของกลุ่ม — แล้วค่อยไปต่อที่ &ldquo;ที่อยากไป&rdquo; เพื่อให้ AI ร่างแพลนได้
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/** Exported for the trip overview card, which shows the next free window. */
export function nextWindowLabel(windows: DateWindow[]) {
  const best = windows[0];
  return best ? thaiRangeLabel(best.startDate, best.endDate) : null;
}
