import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin, Ticket } from 'lucide-react';

import { RoveLogo } from '@/components/brand/rove-logo';
import { RoveMark } from '@/components/brand/rove-mark';
import { SectionHeader } from '@/components/common/section';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { CHARACTERS } from '@/lib/mock';

/**
 * Landing page (M1 — W1.1). Three entry cards, each of which must reach a
 * created trip within three screens (X1.1).
 */
const ENTRIES = [
  {
    key: 'date',
    icon: CalendarDays,
    title: 'เริ่มจากวัน',
    hint: 'รู้วันลาแล้ว เหลือแค่ไม่รู้จะไปไหน',
    accent: 'sky',
  },
  {
    key: 'city',
    icon: MapPin,
    title: 'เริ่มจากเมือง',
    hint: 'รู้ปลายทางแล้ว แต่ยังไม่รู้ว่าควรกี่วัน',
    accent: 'matcha',
  },
  {
    key: 'ticket',
    icon: Ticket,
    title: 'วางข้อความตั๋ว',
    hint: 'ตั๋วจองแล้ว วางอีเมลมา เดี๋ยวอ่านให้',
    accent: 'sun',
  },
] as const;

const STEPS = [
  { n: '1', title: 'เปิดห้องทริป', text: 'ชวนเพื่อนเข้ามาด้วยลิงก์เดียว ทุกคนเห็นอันเดียวกัน' },
  { n: '2', title: 'ทุกคนหย่อนที่อยากไป', text: 'ต้องไป / ไปได้ก็ดี / ไม่เอา — ไม่ต้องรอใครสรุป' },
  { n: '3', title: 'ให้ AI ร่างให้', text: 'จัดวันให้ตามโซน เวลาเปิด-ปิด และพยากรณ์อากาศ' },
  { n: '4', title: 'แก้ด้วยกัน แล้วไปเที่ยว', text: 'ลากสลับได้ คุยกันในแพลน หารเงินกันจบในแอป' },
];

const FEATURES = [
  {
    emoji: '🧭',
    title: 'Coverage Board',
    text: 'บอกตรงๆ ว่าของใครยังไม่ได้เข้าแพลน จะได้ไม่มีใครน้อยใจทีหลัง',
    accent: 'matcha',
  },
  {
    emoji: '🤖',
    title: 'AI ที่บอกเหตุผล',
    text: 'ไม่ใช่แค่ร่างมาให้ แต่บอกว่าทำไมถึงจัดแบบนี้ และถามกลับเมื่อไม่แน่ใจ',
    accent: 'sky',
  },
  {
    emoji: '🧾',
    title: 'หารเงินให้จบในทริป',
    text: 'แยกของกลางกับของส่วนตัว รู้เลยว่าใครจ่ายไปเท่าไหร่ ใครต้องคืนใคร',
    accent: 'sun',
  },
  {
    emoji: '🐨',
    title: 'ตัวละครประจำตัว',
    text: 'เลือกได้ 20 ตัว ใช้แทนรูปโปรไฟล์ทั้งแอป เห็นปุ๊บรู้ปั๊บว่าใครเป็นใคร',
    accent: 'joyfull',
  },
  {
    emoji: '⭐',
    title: 'ที่อยากไปในอนาคต',
    text: 'เก็บลิงก์ที่เลื่อนเจอไว้ก่อน พอถึงเวลาก็กดเริ่มแพลนจากอันนั้นได้เลย',
    accent: 'primary',
  },
  {
    emoji: '📊',
    title: 'สรุปทั้งปีของตัวเอง',
    text: 'ปีนี้ไปมากี่ทริป กี่วัน กี่ประเทศ ใช้เงินไปเท่าไหร่ — รวมมาให้ในที่เดียว',
    accent: 'matcha',
  },
] as const;

/** Destinations are not a fixed list — these are just what the demo shows. */
const DESTINATIONS: { label: string; accent: 'primary' | 'matcha' | 'sky' | 'sun' | 'joyfull' }[] = [
  { label: 'โตเกียว', accent: 'primary' },
  { label: 'โซล', accent: 'sky' },
  { label: 'ไทเป', accent: 'matcha' },
  { label: 'ดานัง', accent: 'sun' },
  { label: 'บาหลี', accent: 'joyfull' },
  { label: 'ลิสบอน', accent: 'matcha' },
  { label: 'เรคยาวิก', accent: 'sky' },
  { label: 'เมลเบิร์น', accent: 'sun' },
  { label: 'เม็กซิโกซิตี', accent: 'primary' },
  { label: 'มาร์ราเกช', accent: 'joyfull' },
];

