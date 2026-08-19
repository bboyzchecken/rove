import Link from 'next/link';
import { Check, ChevronRight, Share2, Sparkles, UserPlus } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Progress } from '@/components/ui/progress';
import { formatDuration, formatMoney, formatThaiRange } from '@/lib/format';
import { budgetTotals, coverage, MEMBERS, planStats, TRIP } from '@/lib/mock';

/** Trip overview (M2 — W2.2, plus the onboarding checklist from W1.5). */
export const metadata = { title: 'ภาพรวมทริป' };

const CHECKLIST = [
  { label: 'สร้างห้องทริป', done: true },
  { label: 'ชวนเพื่อนเข้าห้อง', done: true, hint: '4 คนแล้ว' },
  { label: 'ทุกคนใส่ที่อยากไป', done: false, hint: 'เหลือจูนคนเดียว' },
  { label: 'ให้ AI ร่างแพลน', done: true, hint: 'ร่างแล้ว 1 เวอร์ชัน' },
];

const ACTIVITY = [
  {
    who: 'มายด์',
    characterId: 'cat',
    text: 'ย้าย teamLab Planets ไปวันที่ 2',
    when: '2 ชม. ที่แล้ว',
  },
  {
    who: 'ปอนด์',
    characterId: 'capybara',
    text: 'เพิ่ม "ทาโกยากิโดทงโบริ" ลงที่อยากไป',
    when: 'เมื่อวาน',
  },
  { who: 'ROVE', characterId: 'shiba', text: 'ร่างแพลน 8 วันเสร็จแล้ว', when: 'เมื่อวาน' },
  { who: 'ตอง', characterId: 'shiba', text: 'ตั้งงบไว้ที่ 45,000 บาท/คน', when: '3 วันที่แล้ว' },
];

export default function TripOverviewPage() {
  const pending = MEMBERS.filter((m) => !m.hasWishlist);
  const doneSteps = CHECKLIST.filter((c) => c.done).length;

  return (
    <div className="space-y-7">
      {/* ---------------------------------------------------- checklist */}
      <Card accent="sun" className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-espresso font-bold">เตรียมห้องทริปให้พร้อม</p>
          <span className="text-muted text-xs font-semibold">
            {doneSteps}/{CHECKLIST.length}
          </span>
        </div>
        <Progress value={doneSteps / CHECKLIST.length} tone="espresso" />
        <ul className="mt-3 space-y-2">
          {CHECKLIST.map((step) => (
            <li key={step.label} className="flex items-center gap-2.5 text-sm">
              <span
                className={
                  step.done
                    ? 'bg-espresso text-bg flex size-5 shrink-0 items-center justify-center rounded-full'
                    : 'border-muted/30 flex size-5 shrink-0 rounded-full border-2 border-dashed'
                }
              >
                {step.done ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={step.done ? 'text-muted line-through' : 'text-espresso font-medium'}>
                {step.label}
              </span>
              {step.hint ? (
                <span className="text-muted ml-auto text-[11px]">{step.hint}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------- frame */}
      <section>
        <SectionHeader
          label="กรอบทริป"
          action={<button className="text-primary text-xs font-semibold">แก้ไข</button>}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Card accent="sky" className="p-4">
            <Stat
              value={`${TRIP.nights + 1} วัน`}
              label={formatThaiRange(TRIP.startDate, TRIP.endDate)}
            />
          </Card>
          <Card accent="joyfull" className="p-4">
            <Stat value={`${TRIP.partySize} คน`} label="เดินทางด้วยกัน" />
          </Card>
          <Card accent="matcha" className="p-4">
            <Stat value={TRIP.cities.length} label="เมือง" hint={TRIP.cities.join(' · ')} />
          </Card>
          <Card accent="sun" className="p-4">
            <Stat
              value={formatMoney(TRIP.budgetPerPersonThb, 'THB')}
              label="งบต่อคนที่ตั้งไว้"
              hint={`1 เยน ≈ ${TRIP.fxRate} บาท`}
            />
          </Card>
        </div>
      </section>

      {/* ----------------------------------------------------- members */}
      <section>
        <SectionHeader
          label="สมาชิก"
          action={
            <button className="text-primary inline-flex items-center gap-1 text-xs font-semibold">
              <UserPlus className="size-3.5" /> ชวนเพิ่ม
            </button>
          }
        />
        <Card className="divide-border divide-y">
          {MEMBERS.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3.5">
              <CharacterAvatar characterId={member.characterId} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-espresso text-sm font-semibold">
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
                <Badge tone="matcha">พร้อม</Badge>
              ) : (
                <Button variant="outline" size="sm">
                  เตือน
                </Button>
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
          <Link href={`/t/${TRIP.id}/wishlist`}>
            <Card accent="matcha" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-espresso font-bold">ที่อยากไปเข้าแพลนแล้ว</p>
                <ChevronRight className="text-muted size-4" />
              </div>
              <p className="font-display text-espresso mt-2 text-3xl font-extrabold">
                {coverage.percent}%
              </p>
              <Progress value={coverage.percent / 100} tone="espresso" className="mt-2" />
              <p className="text-muted mt-2 text-xs">
                ต้องไป {coverage.mustCovered}/{coverage.mustTotal} · ยังไม่เข้าแพลน{' '}
                {coverage.uncovered} อย่าง
              </p>
            </Card>
          </Link>

          <Link href={`/t/${TRIP.id}/budget`}>
            <Card accent="primary" className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-espresso font-bold">งบประมาณการต่อคน</p>
                <ChevronRight className="text-muted size-4" />
              </div>
              <p className="font-display text-espresso mt-2 text-3xl font-extrabold">
                {formatMoney(budgetTotals.perPersonThb, 'THB')}
              </p>
              <Progress value={budgetTotals.budgetUsed} tone="espresso" className="mt-2" />
              <p className="text-muted mt-2 text-xs">
                เหลืออีก {formatMoney(budgetTotals.remainingThb, 'THB')} จากงบที่ตั้งไว้
              </p>
            </Card>
          </Link>
        </div>

        <Card className="mt-3 p-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={planStats.days} label="วันในแพลน" />
            <Stat value={planStats.items} label="รายการ" />
            <Stat value={formatDuration(planStats.travelMinutes)} label="เวลาเดินทางรวม" />
          </div>
        </Card>
      </section>

      {/* --------------------------------------------- quick actions */}
      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href={`/t/${TRIP.id}/plan`} block size="lg">
          <Sparkles className="size-4" /> เปิดแพลน 8 วัน
        </ButtonLink>
        <Button variant="outline" size="lg" block>
          <Share2 className="size-4" /> แชร์ลิงก์ให้เพื่อนดู
        </Button>
      </div>

      {/* -------------------------------------------------- activity */}
      <section>
        <SectionHeader label="ความเคลื่อนไหว" />
        <Card className="divide-border divide-y">
          {ACTIVITY.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <CharacterAvatar characterId={entry.characterId} size="sm" />
              <p className="text-espresso min-w-0 flex-1 text-sm">
                <span className="font-semibold">{entry.who}</span>{' '}
                <span className="text-muted">{entry.text}</span>
              </p>
              <span className="text-muted shrink-0 text-[11px]">{entry.when}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
