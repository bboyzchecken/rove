'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarSearch, Check, ChevronRight, Share2, Sparkles, UserPlus } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { InviteDialog } from '@/components/trip/invite-dialog';
import { RouteCard } from '@/components/trip/route-card';
import { TripFrameDialog } from '@/components/trip/trip-frame-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Progress } from '@/components/ui/progress';
import { ShareDialog } from '@/components/trip/share-dialog';
import { useMe } from '@/features/auth/queries';
import { useBudget } from '@/features/plan/queries';
import { useTripOverview } from '@/features/trip/queries';
import { thaiRangeLabel } from '@/lib/data/domain';
import { formatMoney } from '@/lib/format';

/**
 * Trip overview (M2 — W2.2) with the onboarding checklist from W1.5.
 *
 * The checklist is the spine of the screen: a group's first question is always
 * "what do we still have to do", and the answer is different on day one and on
 * the day before the flight.
 */
const STEP_HREF: Record<string, string> = {
  invite: '',
  dates: '/dates',
  wishlist: '/wishlist',
  plan: '/plan',
};

export function TripOverview({ tripId }: { tripId: string }) {
  const { data, isLoading } = useTripOverview(tripId);
  const { data: me } = useMe();
  const { data: budget } = useBudget(tripId);
  const [inviting, setInviting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-3 pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-brand bg-surface h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const { trip, members, coverage, checklist, counts, activity, locked } = data;
  const route = trip.route;
  const countries = route?.countries ?? [];
  // A viewer may read the route but not touch it — the same rule the API keeps.
  const canEdit = members.find((m) => m.id === me?.id)?.role !== 'viewer';
  const doneSteps = checklist.filter((step) => step.done).length;
  const pending = members.filter((m) => !m.hasWishlist);
  const hasDates = Boolean(trip.startDate && trip.endDate);

  return (
    <div className="space-y-7 pt-1">
      {/* ---------------------------------------------------- checklist */}
      <Card accent="yellow" className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-ink font-medium">เตรียมห้องทริปให้พร้อม</p>
          <span className="text-muted nums text-xs font-medium">
            {doneSteps}/{checklist.length}
          </span>
        </div>
        <Progress value={doneSteps / checklist.length} tone="ink" />
        <ul className="mt-3 space-y-2">
          {checklist.map((step) => {
            const href = STEP_HREF[step.key];
            const body = (
              <>
                <span
                  className={
                    step.done
                      ? 'bg-ink text-bg flex size-5 shrink-0 items-center justify-center rounded-full'
                      : 'border-muted/30 flex size-5 shrink-0 rounded-full border-2 border-dashed'
                  }
                >
                  {step.done ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span
                  className={step.done ? 'text-muted line-through' : 'text-ink font-medium'}
                >
                  {step.label}
                </span>
                {step.hint ? (
                  <span className="text-muted ml-auto text-[11px]">{step.hint}</span>
                ) : null}
              </>
            );

            return (
              <li key={step.key} className="flex items-center gap-2.5 text-sm">
                {href && !step.done ? (
                  <Link
                    href={`/t/${tripId}${href}` as never}
                    className="flex w-full items-center gap-2.5"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ------------------------------------------- dates not locked yet */}
      {!hasDates && !locked ? (
        <Card accent="primary" className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-display text-ink font-medium">ยังไม่มีวันเดินทาง</p>
            <p className="text-muted mt-0.5 text-xs">
              ให้ทุกคนแตะวันที่ตัวเองว่าง แล้ว ROVE จะหาช่วงที่ตรงกันให้
            </p>
          </div>
          <ButtonLink href={`/t/${tripId}/dates` as never}>
            <CalendarSearch className="size-4" /> หาวันที่ตรงกัน
          </ButtonLink>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- frame */}
      <section>
        <SectionHeader
          label="กรอบทริป"
          action={
            <button onClick={() => setEditing(true)} className="text-primary text-xs font-medium">
              แก้ไข
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Card accent="blue" className="p-4">
            <Stat
              value={hasDates ? `${trip.nights + 1} วัน` : '—'}
              label={
                hasDates
                  ? thaiRangeLabel(trip.startDate, trip.endDate)
                  : locked
                    ? thaiRangeLabel(locked.startDate, locked.endDate)
                    : 'ยังไม่ได้ล็อควัน'
              }
            />
          </Card>
          <Card accent="pink" className="p-4">
            <Stat value={`${trip.partySize} คน`} label="เดินทางด้วยกัน" />
          </Card>
          <Card accent="green" className="p-4">
            {/* Countries, not cities: on a two-country route that is the number
                that changes how the plan is drafted (M1 — A1.3). */}
            <Stat
              value={countries.length > 0 ? countries.length : trip.cities.length}
              label={countries.length > 0 ? 'ประเทศ' : 'เมือง'}
              hint={
                countries.length > 0
                  ? countries.map((c) => `${c.name} ${c.nights} คืน`).join(' · ')
                  : trip.cities.length > 0
                    ? trip.cities.join(' · ')
                    : 'ยังไม่ได้เลือกปลายทาง'
              }
            />
          </Card>
          <Card accent="yellow" className="p-4">
            <Stat
              value={formatMoney(trip.budgetPerPersonThb, 'THB')}
              label="งบต่อคนที่ตั้งไว้"
              hint={`1 เยน ≈ ${trip.fxRate} บาท`}
            />
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------- route */}
      <RouteCard tripId={tripId} editable={canEdit} />

      {/* ----------------------------------------------------- members */}
      <section>
        <SectionHeader
          label={`สมาชิก ${members.length} คน`}
          action={
            <button
              onClick={() => setInviting(true)}
              className="text-primary inline-flex items-center gap-1 text-xs font-medium"
            >
              <UserPlus className="size-3.5" /> ชวนเพิ่ม
            </button>
          }
        />
        <Card className="divide-border divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3.5">
              <CharacterAvatar characterId={member.characterId} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-medium">
                  {member.name}
                  {member.role === 'owner' ? (
                    <span className="text-muted ml-1.5 text-[11px] font-normal">เจ้าของทริป</span>
                  ) : null}
                </p>
                <p className="text-muted mt-0.5 text-[11px]">
                  {member.hasWishlist ? 'ใส่ที่อยากไปแล้ว' : 'ยังไม่ได้ใส่ที่อยากไป'}
                </p>
              </div>
              {member.hasWishlist ? (
                <Badge tone="green">พร้อม</Badge>
              ) : (
                <Badge tone="outline">รออยู่</Badge>
              )}
            </div>
          ))}
        </Card>

        {pending.length > 0 ? (
          <p className="text-muted mt-2 text-xs">
            รอ{pending.map((m) => m.name).join(', ')}อยู่ — จะร่างแพลนไปก่อนก็ได้ แล้วค่อยปรับทีหลัง
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------- snapshots */}
      <section>
        <SectionHeader label="สถานะตอนนี้" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/t/${tripId}/wishlist`}>
            <Card accent="green" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-ink font-medium">ที่อยากไปเข้าแพลนแล้ว</p>
                <ChevronRight className="text-muted size-4" />
              </div>
              <p className="font-display text-ink nums mt-2 text-3xl font-medium">
                {coverage.percent}%
              </p>
              <Progress value={coverage.percent / 100} tone="ink" className="mt-2" />
              <p className="text-muted mt-2 text-xs">
                ต้องไป {coverage.mustCovered}/{coverage.mustTotal} · ยังไม่เข้าแพลน{' '}
                {coverage.uncovered} อย่าง
              </p>
            </Card>
          </Link>

          <Link href={`/t/${tripId}/budget`}>
            <Card accent="primary" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-ink font-medium">งบประมาณการต่อคน</p>
                <ChevronRight className="text-muted size-4" />
              </div>
              <p className="font-display text-ink nums mt-2 text-3xl font-medium">
                {formatMoney(budget?.perPersonThb ?? 0, 'THB')}
              </p>
              <Progress value={budget?.budgetUsed ?? 0} tone="ink" className="mt-2" />
              <p className="text-muted mt-2 text-xs">
                {budget && budget.remainingThb >= 0
                  ? `เหลืออีก ${formatMoney(budget.remainingThb, 'THB')} จากงบที่ตั้งไว้`
                  : `เกินงบที่ตั้งไว้ ${formatMoney(Math.abs(budget?.remainingThb ?? 0), 'THB')}`}
              </p>
            </Card>
          </Link>
        </div>

        <Card className="mt-3 p-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={counts.planDays} label="วันในแพลน" />
            <Stat value={counts.planItems} label="รายการ" />
            <Stat value={counts.wishlistItems} label="ที่อยากไป" />
          </div>
        </Card>
      </section>

      {/* --------------------------------------------- quick actions */}
      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href={`/t/${tripId}/plan` as never} block size="lg">
          <Sparkles className="size-4" />
          {counts.planDays > 0 ? `เปิดแพลน ${counts.planDays} วัน` : 'ให้ AI ร่างแพลน'}
        </ButtonLink>
        <Button variant="outline" size="lg" block onClick={() => setSharing(true)}>
          <Share2 className="size-4" /> แชร์ลิงก์ให้เพื่อนดู
        </Button>
      </div>

      {/* -------------------------------------------------- activity */}
      <section>
        <SectionHeader label="ความเคลื่อนไหว" />
        {activity.length === 0 ? (
          <Card className="p-4">
            <p className="text-muted text-sm">
              ยังไม่มีความเคลื่อนไหว — เริ่มจากชวนเพื่อนเข้าห้องก่อน
            </p>
          </Card>
        ) : (
          <Card className="divide-border divide-y">
            {activity.map((entry) => {
              const who = members.find((m) => m.id === entry.memberId);
              return (
                <div key={entry.id} className="flex items-center gap-3 p-3.5">
                  <CharacterAvatar characterId={who?.characterId ?? 'shiba'} size="sm" />
                  <p className="text-ink min-w-0 flex-1 text-sm">
                    <span className="font-medium">{who?.name ?? 'ROVE'}</span>{' '}
                    <span className="text-muted">{entry.text}</span>
                  </p>
                  <span className="text-muted shrink-0 text-[11px]">
                    {relative(entry.createdAt)}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <InviteDialog tripId={tripId} open={inviting} onClose={() => setInviting(false)} />
      <ShareDialog tripId={tripId} open={sharing} onClose={() => setSharing(false)} />
      <TripFrameDialog
        tripId={tripId}
        trip={trip}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

/** "2 ชม. ที่แล้ว" — the feed never shows a wall-clock time. */
function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'เมื่อครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'เมื่อวาน' : `${days} วันที่แล้ว`;
}
