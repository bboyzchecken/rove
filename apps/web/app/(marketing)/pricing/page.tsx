import Link from 'next/link';

import { Sparkle, StarBurst } from '@/components/brand/doodle';
import {
  HeroCanvas,
  heroButtonClass,
  heroNavCtaClass,
} from '@/components/brand/hero-canvas';
import { SectionIntro } from '@/components/brand/section-intro';
import { PublicShell, SHELL_SECTION } from '@/components/common/public-shell';
import { PricingTable } from '@/components/public/pricing-table';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TRIP_PASS_PRICE_THB, FREE_DRAFTS_PER_TRIP } from '@/lib/catalog/plans';

export const metadata = {
  title: 'ราคา',
  description:
    'วางแผนทริปกับเพื่อนได้ฟรี · ปลดล็อกทั้งทริป ฿299 และได้คืนเต็มจำนวนเมื่อจองผ่าน ROVE',
};

/**
 * The pricing page (M26 — W26.1).
 *
 * It answers three questions in the order people ask them: can I use this
 * without paying, what happens when I hit the wall, and why should I believe
 * the refund. The last one is why the page exists as prose rather than as
 * three cards alone — a full refund sounds like a catch until you can see how
 * we get paid instead, and the honest answer is short enough to print.
 */
const FAQ = [
  {
    q: 'คืนเงินยังไง แล้วได้จริงไหม',
    a: `เมื่อมีการจองผ่านลิงก์ของ ROVE จากทริปที่ปลดล็อกไว้ ระบบจะคืนค่า Trip Pass ฿${TRIP_PASS_PRICE_THB} เป็นเครดิตเต็มจำนวนให้อัตโนมัติ ไม่ต้องทักหาใคร คืนหนึ่งครั้งต่อทริป ต่อให้ทริปนั้นจองหลายรายการ`,
  },
  {
    q: 'ทำไมถึงคืนให้ได้',
    a: 'เพราะเราไม่ได้อยู่ได้ด้วยค่าวางแผน เราได้ค่าคอมมิชชันจากพาร์ตเนอร์ที่คุณจอง ซึ่งมากกว่าค่า Trip Pass หลายเท่า ทริปที่วางแผนจนจบแล้วจองจริงจึงมีค่ากับเรามากกว่าทริปที่ค้างอยู่ — ค่าวางแผนที่ขวางไม่ให้คุณวางจนจบ เป็นการเสียของทั้งสองฝ่าย',
  },
  {
    q: 'ถ้าไม่ได้จองผ่าน ROVE',
    a: 'Trip Pass ยังอยู่กับทริปนั้นตลอด ใช้ AI ร่างและปรับแพลนได้ไม่จำกัดเหมือนเดิม แค่ไม่ได้เงินคืน เราไม่บังคับให้จองผ่านเรา และไม่ล็อกแพลนของคุณไว้',
  },
  {
    q: 'จ่ายคนเดียวแต่ไปกันหลายคน',
    a: 'Trip Pass เป็นของทริป ไม่ใช่ของคน ใครในห้องจ่ายก็ปลดล็อกให้ทุกคนในทริปนั้น จะหารกันเองทีหลังก็ได้ — และถ้าได้เงินคืน ก็คืนเต็มจำนวนให้คนที่จ่าย',
  },
  {
    q: 'มีค่าใช้จ่ายรายเดือนไหม',
    a: 'ไม่มี ไม่มีการตัดเงินอัตโนมัติ ไม่มีการต่ออายุที่คุณไม่ได้กด จ่ายเป็นทริป ๆ ไปเท่านั้น',
  },
];

/**
 * §4.2.6 wants a real category, not a slogan. On a pricing page the honest
 * categories are the terms themselves — and the ink tag anchoring the cluster
 * is the refund, which is the one people disbelieve.
 */
const HERO_TAGS = [
  { label: 'ฟรีทั้งห้อง', tone: 'journal' },
  { label: 'คืนเต็มจำนวน', tone: 'ink' },
  { label: 'ไม่มีรายเดือน', tone: 'documents' },
  { label: 'จ่ายเป็นทริป', tone: 'countdown' },
  { label: 'ไม่ต้องใส่บัตร', tone: 'itinerary' },
] as const;

export default function PricingPage() {
  return (
    <PublicShell
      width="wide"
      bleed
      actions={
        <Link href="/new" className={heroNavCtaClass}>
          เริ่มวางแผน
        </Link>
      }
    >
      {/* =========================================================== hero (canvas)
          §1 puts pricing on the marketing side of the line, so it is fully
          committed: canvas, oversized white display, one knockout. The tags
          name what you actually get rather than shouting — §4.2.6 wants a real
          category, and on a pricing page the categories are the terms. */}
      <HeroCanvas
        eyebrow="ราคา"
        headline={
          <>
            <span className="block">จ่ายตอนที่</span>
            <span className="block">ทริปคุ้ม</span>
            <span className="block">
              ที่จะ<span className="knockout">จ่าย.</span>
            </span>
          </>
        }
        lead={`วางแผนกับเพื่อนได้ฟรีทั้งห้อง ให้ AI ร่างให้ ${FREE_DRAFTS_PER_TRIP} ครั้งต่อทริป · อยากร่างต่อไม่อั้นก็ปลดล็อกทริปนั้นครั้งเดียว แล้วถ้าคุณจองผ่าน ROVE เราคืนให้เต็มจำนวน`}
        tags={HERO_TAGS}
        anchor={StarBurst}
        anchorTone="text-yellow-light"
        marks={
          <Sparkle className="text-green-solid pointer-events-none absolute top-[34%] -right-14 z-20 hidden size-16 sm:block" />
        }
        arrow
        actions={
          <Link href="/new" className={heroButtonClass}>
            เริ่มวางแผน — ฟรี
          </Link>
        }
      />

      {/* ------------------------------------------------------ plans (cream) */}
      <div className={`${SHELL_SECTION} py-14`}>
        <PricingTable />

        <p className="text-muted/80 mx-auto mt-5 max-w-2xl text-center text-[11px] leading-relaxed">
          ราคารวมภาษีแล้ว · ยังไม่มีระบบตัดเงินจริงในช่วงทดสอบ
          รายการที่เกิดขึ้นจะถูกบันทึกเป็นใบเสร็จและระบุไว้ว่าเป็นการทดลอง
        </p>

        {/* ------------------------------------------------------------ faq */}
        <section className="mx-auto mt-16 max-w-2xl">
          <SectionIntro
            title="คำถามที่ถามกันบ่อย"
            lead="ทุกข้อข้างล่างคือสิ่งที่คนถามก่อนจ่าย ตอบไว้ตรงนี้เลยจะได้ไม่ต้องทักมาถาม"
          />
          <div className="mt-8 space-y-2.5">
            {FAQ.map((item) => (
              <Card key={item.q} className="p-4 sm:p-5">
                <p className="text-ink text-sm font-medium">{item.q}</p>
                <p className="text-muted mt-1.5 text-xs leading-relaxed">{item.a}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-2xl text-center">
          <ButtonLink href="/new" size="lg">
            เริ่มวางแผนทริปแรก — ฟรี
          </ButtonLink>
          <p className="text-muted mt-3 text-[11px]">
            ไม่ต้องใส่บัตร · อ่าน{' '}
            <Link href="/terms" className="underline">
              เงื่อนไขการใช้งาน
            </Link>{' '}
            ได้ก่อนเริ่ม
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
