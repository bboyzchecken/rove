import Link from 'next/link';
import { ArrowRight, CalendarDays, CalendarSearch, Plane } from 'lucide-react';

import { DottedPath, Flower, Sparkle, StarBurst } from '@/components/brand/doodle';
import {
  HeroCanvas,
  heroButtonClass,
  heroButtonGhostClass,
  heroNavCtaClass,
  heroNavLinkClass,
} from '@/components/brand/hero-canvas';
import { SectionIntro } from '@/components/brand/section-intro';
import { PublicShell, SHELL_SECTION } from '@/components/common/public-shell';
import { PlatformStatsSection } from '@/components/public/platform-stats';
import { TravellerReviewsSection } from '@/components/public/traveller-reviews';
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
 * The page is the two modes in ROVE_BRAND_SPEC v3 §1, in order, and the
 * contrast between them is still the design — but v3 changes what the loud
 * half is made of:
 *
 *   Hero     the same white page as everything else, carrying oversized BLACK
 *            700 display broken by hand, two tilted pastel tags clipping the
 *            letters on the right, and four doodles at wildly different
 *            scales. Loud because of the drawing and the scale, not because of
 *            a colour field.
 *   Content  everything below. White with §6's gray blocks on it, ink type at
 *            normal scale, flat untilted chips, one doodle per section in the
 *            margin. Calm, and committed to that.
 *
 * v2 got its hero from a full-bleed cobalt band. §2.1 makes white the page on
 * every screen and §2.4 allows white type only on black, so that band is gone
 * — and the page is better for it, because the hero now demonstrates the thing
 * it is selling: a white page with pastel rooms in it.
 *
 * WHERE THE SIX COLOURS APPEAR, AND WHY IT IS NOT A RAINBOW
 * §2.5 forbids mixing feature colours on a screen and then names marketing as
 * an exception. This page uses that licence exactly twice — the three entry
 * cards and the six-card feature grid — and in both the colour is the FEATURE
 * MAP being taught, in the order a visitor will meet it. Everywhere else on
 * the page (the destination chips, the numbered steps, the stat grid) is
 * deliberately uncoloured, because those are not features and a colour that
 * means nothing is what v2's UAT reacted to.
 *
 * The hero carries no knockout slab. §3 offers one, but a black block around
 * "ที่เดียว" cut the promise out of the stack rather than landing it — the line
 * reads harder as one unbroken run of display type, with the hand-made break
 * and the period doing the emphasis instead.
 *
 * The two modes never blend. No tilt below the hero, no doodle overlay on a
 * content screen, and no full-bleed colour band anywhere.
 */

/**
 * The three ways into a trip.
 *
 * Colour follows §2.2's feature map, which under v3 is a stronger claim than
 * v2's thematic lock: each of these cards is a doorway into a specific room, so
 * it wears that room's colour and the visitor has already learned one third of
 * the palette before they sign up. Known dates are the countdown (yellow); a
 * known flight is a fixed point on the route (Itinerary, blue); not knowing yet
 * is the thing the group votes on (Wishlist, pink).
 *
 * THE ORDER IS NOT FREE. The lead sentence above the grid offers the three
 * starting points in words before the cards repeat them in colour, so the two
 * lists have to run in the same order — "รู้แค่วันก็ได้ รู้แค่ตั๋วก็ได้ หรือยังไม่รู้อะไร
 * เลยก็ได้". Feedback #1 caught this list running ticket-first under a lead that
 * says dates-first, which makes a reader re-map one line against the other
 * mid-sentence. Change one and you must change the other.
 *
 * Black text on all three (§2.4) — including the blue, which v2 set in white
 * because its blue was a dark cobalt. This one is a pastel and white on it is
 * 1.22:1.
 */
const ENTRIES = [
  {
    key: 'date',
    icon: CalendarDays,
    title: 'รู้วันแล้ว',
    hint: 'ลาไว้แล้ว เหลือแค่ไม่รู้จะไปไหน',
    chip: 'bg-yellow-light text-ink',
  },
  {
    key: 'route',
    icon: Plane,
    title: 'รู้เที่ยวบินแล้ว',
    hint: 'ใส่สนามบินกับวันบิน — BKK→NRT 4 ธ.ค. ถึง 08:05 — ที่เหลือ ROVE จัดให้',
    chip: 'bg-blue-light text-ink',
  },
  {
    key: 'coordinate',
    icon: CalendarSearch,
    title: 'ยังไม่รู้วัน',
    hint: 'ให้ทุกคนแตะวันว่าง แล้วหาช่วงที่ตรงกันก่อน',
    chip: 'bg-pink-light text-ink',
  },
] as const;

