'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarCheck,
  Eraser,
  Lock,
  PartyPopper,
  Sparkles,
  Unlock,
} from 'lucide-react';

import { DateStepBar, type DateStep } from '@/components/dates/date-step-bar';
import { DestinationPicker } from '@/components/dates/destination-picker';
import { AvailabilityCalendar } from '@/components/dates/availability-calendar';
import { SectionHeader } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { MonthNav } from '@/components/ui/month-grid';
import { useMe } from '@/features/auth/queries';
import {
  useDateBoard,
  useLockDates,
  useSetAvailability,
  useSubmitAvailability,
  useUnlockDates,
} from '@/features/dates/queries';
import type { DateWindow } from '@/lib/data';
import { isWeekend, monthDates, thaiRangeLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * "หาวันที่ตรงกัน" — the step before a trip has dates at all (M2.5), redrawn
 * for Feedback #2 (D-13, F3.7).
 *
 * What a member does here is now one thing: tap the days they are free, then
 * press "ยืนยันวันว่างของฉัน". The board colours every day by how many people
 * said the same, and once everyone has confirmed — or the owner asks — it
 * offers the best one to three windows. The OWNER locks one; everyone else
 * sees the same card with "รอหัวห้องล็อค" on it. Nobody paints a range by
 * hand any more, which is the tab the tester never understood.
 *
 * Every number on this screen is computed from the same marks, so the heat
 * map, the suggestions and the lock card can never disagree.
 */
export function DateBoard({ tripId }: { tripId: string }) {
  const { data: me } = useMe();
  const t = useTranslations('dates');
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data: board, isLoading } = useDateBoard(tripId, month);
  const [askedForWindows, setAskedForWindows] = useState(false);
  const [picked, setPicked] = useState<DateWindow | null>(null);

  const setAvailability = useSetAvailability(tripId);
  const submit = useSubmitAvailability(tripId);
  const lock = useLockDates(tripId);
  const unlock = useUnlockDates(tripId);

  const meId = me?.id ?? board?.members[0]?.id ?? '';

  const myDayCount = useMemo(
    () => board?.entries.filter((e) => e.memberId === meId && e.mark === 'free').length ?? 0,
    [board?.entries, meId],
  );

  if (isLoading || !board) {
    return (
      <div className="space-y-3">
        <div className="rounded-brand bg-surface h-10 animate-pulse" />
        <div className="rounded-brand bg-surface h-96 animate-pulse" />
      </div>
    );
  }

  const locked = board.locked;
  const isOwner = board.members.find((m) => m.id === meId)?.role === 'owner';
  const confirmedMine = board.submittedMemberIds.includes(meId);
  const confirmedCount = board.submittedMemberIds.length;
  const everyoneConfirmed = confirmedCount >= board.members.length && board.members.length > 0;
  const pending = board.members.filter((m) => !board.submittedMemberIds.includes(m.id));
  const step: DateStep = locked ? 5 : confirmedCount > 0 ? 3 : 2;

  const monthIndex = board.months.indexOf(board.month);
  const canPrev = monthIndex > 0;
  const canNext = monthIndex < board.months.length - 1;

  // The windows come out once the group is done, or once the owner asks.
  const showWindows = !locked && (everyoneConfirmed || askedForWindows) && board.windows.length > 0;
  const best = board.windows.slice(0, 3);
  const highlight = picked ?? (showWindows ? best[0] ?? null : null);

  function toggleDay(date: string, free: boolean) {
    setAvailability.mutate({ memberId: meId, dates: [date], mark: free ? 'free' : null });
  }

  /** Marks every Saturday and Sunday of the visible month free in one tap. */
  function fillWeekends() {
    const dates = monthDates(board!.month).filter(isWeekend);
    setAvailability.mutate({ memberId: meId, dates, mark: 'free' });
  }

  function clearMine() {
    setAvailability.mutate({ memberId: meId, dates: monthDates(board!.month), mark: null });
  }

  return (
    <div className="space-y-5">
      <DateStepBar current={step} />

      {/* ------------------------------------------------------ locked ---- */}
      {locked ? (
        <Card accent="ink" className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm opacity-80">
                <PartyPopper className="size-4" /> ได้วันแล้ว
              </p>
              <p className="font-display mt-1 text-xl font-medium tracking-tight">
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
            {isOwner ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-bg/70 hover:bg-bg/10"
                onClick={() => {
                  unlock.mutate();
                  setPicked(null);
                  setAskedForWindows(false);
                }}
                disabled={unlock.isPending}
              >
                <Unlock className="size-4" /> เปลี่ยนวัน
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {locked ? (
        <DestinationPicker tripId={tripId} locked={locked} />
      ) : (
        <>
          {/* --------------------------------------------------- toolbar -- */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink text-sm font-medium">
              แตะวันที่ว่าง แล้วกด &ldquo;ยืนยันวันว่างของฉัน&rdquo;
            </p>
            <MonthNav month={board.month} onChange={(m) => setMonth(m)} canPrev={canPrev} canNext={canNext} />
          </div>

          <AvailabilityCalendar
            board={board}
            meId={meId}
            onToggleDay={toggleDay}
            highlight={highlight ? { start: highlight.startDate, end: highlight.endDate } : null}
          />

          {/* ------------------------------------------------ my tools --- */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fillWeekends}>
              <Sparkles className="size-4" /> ว่างทุกเสาร์-อาทิตย์
            </Button>
            <Button variant="ghost" size="sm" onClick={clearMine}>
              <Eraser className="size-4" /> ล้างเดือนนี้
            </Button>
            <span className="text-muted ml-auto text-xs">
              ใส่ไว้แล้ว <span className="nums font-medium">{myDayCount}</span> วัน
            </span>
          </div>

          {/* The one button a member needs (D-13): confirm. */}
          <Button
            block
            size="lg"
            onClick={() => submit.mutate(meId)}
            disabled={submit.isPending || confirmedMine || myDayCount === 0}
          >
            <CalendarCheck className="size-4" />
            {confirmedMine ? t('confirmed') : myDayCount === 0 ? 'แตะวันที่ว่างก่อน' : t('confirm')}
          </Button>
          {confirmedMine && !everyoneConfirmed ? (
            <p className="text-muted -mt-2 text-center text-[11px]">
              แก้วันได้ตลอด — รออีก {pending.length} คน แล้วระบบจะเด้งช่วงที่ดีที่สุดให้
            </p>
          ) : null}

          {/* --------------------------------------- the best windows ---- */}
          {showWindows ? (
            <Card accent="feature" className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-ink font-medium">
                    {everyoneConfirmed ? 'ทุกคนยืนยันแล้ว — ช่วงที่ลงตัวที่สุด' : 'ช่วงที่ลงตัวที่สุดตอนนี้'}
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    {isOwner
                      ? 'เลือกช่วงแล้วกดล็อค ทริปจะได้วันทันที'
                      : 'หัวห้องเป็นคนล็อค — เลือกดูช่วงที่ชอบไว้ก่อนได้'}
                  </p>
                </div>
                {!everyoneConfirmed ? (
                  <span className="text-muted text-[11px]">ยังรออีก {pending.length} คน</span>
                ) : null}
              </div>

              <ul className="space-y-2">
                {best.map((window, index) => {
                  const active = (picked ?? best[0])?.id === window.id;
                  return (
                    <li key={window.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(window)}
                        aria-pressed={active}
                        className={cn(
                          'w-full rounded-2xl p-3.5 text-left transition',
                          active ? 'bg-bg ring-ink ring-2' : 'bg-bg/60 hover:bg-bg',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-ink text-sm font-medium">
                            {index === 0 ? '★ ' : ''}
                            {thaiRangeLabel(window.startDate, window.endDate)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {window.everyone ? <Badge tone="active">ทุกคนว่าง</Badge> : null}
                            <Badge tone="feature">{window.days} วัน</Badge>
                          </span>
                        </div>
                        <p className="text-muted mt-1 text-xs">{window.reason}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="flex -space-x-1.5">
                            {window.memberIds.map((id) => {
                              const member = board.members.find((m) => m.id === id);
                              return member ? (
                                <CharacterAvatar key={id} characterId={member.characterId} size="xs" ring />
                              ) : null;
                            })}
                          </span>
                          <span className="text-muted text-[11px]">
                            ว่างครบ {window.memberIds.length}/{board.members.length} คน
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {isOwner ? (
                  <Button
                    size="sm"
                    disabled={lock.isPending || !(picked ?? best[0])}
                    onClick={() => {
                      const chosen = picked ?? best[0];
                      if (chosen) lock.mutate({ startDate: chosen.startDate, endDate: chosen.endDate });
                    }}
                  >
                    <Lock className="size-4" /> {lock.isPending ? 'กำลังล็อค…' : t('lock')}
                  </Button>
                ) : (
                  <span className="text-muted inline-flex items-center gap-1.5 text-xs">
                    <Lock className="size-3.5" /> {t('waitOwner')}
                  </span>
                )}
              </div>
            </Card>
          ) : null}

          {!showWindows && isOwner && board.windows.length > 0 ? (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setAskedForWindows(true)}>
                ดูช่วงที่ดีที่สุดตอนนี้เลย
              </Button>
            </div>
          ) : null}

          {/* ----------------------------------------------------- members */}
          <section>
            <SectionHeader
              label={`สมาชิก ${board.members.length} คน`}
              action={
                pending.length > 0 ? (
                  <span className="text-primary text-[11px] font-medium">
                    รออีก {pending.length} คน
                  </span>
                ) : (
                  <span className="text-muted text-[11px]">ยืนยันวันว่างครบแล้ว</span>
                )
              }
            />
            <Card className="divide-border divide-y">
              {board.members.map((member) => {
                const count = board.entries.filter(
                  (e) => e.memberId === member.id && e.mark === 'free',
                ).length;
                const confirmed = board.submittedMemberIds.includes(member.id);

                return (
                  <div key={member.id} className="flex items-center gap-3 p-3">
                    <CharacterAvatar characterId={member.characterId} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink text-sm font-medium">
                        {member.name}
                        {member.id === meId ? (
                          <span className="text-muted font-normal"> (คุณ)</span>
                        ) : null}
                        {member.role === 'owner' ? (
                          <span className="text-muted ml-1.5 text-[11px] font-normal">หัวห้อง</span>
                        ) : null}
                      </p>
                      <p className="text-muted text-[11px]">
                        {confirmed
                          ? `ยืนยันแล้ว · ว่าง ${count} วัน`
                          : count > 0
                            ? `ใส่ไว้ ${count} วัน ยังไม่ยืนยัน`
                            : 'ยังไม่ได้ใส่วันว่าง'}
                      </p>
                    </div>
                    <Badge tone={confirmed ? 'feature' : 'outline'}>
                      {confirmed ? 'ยืนยันแล้ว' : 'รออยู่'}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          </section>

          <Card accent="feature" className="p-4">
            <p className="text-ink text-xs leading-relaxed">
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
