'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Share2, Sparkles, UserPlus } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { InviteDialog } from '@/components/trip/invite-dialog';
import { NextTripCard } from '@/components/trip/next-trip-card';
import { RouteCard } from '@/components/trip/route-card';
import { TripChecklist } from '@/components/trip/trip-checklist';
import { TripFrameDialog } from '@/components/trip/trip-frame-dialog';
import { ShareDialog } from '@/components/trip/share-dialog';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Progress } from '@/components/ui/progress';
import { useVariant } from '@/components/uat/variant-provider';
import { useMe } from '@/features/auth/queries';
import { useBudget } from '@/features/plan/queries';
import { useTripOverview } from '@/features/trip/queries';
import type { Member } from '@/lib/data';
import { DEFAULT_CHARACTER_ID } from '@/lib/catalog/characters';
import { thaiRangeLabel, toIsoDate } from '@/lib/data/domain';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Trip overview (M2 — W2.2), reshaped by Feedback #2 (F3.4–F3.6, หน้า 17–19).
 *
 * The checklist is still the spine of the screen, but it is the four-state
 * one now (TripChecklist), and the "ยังไม่มีวันเดินทาง" card that used to
 * repeat its second row is gone — the row is a button that goes there.
 *
 * Under the UAT switcher's variant C the checklist IS the page: no tab strip
 * above, the steps as a vertical list with buttons, and the rest of the
 * overview below it. A and B keep the card.
 *
 * Colour: with §2.5's one-colour rule withdrawn (D-2), the four frame stats
 * are four colours and the two status boxes are two, which is what the tester
 * asked for on both pages ("สวยแล้ว แต่ขอเป็นแยกช่องและสีทุกอัน").
 */