/**
 * The four steps, and the second place on this page where the feature map is
 * taught rather than decorated (§2.5's marketing exception, same licence the
 * entry cards and the feature grid use).
 *
 * The numbers were four identical black discs, which is what Feedback #1
 * reacted to: four of the same mark in a row reads as footnote numbering, not
 * as a route through the product. Each disc now wears the colour of the room
 * that step actually opens, so the sequence teaches four sixths of the palette
 * on the way past.
 *
 * Not a rainbow, and not free choice: pink is the wishlist room people gather
 * in, purple is memo — the things each person drops in, blue is the itinerary
 * that comes back out, orange is Documents & Finance where the trip settles up.
 * Light surfaces with `text-ink` on them, because §2.4 rules out white type on
 * a pastel and these discs are pastel now.
 *
 * The copy is deliberately shorter than it was. Feedback #1 cut "ทุกคนเห็นอัน
 * เดียวกัน" off step 1 and the "ต้องไป / ไปได้ก็ดี / ไม่เอา" enumeration off step
 * 2 — the steps are a route, not the manual, and the detail belongs to the
 * screens themselves. Do not put it back.
 */
const STEPS = [
  { n: '1', title: 'เปิดห้องทริป', text: 'ชวนเพื่อนในลิงก์เดียว', chip: 'bg-pink-light text-ink' },
  {
    n: '2',
    title: 'หย่อนสถานที่ที่อยากไป',
    text: 'ไม่ต้องรอใคร',
    chip: 'bg-purple-light text-ink',
  },
  {
    n: '3',
    title: 'ให้ AI ร่างให้',
    text: 'ผู้ช่วยประจำทริป จัดวัน เช็คสถานที่ และสภาพอากาศ',
    chip: 'bg-blue-light text-ink',
  },
  {
    n: '4',
    title: 'แก้ด้วยกัน เที่ยวด้วยกัน',
    text: 'ปรับสลับทริป เปลี่ยนแผนตามสะดวก หารเงินจบในทริป',
    chip: 'bg-orange-light text-ink',
  },
];

/**
 * The feature grid, and the one screen in the product where all six colours
 * are meant to be seen at once.
 *
 * §2.5 names three exceptions to "one feature colour per screen", and this is
 * the marketing form of the "legend listing all features" one: six cards, six
 * rooms, six colours, in the order a visitor will meet them. v2's version
 * reused pink twice and yellow twice and skipped two features entirely, which
 * is what a decorative palette produces — this one is the map itself.
 */
const FEATURES = [
  {
    emoji: '🧭',
    title: 'Coverage board',
    text: 'บอกตรงๆ ว่าของใครยังไม่ได้เข้าแพลน จะได้ไม่มีใครน้อยใจทีหลัง',
    chip: 'bg-pink-light text-ink',
  },
  {
    emoji: '🤖',
    title: 'AI ที่บอกเหตุผล',
    text: 'ร่างฟรี 2 ครั้งต่อทริป บอกด้วยว่าทำไมถึงจัดแบบนี้ และถามกลับเมื่อไม่แน่ใจ',
    chip: 'bg-blue-light text-ink',
  },
  {
    emoji: '🧾',
    title: 'น้องหาร',
    text: 'แยกของกลางกับของส่วนตัว บอกเลยว่าใครจ่ายไปเท่าไหร่ ใครต้องคืนใครกี่บาท',
    chip: 'bg-orange-light text-ink',
  },
  {
    emoji: '🐨',
    title: 'ตัวละครประจำตัว',
    text: 'เลือกได้ 20 ตัว ใช้แทนรูปโปรไฟล์ทั้งแอป เห็นปุ๊บรู้ปั๊บว่าใครเป็นใคร',
    chip: 'bg-purple-light text-ink',
  },
  {
    emoji: '⭐',
    title: 'ชวนเพื่อนแล้วได้แต้ม',
    text: 'แต้มจากการชวนเพื่อนและจากทริปที่เปิดสาธารณะ เอามาแลกเป็นการร่างของ AI ได้',
    chip: 'bg-yellow-light text-ink',
  },
  {
    emoji: '📊',
    title: 'สรุปทั้งปีของตัวเอง',
    text: 'ปีนี้ไปมากี่ทริป กี่วัน กี่ประเทศ ใช้เงินไปเท่าไหร่ — รวมมาให้ในที่เดียว',
    chip: 'bg-green-light text-ink',
  },
] as const;

