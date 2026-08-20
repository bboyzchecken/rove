import Link from 'next/link';
import { Coins, MessagesSquare, Sparkles, Wallet } from 'lucide-react';

import { EntryCards } from '@/components/entry/entry-cards';
import { SiteHeader } from '@/components/common/site-header';
import { env } from '@/lib/env';

/**
 * The landing page (W1.1). Its whole job is to get a group into a trip room in
 * three screens (X1.1), so the three entry cards are above the fold and
 * everything else is below them.
 */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="py-10 sm:py-16">
          <p className="section-label mb-3">วางแพลนเที่ยวญี่ปุ่นด้วยกัน</p>
          <h1 className="max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
            ทริปที่ทุกคนได้ไปในที่ที่อยากไป
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            ใส่ที่อยากไปกันคนละหน่อย ให้ AI ร่างแพลนรายวันพร้อมเหตุผลว่าทำไมตัดอะไรออก
            แล้วแก้ด้วยกันทั้งกลุ่ม — ไม่ต้องไล่อ่านแชทย้อนหลังอีก
          </p>

          <div className="mt-8">
            <EntryCards />
          </div>

          <p className="mt-4 text-sm text-muted">
            ฟรี · ใช้ได้เลยไม่ต้องสมัครก่อนก็ดูได้ · ตอนนี้รองรับญี่ปุ่น
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Feature
            icon={MessagesSquare}
            tone="bg-joyfull/30"
            title="ทุกคนใส่ที่อยากไปเองได้"
            description="ไม่ต้องมีใครคนเดียวรับหน้าที่รวบรวม แต่ละคนใส่ must / อยากไป / ไม่เอา แล้วบอร์ดจะบอกว่าของใครยังไม่ได้ลง"
          />
          <Feature
            icon={Sparkles}
            tone="bg-primary/12"
            title="AI ร่างให้ พร้อมบอกเหตุผล"
            description="ไม่ใช่แค่โยนแพลนมา — บอกด้วยว่าตัดอะไรออกเพราะอะไร วันไหนแน่นไป และที่ไหนปิดวันที่จะไป"
          />
          <Feature
            icon={Wallet}
            tone="bg-matcha/30"
            title="งบประมาณกับเงินจริง แยกกันชัด"
            description="งบคือประมาณการจากแพลน ส่วนรายจ่ายจริงหารกันแบบขุนทอง รู้เลยว่าใครต้องคืนใครเท่าไหร่"
          />
          <Feature
            icon={Coins}
            tone="bg-sun/40"
            title="เปิดทริปให้คนอื่นตามได้ แล้วได้แต้ม"
            description="ถ้ามีคนก๊อปทริปคุณไปเที่ยวแล้วจองผ่านลิงก์ คุณได้แต้มไว้ใช้ลดค่าจองทริปตัวเอง"
          />
        </section>

        <section className="mt-10 rounded-brand-lg bg-espresso p-6 text-white sm:p-8">
          <h2 className="font-display text-xl text-white sm:text-2xl">
            อยากดูตัวอย่างก่อน?
          </h2>
          <p className="mt-2 max-w-lg text-sm text-white/70">
            ดูทริปที่คนอื่นเปิดเป็นสาธารณะ ก๊อปมาแก้เป็นของตัวเองได้เลย
          </p>
          <Link
            href="/explore"
            className="mt-5 inline-flex h-11 items-center rounded-brand bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-light"
          >
            ดูทริปสาธารณะ
          </Link>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-5xl px-4 text-sm text-muted">
          {env.brandName} · ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว
        </div>
      </footer>
    </>
  );
}

function Feature({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: typeof Sparkles;
  tone: string;
  title: string;
  description: string;
}) {
  return (
    <div className={`rounded-brand-lg ${tone} p-5`}>
      <Icon className="mb-3 h-5 w-5 text-espresso" />
      <p className="font-display font-bold text-espresso">{title}</p>
      <p className="mt-1 text-sm text-espresso/70">{description}</p>
    </div>
  );
}
