import Link from 'next/link';
import Image from 'next/image';
import { Fraunces, Noto_Serif_Thai } from 'next/font/google';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { PublicShell, SHELL_SECTION } from '@/components/common/public-shell';
import { heroNavCtaClass, heroNavLinkClass } from '@/components/brand/hero-canvas';
import { PlatformStatsSection } from '@/components/public/platform-stats';
import { TripMosaicSection } from '@/components/public/trip-mosaic';
import { TravellerReviewsSection } from '@/components/public/traveller-reviews';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { CHARACTERS } from '@/lib/catalog/characters';
import { DEMO_PUBLIC_PATH } from '@/lib/demo-trip';
import { cn } from '@/lib/utils';

/**
 * Landing page B (Feedback #2 — D-17, F5.3): a different page, on purpose.
 *
 * The three brands this product has worn were a cozy terracotta-and-cream
 * (v1), a full-bleed cobalt canvas (v2) and the doodle pastels the rest of
 * the site still wears (v3). B is none of them: an editorial, photographic
 * page — paper-white ground, near-black serif display type, real photographs,
 * one acid-lime accent for underlines, and square corners where the doodle
 * page rounds everything. The direction came out of the ui-ux-pro-max pass
 * ("editorial / bold typography": magazine grid, type as the visual, 0px
 * radius, high contrast); the black primary action is kept from §6, because
 * that rule is about what a button IS, not about which brand it sits in.
 *
 * It reuses the parts that carry facts rather than style — the platform
 * numbers, the published-trip mosaic, the reviews, the twenty flowers — so
 * the two pages make the same claims and differ only in how they make them.
 *
 * Copy is SET 4 of docs/feedback-2-landing-copy.md until the tester picks.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif-latin',
  display: 'swap',
});

const serifThai = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600'],
  variable: '--font-serif-thai',
  display: 'swap',
});

const SERIF = 'var(--font-serif-latin), var(--font-serif-thai), Georgia, serif';

const HEADLINE = ['แพลนดี', 'ไม่ต้องมีคนคอย', 'สรุปให้.'] as const;
const TAGLINE =
  'ที่อยากไป วันว่าง บิลที่ยังไม่หาร — ROVE เก็บให้ในที่เดียวและร่างแพลนรายวันให้ ไม่มีใครต้องเป็นคนรวบรวมอีก ไปคนเดียวก็ได้ ไปกันหลายคนก็ได้';

/** Paper, ink, and one accent. Written as values because the app's Tailwind
 *  palette is the six pastels and this page is deliberately not them. */
const PAPER = 'bg-[#F4F1EA]';
const INK = 'text-[#0A0A0A]';
const MUTED = 'text-[#5F5B54]';
const RULE = 'border-[#0A0A0A]';
const LIME = '#D7F94A';

const ENTRIES = [
  { n: '01', title: 'รู้แค่วัน', text: 'ลาไว้แล้ว ยังไม่รู้จะไปไหน — ใส่วันแล้ว ROVE แนะนำปลายทางที่เหมาะกับจำนวนวันนั้น', href: '/new?from=date' },
  { n: '02', title: 'มีตั๋วในมือ', text: 'วางข้อความจากอีเมลตั๋ว เที่ยวบิน วัน และประเทศถูกอ่านเข้าทริปให้เอง', href: '/new?from=route' },
  { n: '03', title: 'ยังไม่รู้อะไรเลย', text: 'เปิดห้องก่อน ให้ทุกคนแตะวันที่ว่าง แล้วระบบเด้งช่วงที่ตรงกันมากที่สุดให้', href: '/new?from=coordinate' },
] as const;

const PLAN_POINTS = [
  'ร่างแพลนรายวันจากที่ที่ทุกคนใส่ไว้ พร้อมเวลาเดินทางระหว่างจุด',
  'บอกด้วยว่าทำไมถึงจัดแบบนี้ และของใครยังไม่เข้าแพลน',
  'แก้ต่อได้ทุกรายการ ลากสลับวัน เพิ่มร้านที่เพิ่งเจอ',
] as const;

const MONEY_POINTS = [
  'จดค่าใช้จ่ายจริงระหว่างทริป ตรงจากมือถือ',
  'หารได้ทั้งแบบทุกคนและแบบเฉพาะบางคน',
  'ปิดทริปแล้วรู้ทันทีว่าใครต้องคืนใครกี่บาท',
] as const;