/**
 * What the hero's tilted tags say (§4). Where they sit, at what angle, and
 * which drop on a phone is `HeroCanvas`'s business — a page choosing its own
 * coordinates is what put a tag across the knockout the first time.
 *
 * Two tags, both on the right. `HeroCanvas`'s first two slots are the
 * right-anchored ones, so the length of this list is what keeps the left of
 * the headline clear: the Thai lines are long and ragged, and a pill hanging
 * off their left edge landed mid-word rather than on a letter's edge, which
 * is the graze §4.2.4 asks for. `countdown` for the dates tag, because that is
 * the room "หาวันว่าง" opens, and ink for the anchor §4.2.5 asks every cluster
 * to have.
 */
const HERO_TAGS = [
  { label: 'หาวันว่าง', tone: 'countdown' },
  { label: 'AI ร่างให้', tone: 'ink' },
] as const;

/**
 * Destinations are not a fixed list — these are just what the demo shows.
 *
 * They no longer carry a colour each. Under v3 a colour means a feature, and
 * Tokyo is not a feature: cycling four pastels down a row of city names is
 * decoration, which reads as §8's "pastel rainbow on one screen" and teaches
 * the visitor that ROVE's colours mean nothing in particular — the exact habit
 * this rebrand removes. The row is one calm band of chips, and the colour on
 * this page is spent on the hero above it.
 */
const DESTINATIONS = [
  'โตเกียว',
  'โซล',
  'ไทเป',
  'ดานัง',
  'บาหลี',
  'ลิสบอน',
  'เรคยาวิก',
  'เมลเบิร์น',
  'เม็กซิโกซิตี',
  'มาร์ราเกช',
];

