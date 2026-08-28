import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CalendarSearch, Plane } from 'lucide-react';

import {
  CircleAround,
  DottedPath,
  Flower,
  Heart,
  Sparkle,
  SquiggleArrow,
  StarBurst,
  Underline,
  Wave,
} from '@/components/brand/doodle';
import { TiltedTag } from '@/components/brand/tilted-tag';
import { HERO_TOP, PublicShell, SHELL_SECTION } from '@/components/common/public-shell';
import { PlatformStatsSection } from '@/components/public/platform-stats';
import { TravellerReviewsSection } from '@/components/public/traveller-reviews';
import { SectionHeader } from '@/components/common/section';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { DEMO_PUBLIC_PATH } from '@/lib/demo-trip';
import { CHARACTERS } from '@/lib/catalog/characters';

/**
 * Landing page (M1 — W1.1). Three entry cards, each of which must reach a
 * created trip within three screens (X1.1).
 *
 * The page is the two modes in ROVE_BRAND_SPEC §1, in order, and the contrast
 * between them is the design:
 *
 *   Hero     a full-bleed `--brand-canvas` band. Oversized white 700 display
 *            broken by hand, one knockout word, five tilted tags overlapping
 *            the letters, four doodles at wildly different scales. Loud, and
 *            committed to it.
 *   Content  everything below. Cream → white → cream (§7 Sections), ink type
 *            at normal scale, flat untilted tags, one doodle per section in
 *            the margin. Calm, and committed to that.
 *
 * The two never blend. No tilt below the hero, no doodle overlay on a content
 * screen, and no saturated full-width band after the hero — §7 lets colour
 * return full-bleed only for a mid-page CTA or the footer, and this page uses
 * neither.
 */

/**
 * Colour follows §2.4's lock rather than the order the cards happen to be in:
 * a known flight is a booking (blue), known dates are the trip itself
 * (yellow), and not knowing yet is a thing you sort out with other people
 * (pink).
 */
const ENTRIES = [
  {
    key: 'route',
    icon: Plane,
    title: 'รู้เที่ยวบินแล้ว',
    hint: 'ใส่สนามบินกับวันบิน — BKK→NRT 4 ธ.ค. ถึง 08:05 — ที่เหลือ ROVE จัดให้',
    chip: 'bg-canvas text-white',
  },
  {
    key: 'date',
    icon: CalendarDays,
    title: 'รู้วันแล้ว',
    hint: 'ลาไว้แล้ว เหลือแค่ไม่รู้จะไปไหน',
    chip: 'bg-yellow text-yellow-deep',
  },
  {
    key: 'coordinate',
    icon: CalendarSearch,
    title: 'ยังไม่รู้วัน',
    hint: 'ให้ทุกคนแตะวันว่าง แล้วหาช่วงที่ตรงกันก่อน',
    chip: 'bg-pink text-pink-deep',
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
    title: 'Coverage board',
    text: 'บอกตรงๆ ว่าของใครยังไม่ได้เข้าแพลน จะได้ไม่มีใครน้อยใจทีหลัง',
    chip: 'bg-pink text-pink-deep',
  },
  {
    emoji: '🤖',
    title: 'AI ที่บอกเหตุผล',
    text: 'ร่างฟรี 2 ครั้งต่อทริป บอกด้วยว่าทำไมถึงจัดแบบนี้ และถามกลับเมื่อไม่แน่ใจ',
    chip: 'bg-canvas text-white',
  },
  {
    emoji: '🧾',
    title: 'น้องหาร',
    text: 'แยกของกลางกับของส่วนตัว บอกเลยว่าใครจ่ายไปเท่าไหร่ ใครต้องคืนใครกี่บาท',
    chip: 'bg-green text-green-deep',
  },
  {
    emoji: '🐨',
    title: 'ตัวละครประจำตัว',
    text: 'เลือกได้ 20 ตัว ใช้แทนรูปโปรไฟล์ทั้งแอป เห็นปุ๊บรู้ปั๊บว่าใครเป็นใคร',
    chip: 'bg-pink text-pink-deep',
  },
  {
    emoji: '⭐',
    title: 'ชวนเพื่อนแล้วได้แต้ม',
    text: 'แต้มจากการชวนเพื่อนและจากทริปที่เปิดสาธารณะ เอามาแลกเป็นการร่างของ AI ได้',
    chip: 'bg-yellow text-yellow-deep',
  },
  {
    emoji: '📊',
    title: 'สรุปทั้งปีของตัวเอง',
    text: 'ปีนี้ไปมากี่ทริป กี่วัน กี่ประเทศ ใช้เงินไปเท่าไหร่ — รวมมาให้ในที่เดียว',
    chip: 'bg-yellow text-yellow-deep',
  },
] as const;

