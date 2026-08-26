'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Pencil, Sparkles } from 'lucide-react';

import { ModeLine } from '@/components/common/mode-banner';
import { AudienceCard } from '@/components/profile/audience-card';
import { CreatorEarningsCard } from '@/components/profile/creator-earnings';
import { PointsRedeemCard } from '@/components/profile/points-redeem';
import { SectionHeader, Stat } from '@/components/common/section';
import { CharacterPicker } from '@/components/profile/character-picker';
import { ProfileEditSheet } from '@/components/profile/profile-edit-sheet';
import { ProfileMenu } from '@/components/profile/profile-menu';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useDreams, useMe, usePastTrips, useYearStats } from '@/features/auth/queries';
import { env } from '@/lib/env';
import { formatMoney } from '@/lib/format';

/** Profile: character (M14), dream list (M15), lifetime stats and points. */
const POINTS_PER_RUN = 300;

export function ProfileScreen() {
  const { data: me } = useMe();
  const { data: stats } = useYearStats();
  const { data: past = [] } = usePastTrips();
  const { data: dreams = [] } = useDreams();
  const [editing, setEditing] = useState(false);

  const lifetimeDays = past.reduce((sum, t) => sum + t.days, 0);

  return (
    <div className="space-y-7 px-4 py-5">
      {/* header -------------------------------------------------------- */}
      <div className="flex items-center gap-4">
        <CharacterAvatar characterId={me?.characterId ?? 'shiba'} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-espresso truncate text-2xl font-extrabold tracking-tight">
            {me?.name ?? '—'}
          </h1>
          <p className="text-muted truncate text-sm">{subtitleOf(me)}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="แก้ไขโปรไฟล์"
          className="text-muted hover:bg-surface flex size-9 shrink-0 items-center justify-center rounded-full transition"
        >
          <Pencil className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* points -------------------------------------------------------- */}
      <Card accent="sun" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label">แต้ม ROVE</p>
            <p className="font-display text-espresso nums mt-1 text-3xl font-extrabold">
              {(me?.points ?? 0).toLocaleString('th-TH')}
            </p>
            <p className="text-muted mt-1 text-xs">
              ใช้ร่างแพลนด้วย AI เพิ่ม ({POINTS_PER_RUN} แต้ม/ครั้ง) หรือแลกเป็นโค้ดส่วนลดก็ได้
            </p>
            <Link
              href="/points"
              className="text-espresso mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              ดูประวัติแต้ม <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <Sparkles className="text-primary size-8" />
        </div>
      </Card>

      {/* redeeming and earning (M22 — A12.10 / A12.11) ------------------ */}
      <PointsRedeemCard />
      <CreatorEarningsCard />

      {/*
        Who followed the plans that earned the points (M23 — W23.2). The
        ledger itself is a page of its own at /points, reached from the menu
        below — it is a record you go looking for, not one you scroll past.
        This card renders nothing until something has been published.
      */}
      <AudienceCard />

      {/* stats --------------------------------------------------------- */}
      <section>
        <SectionHeader label="สถิติของฉัน" />
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat value={stats?.trips ?? 0} label={`ทริปในปี ${stats?.year ?? ''}`} />
            <Stat value={lifetimeDays} label="วันที่ออกเดินทาง" />
            <Stat value={stats?.countries ?? 0} label="ประเทศ" />
            <Stat value={formatMoney(stats?.spentThb ?? 0, 'THB')} label="ใช้ไปทั้งปี" />
          </div>
        </Card>
      </section>

      {/* character ----------------------------------------------------- */}
      <section>
        <SectionHeader label="ตัวละครของฉัน" />
        <CharacterPicker />
      </section>

      {/* dreams -------------------------------------------------------- */}
      <section>
        <SectionHeader label="ที่อยากไปสักวัน" />
        <Card accent="joyfull" className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-display text-espresso font-bold">
              เก็บไว้แล้ว {dreams.length} อย่าง
            </p>
            <p className="text-muted mt-0.5 text-xs">รายการส่วนตัว เพื่อนในทริปไม่เห็น</p>
          </div>
          <ButtonLink href="/dreams" size="sm" variant="espresso">
            เปิดรายการ
          </ButtonLink>
        </Card>
      </section>

      {/* menu ---------------------------------------------------------- */}
      <section>
        <SectionHeader label="บัญชีและการตั้งค่า" />
        <ProfileMenu onEditProfile={() => setEditing(true)} />
      </section>

      {/* footer -------------------------------------------------------- */}
      <footer className="text-muted/70 pb-2 text-center text-[11px]">
        <p className="font-semibold">{env.brandName}</p>
        <ModeLine />
      </footer>

      <ProfileEditSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

/**
 * The handle and the e-mail are both optional — a user who signed in with LINE
 * may have neither. Joining only what exists keeps a stray "·" off the screen.
 */
function subtitleOf(me: { handle?: string; email?: string } | null | undefined) {
  const parts = [me?.handle ? `@${me.handle}` : null, me?.email ?? null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'ยังไม่ได้ตั้งชื่อผู้ใช้';
}