export default function LandingPage() {
  return (
    <PublicShell
      width="wide"
      bleed
      // §6 Nav — white, black wordmark, black pill on the right. The header
      // used to float over the hero so the cobalt could run to the top of the
      // viewport; with the hero white there is nothing to float over, and it
      // takes an ordinary row again.
      actions={
        <>
          <Link href="/explore" className={`${heroNavLinkClass} hidden sm:inline`}>
            สำรวจแพลน
          </Link>
          <Link href="/login" className={heroNavLinkClass}>
            เข้าสู่ระบบ
          </Link>
          {/* §7 Nav: one white pill on the right, over the canvas. */}
          <Link href="/new" className={heroNavCtaClass}>
            เริ่มวางแผน
          </Link>
        </>
      }
    >
      {/* =========================================================== hero (canvas)
          Composition, layer order and tag placement all live in `HeroCanvas`
          (§6). This page supplies only what is specific to it: the words, the
          anchor mark, and which two small doodles sit in the gaps. */}
      <HeroCanvas
        eyebrow="ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว"
        /* Lines are broken by hand into a short stack (§3.1) — each `block` is
           one line, ragged right, never centred. The last line carries the
           promise and keeps the period §3.2 offers for the extra beat; the
           weight and the break do that work, without a knockout slab. */
        headline={
          <>
            <span className="block">วางแพลนเที่ยว</span>
            <span className="block">กันทั้งกลุ่ม</span>
            <span className="block">จบในที่เดียว.</span>
          </>
        }
        lead="ทุกคนหย่อนที่อยากไปลงห้องเดียวกัน AI ร่างแพลนรายวันพร้อมงบและเหตุผลให้ แล้วค่อยแก้ด้วยกัน จบทริปแล้วหารเงินกันในแอปได้เลย"
        tags={HERO_TAGS}
        anchor={Flower}
        anchorTone="text-pink-light"
        marks={
          <>
            {/* Dropped on a phone, where the anchor already owns this corner
                and the two marks read as one smudge (§10). */}
            <StarBurst className="text-green-solid pointer-events-none absolute top-[30%] -right-16 z-20 hidden size-24 sm:block" />
            {/* Under the start of the last line, clear of the type — a mark
                clipping a letter's corner reads as a smudge, not a doodle. */}
            <Sparkle className="text-yellow-solid pointer-events-none absolute -bottom-6 left-[6%] z-20 hidden size-12 lg:block" />
          </>
        }
        arrow
        actions={
          <>
            <Link href="/new" className={heroButtonClass}>
              เริ่มทริปแรก <ArrowRight className="size-4" />
            </Link>
            {/*
              The published example plan, not the demo *room*: /t/:id is behind
              the sign-in wall, and a landing page whose "look around first"
              button asks you to sign in first is not a look around. Dynamic
              route, so typedRoutes needs the cast.
            */}
            <Link href={DEMO_PUBLIC_PATH as never} className={heroButtonGhostClass}>
              ดูทริปตัวอย่าง
            </Link>
          </>
        }
      />

      {/* --------------------------------------------------------- entry (white) */}
      <section className="bg-surface border-border border-y">
        <div className={`${SHELL_SECTION} py-16`}>
          <SectionIntro
            title="เริ่มจากสิ่งที่คุณรู้อยู่แล้ว"
            /* The half after the dash used to be "ไม่เกินสามหน้าจอก็มีห้องทริปให้
               เพื่อนเข้ามาแล้ว", which made one sentence carry two claims — where
               you can start, and how fast you get there — and answered the
               second with a group of friends nobody had mentioned yet. The
               section is about the first claim, so it now only makes that one.
               The card order below follows this list; see ENTRIES. */
            lead="รู้แค่วันก็ได้ รู้แค่ตั๋วก็ได้ หรือยังไม่รู้อะไรเลยก็ได้ — เริ่มจากตรงไหนก็เปิดทริปได้"
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
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

      {/* -------------------------------------------------- destinations (cream)
          This was a bare row of pills under an 11px label, sitting between the
          hero and the entry cards with nothing to say what it was — it read as
          a leftover rather than a section. It now carries the heading it
          needed, and the pills sit directly under the sentence that makes them
          evidence rather than a full-width illustration away from it.

          The illustration is gone (Feedback #1). A drawing of landmarks is a
          claim about the world, and the section's own lead says the row below
          is "ตัวอย่างจากทริปที่คนเปิดสาธารณะไว้" — real trips people published.
          Drawn landmarks were standing where that evidence belongs. Phase 3
          puts the evidence itself here: a mosaic of published trips sized by
          how many people looked at them. Until then the section is heading,
          lead and pills, which is short but honest. */}
      <section className={`${SHELL_SECTION} py-16`}>
        <SectionIntro
          title="จะไปมุมไหนของโลก ก็วางแพลนที่นี่ได้"
          lead="ROVE ไม่ได้ผูกกับประเทศไหนเป็นพิเศษ ที่เห็นข้างล่างเป็นแค่ตัวอย่างจากทริปที่คนเปิดสาธารณะไว้"
        />

        {/* Flat and untilted — tilting is a hero-only device. */}
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {DESTINATIONS.map((label) => (
            <Badge key={label} size="md">
              {label}
            </Badge>
          ))}
          <Badge tone="outline" size="md">
            และที่อื่นทั่วโลก
          </Badge>
        </div>
      </section>

      {/* --------------------------------------------------------- steps (white)
          Led by the problem rather than by a label. "ทำงานยังไง" set over a
          full-width illustration gave the picture more of the page than the
          point had, and a reader has to want the answer before four numbered
          steps mean anything to them. */}
      <section className="bg-surface border-border border-y">
        <div className={`${SHELL_SECTION} relative py-16`}>
          <SectionIntro
            title="แชทเลื่อนหาย แต่แพลนไม่ควรหายไปด้วย"
            /* Broken by hand, not left to wrap. The line is a list of three
               problems followed by the answer to all three, and where the
               answer starts is the whole rhetorical turn — letting the column
               width decide moves that turn on every screen size. */
            lead={
              <>
                สถานที่ที่อยากไป วันว่างที่ไม่ตรงกัน บิลที่ยังไม่ได้หาร
                <br />
                ทั้งหมดอยู่ในหน้าเดียว และไม่ต้องมีใครรับหน้าที่สรุป
              </>
            }
            underline
          />
          {/* The dotted path is the journey mark (§5.2) — this is the one
              section where it says something the copy does not. */}
          <DottedPath className="pointer-events-none absolute top-10 right-2 hidden h-12 w-24 lg:block" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span
                  className={`font-display flex size-9 items-center justify-center rounded-full text-sm font-medium ${step.chip}`}
                >
                  {step.n}
                </span>
                <p className="t-h3 text-ink mt-3">{step.title}</p>
                <p className="text-muted t-small mt-1.5">{step.text}</p>
              </div>
            ))}
          </div>

          {/*
            ------------------------------------------------------ social proof
            Between the steps and the features, per W24.1: the reader has just
            been told how it works and the next question is "does anyone
            actually use it". Both render nothing at all until the real numbers
            are worth saying — the page closes back up around them and no
            placeholder is left behind.

            Which is why they share the steps band rather than carrying one of
            their own. Given a band each, the cream → white → cream alternation
            in §7 would depend on whether there happened to be reviews that
            day: with the band present the rhythm read correctly, and the
            moment it collapsed, two cream sections met.
          */}
          <PlatformStatsSection className="pt-16" />
          <TravellerReviewsSection className="pt-16" />
        </div>
      </section>

      {/* ------------------------------------------------------ features (cream) */}
      <section className={`${SHELL_SECTION} py-16`}>
        <SectionIntro
          /* Was "สิ่งที่แอปวางแพลนอื่นไม่ค่อยมี" — a heading that spends its first
             three words on the competition and only reaches ROVE by implication.
             This one leads with what we have and lets the comparison follow. */
          title="สิ่งที่เรามี ไม่เหมือนที่อื่น"
          lead="ส่วนใหญ่ช่วยเก็บรายการที่อยากไป แต่ไม่ได้ช่วยตอนที่ต้องตัดสินใจ และตอนที่ต้องเคลียร์เงินกันทีหลัง"
        />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>

      {/* ----------------------------------------------------- character
          This was the one full-strength colour block in the content half of the
          page — a light-pink card carrying a solid-pink heart at doodle scale.
          Feedback #1 asked for the fill gone and a plain gray-bordered card in
          its place, and it is the right call for a reason beyond taste: the
          block sits last on the page and now ends with the only sign-up CTA
          outside the nav, so the eye should land on the black pill, not on a
          pink field competing with it. §2.3's small-and-loud has nothing to be
          loud against once the surface is white, so the heart goes too. */}
      <section className="border-border border-t bg-white">
        <div className={`${SHELL_SECTION} py-16`}>
          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-md">
                {/* No circle-around on the number. Ringing "20 แบบ" drew a box
                    around it, and a number in a box reads as a cap — the
                    opposite of what the sentence is offering. */}
                <p className="t-h2">เลือกตัวละครของตัวเองได้ 20 แบบ</p>
                {/*
                  "ไม่ต้องคิดชื่อเล่น" was here and it was simply untrue: the
                  profile sheet asks for ชื่อที่แสดง and always has. The line
                  promised the opposite of what the product does, so it is
                  replaced by the invitation to use the field.
                */}
                <p className="text-ink t-small mt-3">
                  ไม่ต้องอัปรูป — ใส่ชื่อที่อยากให้เพื่อนเห็น แล้วเลือกตัวที่ใช่ มันจะตามคุณไปทุกทริป
                  ทั้งในรายชื่อสมาชิก คอมเมนต์ และบิลที่หารกัน
                </p>
                {/*
                  Was "ดูตัวละครทั้งหมด" pointing at /profile, which is behind
                  the sign-in wall — so every reader of this page, none of whom
                  has an account yet, was bounced to /login with a `next` they
                  never asked for. The button now says what that bounce was
                  really asking for.

                  /login and not a /signup route: there is no separate sign-up
                  in ROVE. The API creates the account on the first successful
                  OAuth login, so this one door covers both (see LoginScreen).
                */}
                <ButtonLink href="/login" variant="primary" size="sm" className="mt-5">
                  GO GET ACCOUNT
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