/**
 * The hero's tilted tags (§4).
 *
 * Five, which is inside §4.2.1's four-to-six. The colour mix is §4.2.5 — two
 * accents plus one ink anchor — and the two accents are chosen so the §2.4
 * lock still holds: everything about dates and the trip is yellow, everything
 * about other people is pink, and the one "serious" tag is ink.
 *
 * Every angle is different and none is 0 (§4.2.2).
 *
 * `at` is a percentage inside the headline box, not the hero, so the numbers
 * below mean something: the three headline lines occupy roughly 0–33%, 33–66%
 * and 66–100%, and each tag is parked at a line's ragged right end or just
 * past its left edge. That is §4.2.4 — clip the edge of a letter, never the
 * middle of a word.
 *
 * Two zones are off limits. The knockout runs from about 27% to 70% across
 * line three and §4.2.7 says nothing may cover it, so the tags on that line
 * sit outside 72% or inside 25%. And the body paragraph below the headline is
 * body copy: §9 allows an overlay on display type only, so no tag reaches it.
 *
 * Anchored to whichever edge the tag is nearest — `right-[4%]` rather than
 * `left-[52%]` — because a left percentage that clips a letter at 1440px
 * lands in the middle of the word at 390px, where the same headline is a
 * third of the width. §10's mobile rule is that a tag never covers more than
 * one letter, and edge anchoring is what holds it at both ends.
 *
 * The two marked `wide` drop below `lg`, where even three tags is enough
 * overlay for a 390px headline.
 */
const HERO_TAGS = [
  { label: 'หาวันว่าง', tone: 'yellow', rotate: -9, at: '-top-[8%] right-[4%]', wide: false },
  { label: 'AI ร่างให้', tone: 'ink', rotate: -4, at: 'top-[8%] -right-[16%]', wide: true },
  { label: 'ชวนเพื่อน', tone: 'pink', rotate: 7, at: 'top-[46%] left-[58%]', wide: false },
  { label: 'แพลนรายวัน', tone: 'yellow', rotate: 11, at: 'top-[74%] -right-[12%]', wide: true },
  // Clipping line two's left edge, not line three's: on a phone the knockout
  // takes most of line three, and a tag there covered "จบ" whole.
  { label: 'คุยกันในแพลน', tone: 'pink', rotate: -12, at: 'top-[34%] -left-[9%]', wide: false },
] as const;

/** Destinations are not a fixed list — these are just what the demo shows. */
const DESTINATIONS: { label: string; tone: 'yellow' | 'blue' | 'green' | 'pink' }[] = [
  { label: 'โตเกียว', tone: 'yellow' },
  { label: 'โซล', tone: 'blue' },
  { label: 'ไทเป', tone: 'green' },
  { label: 'ดานัง', tone: 'pink' },
  { label: 'บาหลี', tone: 'yellow' },
  { label: 'ลิสบอน', tone: 'green' },
  { label: 'เรคยาวิก', tone: 'blue' },
  { label: 'เมลเบิร์น', tone: 'pink' },
  { label: 'เม็กซิโกซิตี', tone: 'yellow' },
  { label: 'มาร์ราเกช', tone: 'green' },
];