export function LandingB() {
  return (
    <div className={cn(fraunces.variable, serifThai.variable, PAPER, INK, 'min-h-dvh')}>
      <PublicShell
        width="wide"
        bleed
        actions={
          <>
            <Link href="/explore" className={`${heroNavLinkClass} hidden sm:inline`}>
              สำรวจแพลน
            </Link>
            <Link href="/login" className={heroNavLinkClass}>
              เข้าสู่ระบบ
            </Link>
            <Link href="/new" className={heroNavCtaClass}>
              เริ่มวางแผน
            </Link>
          </>
        }
      >
        {/* ============================================================ hero */}
        <section className={`${SHELL_SECTION} pt-10 pb-14 sm:pt-16 sm:pb-20`}>
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:gap-14">
            <div>
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>
                ROVE — วางแพลนทริป
              </p>
              <h1
                style={{ fontFamily: SERIF }}
                className="mt-5 text-[2.75rem] leading-[1.15] font-semibold tracking-tight sm:text-6xl lg:text-7xl"
              >
                {HEADLINE.map((line, index) => (
                  <span key={line} className="block">
                    {index === HEADLINE.length - 1 ? (
                      <span
                        className="bg-no-repeat pb-1"
                        style={{
                          backgroundImage: `linear-gradient(${LIME}, ${LIME})`,
                          backgroundSize: '100% 0.28em',
                          backgroundPosition: '0 88%',
                        }}
                      >
                        {line}
                      </span>
                    ) : (
                      line
                    )}
                  </span>
                ))}
              </h1>
              <p className={cn(MUTED, 'mt-6 max-w-lg text-base leading-relaxed sm:text-lg')}>
                {TAGLINE}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/new"
                  className="bg-[#0A0A0A] inline-flex h-14 items-center justify-center gap-2 px-8 text-base font-medium text-white transition hover:bg-[#0A0A0A]/85"
                >
                  เริ่มทริปแรก <ArrowRight className="size-4" />
                </Link>
                <Link
                  href={DEMO_PUBLIC_PATH as never}
                  className="inline-flex h-14 items-center justify-center gap-1.5 px-2 text-base font-medium underline decoration-2 underline-offset-8 transition hover:decoration-[3px]"
                >
                  ดูทริปตัวอย่าง <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </div>

            <figure className="relative">
              <Image
                src="/brand/landing-b/hero.jpg"
                alt="เพื่อนสามคนนั่งวางแผนทริปด้วยกันที่โต๊ะกาแฟ"
                width={1344}
                height={1024}
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption
                className="bg-[#0A0A0A] absolute -bottom-4 left-4 px-4 py-2.5 text-[12px] leading-tight text-white sm:left-6"
              >
                <span style={{ fontFamily: SERIF }} className="text-base">
                  ญี่ปุ่นใบไม้เปลี่ยนสี
                </span>
                <br />
                4 คน · 8 วัน · แพลน 39 รายการ
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ======================================================== numbers */}
        <div className={`${SHELL_SECTION}`}>
          <PlatformStatsSection className={`border-t-2 ${RULE} pt-10`} />
        </div>

        {/* ========================================================= entries */}
        <section className={`${SHELL_SECTION} border-t-2 ${RULE} mt-14 py-14 sm:py-20`}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div>
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>
                เริ่มจากสิ่งที่มีอยู่แล้ว
              </p>
              <h2 style={{ fontFamily: SERIF }} className="mt-3 text-3xl leading-snug font-semibold sm:text-4xl">
                รู้แค่ไหน ก็เปิดทริปได้แค่นั้น
              </h2>
              <p className={cn(MUTED, 'mt-3 text-sm leading-relaxed')}>
                หน้าแรกของการสร้างทริปถามแค่ว่า &ldquo;ตอนนี้มีอะไรแล้วบ้าง&rdquo; — ติ๊กได้หลายข้อ หรือไม่ติ๊กเลยก็ได้
              </p>
            </div>
            <ol className={`divide-y-2 divide-[#0A0A0A] border-y-2 ${RULE}`}>
              {ENTRIES.map((entry) => (
                <li key={entry.n}>
                  <Link
                    href={entry.href as never}
                    className="group grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-4 py-5 transition hover:bg-[#0A0A0A]/[0.03] sm:grid-cols-[5rem_1fr_auto]"
                  >
                    <span style={{ fontFamily: SERIF }} className="text-2xl italic sm:text-3xl">
                      {entry.n}
                    </span>
                    <span>
                      <span style={{ fontFamily: SERIF }} className="block text-xl font-semibold sm:text-2xl">
                        {entry.title}
                      </span>
                      <span className={cn(MUTED, 'mt-1 block text-sm leading-relaxed')}>{entry.text}</span>
                    </span>
                    <ArrowUpRight className="size-5 self-center transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ========================================================= story 1 */}
        <section className={`${SHELL_SECTION} pb-14 sm:pb-20`}>
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <Image
              src="/brand/landing-b/story-plan.jpg"
              alt="ผู้หญิงคนหนึ่งบนรถไฟมองทุ่งนานอกหน้าต่าง"
              width={1024}
              height={1280}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/5] w-full object-cover"
            />
            <div>
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>แพลนรายวัน</p>
              <h2 style={{ fontFamily: SERIF }} className="mt-3 text-3xl leading-snug font-semibold sm:text-4xl">
                AI ร่างให้ พร้อมงบและเหตุผล — แล้วเป็นของคุณที่จะแก้
              </h2>
              <ul className={`mt-6 divide-y ${RULE} border-y`}>
                {PLAN_POINTS.map((point) => (
                  <li key={point} className="py-3.5 text-base leading-relaxed">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ========================================================= story 2 */}
        <section className={`${SHELL_SECTION} pb-14 sm:pb-20`}>
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className="order-2 lg:order-1">
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>ค่าใช้จ่าย</p>
              <h2 style={{ fontFamily: SERIF }} className="mt-3 text-3xl leading-snug font-semibold sm:text-4xl">
                หารเงินจบในทริป ไม่ต้องทวงใครทีหลัง
              </h2>
              <ul className={`mt-6 divide-y ${RULE} border-y`}>
                {MONEY_POINTS.map((point) => (
                  <li key={point} className="py-3.5 text-base leading-relaxed">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <Image
              src="/brand/landing-b/story-money.jpg"
              alt="เพื่อนสองคนที่ร้านอาหารริมทางตอนกลางคืน"
              width={1024}
              height={1024}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="order-1 aspect-square w-full object-cover lg:order-2"
            />
          </div>
        </section>

        {/* ========================================================== mosaic */}
        <section className={`${SHELL_SECTION} border-t-2 ${RULE} py-14 sm:py-20`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>แพลนสาธารณะ</p>
              <h2 style={{ fontFamily: SERIF }} className="mt-3 text-3xl leading-snug font-semibold sm:text-4xl">
                ทริปที่คนไปมาแล้วจริงๆ
              </h2>
            </div>
            <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-medium underline decoration-2 underline-offset-8">
              สำรวจทั้งหมด <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <TripMosaicSection className="mt-8" />
          <TravellerReviewsSection className="mt-14" limit={3} label="คนที่เที่ยวตามบอกว่า" />
        </section>

        {/* ========================================================= flowers */}
        <section className={`${SHELL_SECTION} border-t-2 ${RULE} py-14 sm:py-20`}>
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <p className={cn(MUTED, 'text-[12px] font-medium tracking-[0.08em] uppercase')}>ตัวละคร</p>
              <h2 style={{ fontFamily: SERIF }} className="mt-3 text-3xl leading-snug font-semibold sm:text-4xl">
                ไม่ต้องอัปรูป — เลือกดอกไม้ประจำตัวหนึ่งใน 20
              </h2>
              <p className={cn(MUTED, 'mt-3 text-sm leading-relaxed')}>
                มันจะตามคุณไปทุกทริป ในรายชื่อสมาชิก ในคอมเมนต์ และในบิลที่หารกัน
              </p>
              <Link
                href="/login"
                className="bg-[#0A0A0A] mt-6 inline-flex h-12 items-center gap-2 px-6 text-sm font-medium text-white transition hover:bg-[#0A0A0A]/85"
              >
                สร้างบัญชี <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {CHARACTERS.map((c) => (
                <CharacterAvatar key={c.id} characterId={c.id} size="md" square className="w-full" />
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ end */}
        <section className="bg-[#0A0A0A] text-white">
          <div className={`${SHELL_SECTION} py-16 sm:py-24`}>
            <h2 style={{ fontFamily: SERIF }} className="text-4xl leading-tight font-semibold sm:text-6xl">
              ทริปหน้า
              <br />
              เริ่มวางได้เลยวันนี้.
            </h2>
            <Link
              href="/new"
              className="mt-8 inline-flex h-14 items-center gap-2 bg-white px-8 text-base font-medium text-[#0A0A0A] transition hover:bg-white/90"
            >
              เริ่มทริปแรก <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </PublicShell>
    </div>
  );
}