export default function LandingPage() {
  return (
    <div>
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <RoveLogo size="sm" />
        <div className="flex items-center gap-2">
          <ButtonLink href="/home" variant="ghost" size="sm">
            เข้าสู่ระบบ
          </ButtonLink>
          <ButtonLink href="/new" size="sm">
            เริ่มวางแพลน
          </ButtonLink>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-8 px-5 pt-6 pb-12 md:grid-cols-2 md:pt-12">
        <div className="animate-rove-rise">
          <p className="text-primary font-display flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <RoveMark className="size-3.5" />
            ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว
          </p>
          <h1 className="font-display text-espresso mt-3 text-3xl leading-[1.2] font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            วางแพลนเที่ยวกันทั้งกลุ่ม โดยไม่ต้องแย่งกันคุมแชท
          </h1>
          <p className="text-muted mt-4 max-w-md leading-relaxed">
            ทุกคนหย่อนที่อยากไปลงห้องเดียวกัน AI ร่างแพลนรายวันพร้อมงบและเหตุผลให้
            แล้วค่อยแก้ด้วยกัน จบทริปแล้วหารเงินกันในแอปได้เลย
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink href="/new" size="lg">
              เริ่มทริปแรก <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/t/demo" variant="outline" size="lg">
              ดูทริปตัวอย่าง
            </ButtonLink>
          </div>

          <div className="text-muted mt-6 flex items-center gap-3 text-xs">
            <span className="flex -space-x-2">
              {['shiba', 'cat', 'capybara', 'penguin'].map((id) => (
                <CharacterAvatar key={id} characterId={id} size="xs" ring />
              ))}
            </span>
            ทริปกลุ่ม 3–6 คน จะไปมุมไหนของโลกก็วางแพลนจบในที่เดียว
          </div>
        </div>

        <div className="animate-rove-rise">
          <Image
            src="/brand/hero-landing.webp"
            alt="กลุ่มเพื่อนสะพายเป้เดินทางด้วยกัน มีแลนด์มาร์กจากหลายทวีปอยู่ด้านหลังและเส้นทางจุดไข่ปลาลากผ่านหมุดสถานที่"
            width={1440}
            height={816}
            priority
            className="w-full"
          />
        </div>
      </section>

      {/* --------------------------------------------------- destinations */}
      <section className="mx-auto max-w-5xl px-5 pb-12">
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1">ไปได้ทุกที่</span>
          {DESTINATIONS.map((d) => (
            <Badge key={d.label} tone={d.accent} size="md">
              {d.label}
            </Badge>
          ))}
          <Badge tone="outline" size="md">
            และที่อื่นทั่วโลก
          </Badge>
        </div>
      </section>

      {/* ---------------------------------------------------------- entry */}
      <section className="mx-auto max-w-5xl px-5 pb-14">
        <SectionHeader label="เริ่มยังไงก็ได้ · ไม่เกิน 3 หน้าจอ" />
        <div className="grid gap-3 sm:grid-cols-3">
          {ENTRIES.map((entry) => (
            <Link key={entry.key} href={`/new?from=${entry.key}`} className="group">
              <Card
                accent={entry.accent}
                className="h-full p-5 transition group-hover:-translate-y-0.5"
              >
                <entry.icon className="text-espresso size-6" strokeWidth={2.2} />
                <p className="font-display text-espresso mt-3 text-lg font-bold">{entry.title}</p>
                <p className="text-muted mt-1 text-sm leading-relaxed">{entry.hint}</p>
                <span className="text-espresso mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                  เริ่มเลย{' '}
                  <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- steps */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <SectionHeader label="ทำงานยังไง" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span className="bg-primary/12 text-primary font-display flex size-9 items-center justify-center rounded-full text-sm font-extrabold">
                  {step.n}
                </span>
                <p className="font-display text-espresso mt-3 font-bold">{step.title}</p>
                <p className="text-muted mt-1 text-sm leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <SectionHeader label="สิ่งที่แอปวางแพลนอื่นไม่ค่อยมี" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} accent={f.accent} className="p-5">
              <span className="text-2xl">{f.emoji}</span>
              <p className="font-display text-espresso mt-2 font-bold">{f.title}</p>
              <p className="text-muted mt-1 text-sm leading-relaxed">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- character */}
      <section className="mx-auto max-w-5xl px-5 pb-14">
        <Card accent="joyfull" className="overflow-hidden p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-md">
              <p className="font-display text-espresso text-2xl font-extrabold tracking-tight">
                เลือกตัวละครของตัวเองได้ 20 แบบ
              </p>
              <p className="text-muted mt-2 text-sm leading-relaxed">
                ไม่ต้องอัปรูป ไม่ต้องคิดชื่อเล่น — เลือกตัวที่ใช่ แล้วมันจะตามคุณไปทุกทริป
                ทั้งในรายชื่อสมาชิก คอมเมนต์ และบิลที่หารกัน
              </p>
              <ButtonLink href="/profile" variant="espresso" size="sm" className="mt-4">
                ดูตัวละครทั้งหมด
              </ButtonLink>
            </div>
            <div className="flex max-w-xs flex-wrap gap-1.5">
              {CHARACTERS.slice(0, 12).map((c) => (
                <CharacterAvatar key={c.id} characterId={c.id} size="md" />
              ))}
            </div>
          </div>
        </Card>
      </section>

      <footer className="border-border border-t">
        <div className="text-muted mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs">
          <RoveLogo size="sm" tone="mono" />
          <p>ต้นแบบสำหรับนำเสนอ · ข้อมูลในหน้าจอเป็นตัวอย่าง</p>
        </div>
      </footer>
    </div>
  );
}
