import { Sparkles } from 'lucide-react';

import { CharacterPicker } from '@/components/profile/character-picker';
import { DreamList } from '@/components/profile/dream-list';
import { SectionHeader, Stat } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { formatMoney } from '@/lib/format';
import { CURRENT_USER, DREAMS, PAST_TRIPS, YEAR_STATS } from '@/lib/mock';

/** Profile: character (M14), dream list (M15), lifetime stats and points. */
export const metadata = { title: 'โปรไฟล์' };

const POINTS_LOG = [
  {
    text: 'มีคนจองที่พักจากทริป "โซลกับเพื่อนสนิท" ที่เปิดสาธารณะไว้',
    points: 480,
    when: 'ก.ค. 2569',
  },
  { text: 'มีคนก็อปทริป "ปายหนีร้อน" ไปใช้แล้วจองกิจกรรม', points: 260, when: 'ก.ค. 2569' },
  { text: 'เปิดทริป "ดานัง–ฮอยอัน" เป็นสาธารณะครั้งแรก', points: 500, when: 'พ.ค. 2569' },
];

export default function ProfilePage() {
  const lifetimeDays = PAST_TRIPS.reduce((sum, t) => sum + t.days, 0);

  return (
    <div className="space-y-7 px-4 py-5">
      {/* header -------------------------------------------------------- */}
      <div className="flex items-center gap-4">
        <CharacterAvatar characterId={CURRENT_USER.characterId} size="xl" />
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            {CURRENT_USER.name}
          </h1>
          <p className="text-muted text-sm">
            {CURRENT_USER.handle} · เริ่มใช้ ROVE ปี {CURRENT_USER.memberSince}
          </p>
        </div>
      </div>

      {/* points -------------------------------------------------------- */}
      <Card accent="sun" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label">แต้ม ROVE</p>
            <p className="font-display text-espresso mt-1 text-3xl font-extrabold">
              {CURRENT_USER.points.toLocaleString('th-TH')}
            </p>
            <p className="text-muted mt-1 text-xs">ใช้เป็นส่วนลดตอนจองในทริปของตัวเองได้</p>
          </div>
          <Sparkles className="text-primary size-8" />
        </div>

        <ul className="divide-border mt-4 divide-y">
          {POINTS_LOG.map((entry, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <p className="text-espresso min-w-0 flex-1 text-xs leading-relaxed">{entry.text}</p>
              <span className="text-espresso shrink-0 nums text-xs font-bold">
                +{entry.points}
              </span>
              <span className="text-muted w-16 shrink-0 text-right text-[10px]">{entry.when}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* stats --------------------------------------------------------- */}
      <section>
        <SectionHeader label="สถิติของฉัน" />
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat value={YEAR_STATS.trips} label={`ทริปในปี ${YEAR_STATS.year}`} />
            <Stat value={lifetimeDays} label="วันที่ออกเดินทาง" />
            <Stat value={YEAR_STATS.countries} label="ประเทศ" />
            <Stat value={formatMoney(YEAR_STATS.spentThb, 'THB')} label="ใช้ไปทั้งปี" />
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
        <SectionHeader label={`ที่อยากไปสักวัน · ${DREAMS.length} อย่าง`} />
        <DreamList />
      </section>
    </div>
  );
}
