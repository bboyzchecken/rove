'use client';

import { Sparkles } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { CharacterPicker } from '@/components/profile/character-picker';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useDreams, useMe, usePastTrips, useYearStats } from '@/features/auth/queries';
import { formatMoney } from '@/lib/format';

/** Profile: character (M14), dream list (M15), lifetime stats and points. */
const POINTS_PER_RUN = 300;

export function ProfileScreen() {
  const { data: me } = useMe();
  const { data: stats } = useYearStats();
  const { data: past = [] } = usePastTrips();
  const { data: dreams = [] } = useDreams();

  const lifetimeDays = past.reduce((sum, t) => sum + t.days, 0);

  return (
    <div className="space-y-7 px-4 py-5">
      {/* header -------------------------------------------------------- */}
      <div className="flex items-center gap-4">
        <CharacterAvatar characterId={me?.characterId ?? 'shiba'} size="xl" />
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            {me?.name ?? '—'}
          </h1>
          <p className="text-muted text-sm">
            {me?.handle}
            {me?.email ? ` · ${me.email}` : ''}
          </p>
        </div>
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
              ใช้ร่างแพลนด้วย AI เพิ่ม ({POINTS_PER_RUN} แต้ม/ครั้ง) หรือเป็นส่วนลดตอนจองก็ได้
            </p>
          </div>
          <Sparkles className="text-primary size-8" />
        </div>
      </Card>

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
    </div>
  );
}