export default function LandingPage() {
  return (
    <PublicShell
      width="wide"
      bleed
      // §7 Nav — the header floats on the hero canvas rather than sitting in a
      // cream strip above it, which is what lets the colour run full-bleed to
      // the top of the viewport.
      chrome="canvas"
      actions={
        <>
          <Link
            href="/explore"
            className="font-display hidden px-3 text-sm font-medium text-white/80 transition hover:text-white sm:inline"
          >
            สำรวจแพลน
          </Link>
          <Link
            href="/login"
            className="font-display px-3 text-sm font-medium text-white/80 transition hover:text-white"
          >
            เข้าสู่ระบบ
          </Link>
          {/* §7 Nav: one white pill on the right, over the canvas. */}
          <Link
            href="/new"
            className="font-display text-ink inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium transition hover:bg-white/90"
          >
            เริ่มวางแพลน
          </Link>
        </>
      }
    >
      {/* =========================================================== hero (canvas)
          §6's layer order, bottom to top: canvas, the large anchor doodle,
          the headline, the knockout word, the small doodles, the tilted tags,
          then the CTA. The headline sitting *between* two doodle layers is
          what makes the marks read as drawn on rather than pasted over, so
          the z-indexes below are the spec, not decoration.

          §2.2: this canvas is `--brand-canvas #2B6BA8` and could only ever be
          that or ink. White type on yellow, pink or green is under 2.6:1. */}
      <section className="bg-canvas relative overflow-hidden">
        {/* Layer 2 — the anchor. §5.1.7 wants one mark far larger than the
            rest, and it hangs off the right edge of the *viewport*, not of
            the content column: sitting fully inside the column it read as a
            floating icon rather than as something drawn across the poster.
            Deliberately no larger — at full height it stopped being an accent
            and became the illustration. */}
        <Flower className="text-pink pointer-events-none absolute top-16 -right-20 z-0 size-52 sm:-right-24 sm:size-[26rem]" />

        <div className={`${SHELL_SECTION} ${HERO_TOP} relative pb-14 sm:pb-20`}>

          <div className="animate-rove-rise relative z-10 max-w-2xl pt-10 sm:pt-16">
            <p className="font-display text-sm font-medium text-white/80">
              ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว
            </p>

            {/* Layers 3 to 6 all measure themselves against this box, so the
                doodles and tags land on the headline rather than near it. */}
            <div className="relative mt-5">
              {/* Layers 3 and 4. Lines are broken by hand into a short stack
                  (§3.1) — each `block` is one line, ragged right, never
                  centred. The knockout lands on the phrase carrying the
                  promise, and takes the period §3.2 offers for the extra
                  beat. Exactly one per hero. */}
              <h1 className="t-hero relative z-10 text-white">
                <span className="block">วางแพลนเที่ยว</span>
                <span className="block">กันทั้งกลุ่ม</span>
                <span className="block">
                  จบใน<span className="knockout">ที่เดียว.</span>
                </span>
              </h1>

              {/* Layer 5 — the small marks, over the display type. §5.3 allows
                  that here and forbids it over body copy, which is why they
                  stop at the headline. These two plus the anchor and the
                  CTA's curl arrow make four: §5.3's ceiling for a hero. */}
              {/* Hidden on a phone, where the anchor flower already occupies
                  this corner and the two marks read as one smudge. §10 lets a
                  doodle scale down or drop on mobile; this one drops. */}
              <StarBurst className="text-green pointer-events-none absolute top-[30%] -right-16 z-20 hidden size-24 sm:block" />
              {/* Left of the knockout, not under it: §4.2.7 keeps that word
                  clean, and a mark clipping its corner reads as a smudge. */}
              <Sparkle className="text-yellow pointer-events-none absolute -bottom-6 left-[6%] z-20 hidden size-12 lg:block" />

              {/* Layer 6 — the tilted tags, above the headline. Absolutely
                  placed rather than laid out in flow: §4.2.3 rules out a
                  shared baseline or even spacing, which is exactly what any
                  layout container would hand them. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
                {HERO_TAGS.map((tag) => (
                  <TiltedTag
                    key={tag.label}
                    tone={tag.tone}
                    rotate={tag.rotate}
                    className={`absolute ${tag.at} ${tag.wide ? 'hidden lg:inline-block' : ''}`}
                  >
                    {tag.label}
                  </TiltedTag>
                ))}
              </div>
            </div>

            <p className="mt-7 max-w-md leading-relaxed text-white/85">
              ทุกคนหย่อนที่อยากไปลงห้องเดียวกัน AI ร่างแพลนรายวันพร้อมงบและเหตุผลให้
              แล้วค่อยแก้ด้วยกัน จบทริปแล้วหารเงินกันในแอปได้เลย
            </p>

            {/* Layer 7 — §7 Hero CTA: white fill, ink text, 16px/32px, and
                near-full-width on a phone. */}
            <div className="relative mt-9 inline-flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Link
                href="/new"
                className="font-display text-ink inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 font-medium transition hover:bg-white/90 active:scale-[0.98] sm:w-auto"
              >
                เริ่มทริปแรก <ArrowRight className="size-4" />
              </Link>
              {/*
                The published example plan, not the demo *room*: /t/:id is
                behind the sign-in wall, and a landing page whose "look around
                first" button asks you to sign in first is not a look around.
                Dynamic route, so typedRoutes needs the cast.
              */}
              <Link
                href={DEMO_PUBLIC_PATH as never}
                className="font-display inline-flex h-14 items-center justify-center rounded-full border-[1.5px] border-white/45 px-8 font-medium text-white transition hover:bg-white/10"
              >
                ดูทริปตัวอย่าง
              </Link>
              {/* §7: the curl arrow points at the CTA from *outside* the pill.
                  Anchored to the row rather than to either button, so it
                  clears both — parked on one it landed across the other's
                  label. */}
              <SquiggleArrow className="pointer-events-none absolute -top-2 -right-24 hidden h-20 w-14 rotate-[80deg] text-white/70 lg:block" />
            </div>

            <div className="mt-8 flex items-center gap-3 text-[13px] text-white/75">
              <span className="flex -space-x-2">
                {['shiba', 'cat', 'capybara', 'penguin'].map((id) => (
                  <CharacterAvatar key={id} characterId={id} size="xs" ring />
                ))}
              </span>
              ทริปกลุ่ม 3–6 คน จะไปมุมไหนของโลกก็วางแพลนจบในที่เดียว
            </div>
          </div>

        </div>
      </section>

      {/* ------------------------------------------- destinations (still cream)
          Pills are where the palette runs at full strength (§5 Tags): small
          enough that four saturated colours in a row cost nothing against the
          §2.3 ratio, which is exactly why the cards below them do not. */}
      <section className={`${SHELL_SECTION} pb-14`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1">ไปได้ทุกที่</span>
          {DESTINATIONS.map((d) => (
            <Badge key={d.label} tone={d.tone} size="md">
              {d.label}
            </Badge>
          ))}
          <Badge tone="outline" size="md">
            และที่อื่นทั่วโลก
          </Badge>
        </div>
      </section>

      {/* --------------------------------------------------------- entry (white) */}
      <section className="bg-surface border-border border-y">
        <div className={`${SHELL_SECTION} py-14`}>
          <SectionHeader label="เริ่มยังไงก็ได้ · ไม่เกิน 3 หน้าจอ" />
          <div className="grid gap-3 sm:grid-cols-3">
            {ENTRIES.map((entry) => (
              <Link key={entry.key} href={`/new?from=${entry.key}`} className="group">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5">
                  {/* The colour lives in the chip, not in the card. Three
                      saturated cards side by side is the adjacency §2.3 rules
                      out; three saturated chips is punctuation. */}
                  <span
                    className={`flex size-10 items-center justify-center rounded-full ${entry.chip}`}
                  >
                    <entry.icon className="size-5" strokeWidth={2} />
                  </span>
                  <p className="t-h3 text-ink mt-4">{entry.title}</p>
                  <p className="text-muted t-small mt-1.5">{entry.hint}</p>
                  <span className="text-ink mt-3 inline-flex items-center gap-1 text-sm font-medium">
                    เริ่มเลย{' '}
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- steps (cream)
          A calm content section (§1): cream ground, ink type, one doodle in
          the margin, nothing tilted. The illustration lives here rather than
          in the hero — §6's hero is canvas, type and marks only, and a
          cream-backed picture would have punched a hole in the full-bleed. */}
      <section className={`${SHELL_SECTION} relative py-14`}>
        <SectionHeader label="ทำงานยังไง" />
        {/* The dotted path is the journey mark (§5.2) — this is the one section
            where it says something the copy does not. */}
        <DottedPath className="pointer-events-none absolute top-8 right-2 hidden h-12 w-24 lg:block" />
        <Image
          src="/brand/hero-landing.webp"
          alt="กลุ่มเพื่อนสะพายเป้เดินทางด้วยกัน มีแลนด์มาร์กจากหลายทวีปอยู่ด้านหลังและเส้นทางจุดไข่ปลาลากผ่านหมุดสถานที่"
          width={1440}
          height={816}
          priority
          className="mb-10 w-full"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.n}>
              <span className="bg-yellow text-yellow-deep font-display flex size-9 items-center justify-center rounded-full text-sm font-medium">
                {step.n}
              </span>
              <p className="text-ink mt-3 font-medium">{step.title}</p>
              <p className="text-muted t-small mt-1">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/*
        --------------------------------------------------- social proof (cream)
        Between the steps and the features, per W24.1: the reader has just been
        told how it works and the next question is "does anyone actually use
        it". Both render nothing at all until the real numbers are worth
        saying — the page is expected to close back up around them, and no
        placeholder is left behind.

        Which is why they stay on cream and carry no band of their own. Given
        one, the cream → white → cream alternation in §7 would depend on
        whether there happened to be reviews that day: with the band present
        the rhythm read correctly, and the moment it collapsed the steps and
        the features became two cream sections meeting. On cream these are a
        continuation of the steps section above them either way, and the
        alternation is carried by sections that always render.
      */}
      <PlatformStatsSection className={`${SHELL_SECTION} pt-14`} />
      <TravellerReviewsSection className={`${SHELL_SECTION} pt-14`} />

      {/* ------------------------------------------------------ features (white) */}
      <section className="bg-surface border-border mt-14 border-y">
        <div className={`${SHELL_SECTION} py-14`}>
        {/* §5.2 puts the underline scribble under a section heading. One mark,
            ink, in a calm content area — no tilt, no overlay. */}
        <div className="relative mb-6 inline-block">
          <SectionHeader label="สิ่งที่แอปวางแพลนอื่นไม่ค่อยมี" className="mb-0" />
          <Underline className="absolute -bottom-2 left-0 h-2 w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <span
                className={`flex size-10 items-center justify-center rounded-full text-lg ${f.chip}`}
              >
                {f.emoji}
              </span>
              <p className="t-h3 text-ink mt-4">{f.title}</p>
              <p className="text-muted t-small mt-1.5">{f.text}</p>
            </Card>
          ))}
        </div>
        </div>
      </section>

      {/* ----------------------------------------------------- character (cream)
          The one full-strength colour block in the content half of the page,
          and pink because §2.4 gives pink to people. */}
      <section>
        <div className={`${SHELL_SECTION} py-14`}>
          {/* §5.2 gives the wave line one job: dividing sections. */}
          <Wave className="text-border pointer-events-none mb-10 block h-4" />
          <Card accent="pink" className="relative overflow-hidden p-6 sm:p-8">
            <Heart className="text-pink-deep/25 pointer-events-none absolute -top-3 -right-3 size-24" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-md">
                <p className="t-h2">
                  เลือกตัวละครของตัวเองได้{' '}
                  <span className="relative inline-block">
                    20 แบบ
                    <CircleAround className="absolute -inset-x-3 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)]" />
                  </span>
                </p>
                <p className="text-pink-mid t-small mt-3">
                  ไม่ต้องอัปรูป ไม่ต้องคิดชื่อเล่น — เลือกตัวที่ใช่ แล้วมันจะตามคุณไปทุกทริป
                  ทั้งในรายชื่อสมาชิก คอมเมนต์ และบิลที่หารกัน
                </p>
                <ButtonLink href="/profile" variant="ink" size="sm" className="mt-5">
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
        </div>
      </section>
    </PublicShell>
  );
}