export function TripOverview({ tripId }: { tripId: string }) {
  const { data, isLoading } = useTripOverview(tripId);
  const { data: me } = useMe();
  const { data: budget } = useBudget(tripId);
  const variant = useVariant('trip-tabs');
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

  const { trip, members, coverage, counts, activity, locked } = data;
  const route = trip.route;
  const countries = route?.countries ?? [];
  // A viewer may read the route but not touch it — the same rule the API keeps.
  const canEdit = members.find((m) => m.id === me?.id)?.role !== 'viewer';
  const hasDates = Boolean(trip.startDate && trip.endDate);

  /**
   * A room whose trip is over but which somebody is still working in — see
   * NextTripCard for why an edit after the last day is the signal.
   */
  const ended = hasDates && trip.endDate < toIsoDate(new Date());
  const editedSinceEnd = activity.some((event) => event.createdAt.slice(0, 10) > trip.endDate);

  return (
    <div className="space-y-7 pt-1">
      {/* ------------------------------------------- finished, still edited */}
      {ended && editedSinceEnd ? <NextTripCard tripId={tripId} surface="room" /> : null}

      {/* ---------------------------------------------------- checklist */}
      <TripChecklist
        tripId={tripId}
        overview={data}
        onInvite={() => setInviting(true)}
        asPage={variant === 'c'}
        className={variant === 'c' ? 'pt-3' : undefined}
      />

      {/* ------------------------------------------------------- frame
          Four stats, four colours (F3.5). */}
      <section>
        <SectionHeader
          label="กรอบทริป"
          action={
            canEdit ? (
              <button onClick={() => setEditing(true)} className="text-primary text-xs font-medium">
                แก้ไข
              </button>
            ) : null
          }
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Card accent="countdown" className="p-4">
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
          <Card accent="wishlist" className="p-4">
            <Stat value={`${trip.partySize} คน`} label="เดินทางด้วยกัน" />
          </Card>
          <Card accent="itinerary" className="p-4">
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
          <Card accent="documents" className="p-4">
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

      {/* ----------------------------------------------------- members
          Circles with a status dot (D-20, F3.6): green = free days confirmed
          AND wishes in, yellow = one of the two, grey = neither. Tap for the
          words. "ชวนเพิ่ม" is the last circle in the row. */}
      <section>
        <SectionHeader label={`สมาชิก ${members.length} คน`} />
        <MemberRow members={members} onInvite={() => setInviting(true)} canInvite={canEdit} />
      </section>

      {/* --------------------------------------------------- snapshots
          Two boxes, two colours, and a third for the counts (F3.5). */}
      <section>
        <SectionHeader label="สถานะตอนนี้" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/t/${tripId}/wishlist`}>
            <Card accent="wishlist" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-ink font-medium">ที่อยากไปเข้าแพลนแล้ว</p>
                <ChevronRight className="text-ink/60 size-4" />
              </div>
              <p className="font-display text-ink nums mt-2 text-3xl font-medium">
                {coverage.percent}%
              </p>
              <Progress value={coverage.percent / 100} tone="ink" className="mt-2" />
              <p className="text-ink/70 mt-2 text-xs">
                ต้องไป {coverage.mustCovered}/{coverage.mustTotal} · ยังไม่เข้าแพลน{' '}
                {coverage.uncovered} อย่าง
              </p>
            </Card>
          </Link>

          <Link href={`/t/${tripId}/budget`}>
            <Card accent="documents" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-ink font-medium">งบประมาณการต่อคน</p>
                <ChevronRight className="text-ink/60 size-4" />
              </div>
              <p className="font-display text-ink nums mt-2 text-3xl font-medium">
                {formatMoney(budget?.perPersonThb ?? 0, 'THB')}
              </p>
              <Progress value={budget?.budgetUsed ?? 0} tone="ink" className="mt-2" />
              <p className="text-ink/70 mt-2 text-xs">
                {budget && budget.remainingThb >= 0
                  ? `เหลืออีก ${formatMoney(budget.remainingThb, 'THB')} จากงบที่ตั้งไว้`
                  : `เกินงบที่ตั้งไว้ ${formatMoney(Math.abs(budget?.remainingThb ?? 0), 'THB')}`}
              </p>
            </Card>
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Card accent="itinerary" className="p-3.5">
            <Stat value={counts.planDays} label="วันในแพลน" />
          </Card>
          <Card accent="memo" className="p-3.5">
            <Stat value={counts.planItems} label="รายการ" />
          </Card>
          <Card accent="journal" className="p-3.5">
            <Stat value={counts.wishlistItems} label="ที่อยากไป" />
          </Card>
        </div>
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
                  <CharacterAvatar characterId={who?.characterId ?? DEFAULT_CHARACTER_ID} size="sm" />
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

/* --------------------------------------------------------------- members -- */

type MemberState = 'ready' | 'half' | 'waiting';

function memberState(member: Member): MemberState {
  if (member.hasDates && member.hasWishlist) return 'ready';
  if (member.hasDates || member.hasWishlist) return 'half';
  return 'waiting';
}

const DOT: Record<MemberState, string> = {
  ready: 'bg-green-solid',
  half: 'bg-yellow-solid',
  waiting: 'bg-border',
};

function memberHint(member: Member) {
  const missing: string[] = [];
  if (!member.hasDates) missing.push('ยังไม่ได้ยืนยันวันว่าง');
  if (!member.hasWishlist) missing.push('ยังไม่ได้ใส่ที่อยากไป');
  return missing.length === 0 ? 'ใส่วันว่างและที่อยากไปครบแล้ว' : missing.join(' · ');
}

/**
 * The member row (F3.6): a circle per person with a dot at the corner, the
 * name under it, and the words on tap — "สั้นๆ ไม่ต้องยาวยืด" (14:23).
 */
export function MemberRow({
  members,
  onInvite,
  canInvite,
}: {
  members: Member[];
  onInvite: () => void;
  canInvite: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = members.find((m) => m.id === openId);

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-1">
        {members.map((member) => {
          const state = memberState(member);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setOpenId((current) => (current === member.id ? null : member.id))}
              aria-pressed={openId === member.id}
              aria-label={`${member.name} — ${memberHint(member)}`}
              className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
            >
              <span className="relative">
                <CharacterAvatar
                  characterId={member.characterId}
                  size="lg"
                  className={cn(openId === member.id && 'ring-ink ring-2 ring-offset-2')}
                />
                <span
                  className={cn(
                    'ring-bg absolute right-0.5 bottom-0.5 size-4 rounded-full ring-2',
                    DOT[state],
                  )}
                />
              </span>
              <span className="text-ink w-full truncate text-center text-xs font-medium">
                {member.name}
              </span>
              {member.role === 'owner' ? (
                <span className="text-muted -mt-1 text-[10px]">หัวห้อง</span>
              ) : null}
            </button>
          );
        })}

        {canInvite ? (
          <button
            type="button"
            onClick={onInvite}
            className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="border-muted/40 text-muted hover:border-ink hover:text-ink flex size-16 items-center justify-center rounded-full border-2 border-dashed transition">
              <UserPlus className="size-6" />
            </span>
            <span className="text-muted text-xs font-medium">ชวนเพิ่ม</span>
          </button>
        ) : null}
      </div>

      {open ? (
        <p className="text-muted mt-2 flex items-center gap-2 text-xs" role="status">
          <span className={cn('size-2 rounded-full', DOT[memberState(open)])} />
          <span className="text-ink font-medium">{open.name}</span> {memberHint(open)}
        </p>
      ) : (
        <p className="text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1"><span className="bg-green-solid size-2 rounded-full" /> วันว่าง + ที่อยากไปครบ</span>
          <span className="flex items-center gap-1"><span className="bg-yellow-solid size-2 rounded-full" /> ครบอย่างเดียว</span>
          <span className="flex items-center gap-1"><span className="bg-border size-2 rounded-full" /> ยังไม่ทำ</span>
        </p>
      )}
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
