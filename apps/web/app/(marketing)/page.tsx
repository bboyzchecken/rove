import { env } from '@/lib/env';

/**
 * Landing page.
 *
 * TODO(W1.1): the three entry cards — start from dates / from a city / from a
 * pasted ticket. Each must reach a created trip within three screens (X1.1).
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-accent text-sm font-medium">{env.brandName}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          วางแพลนเที่ยวญี่ปุ่นร่วมกันทั้งกลุ่ม
        </h1>
        <p className="text-muted">
          ทุกคนใส่สิ่งที่อยากไป · AI ร่างแพลนรายวันพร้อมงบ · แก้ด้วยกัน แล้วแชร์ได้
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { title: 'เริ่มจากวัน', hint: 'รู้วันเดินทางแล้ว', task: 'W1.2' },
          { title: 'เริ่มจากเมือง', hint: 'รู้ว่าอยากไปไหน', task: 'W1.3' },
          { title: 'วางข้อความตั๋ว', hint: 'มีตั๋วเครื่องบินแล้ว', task: 'W1.4' },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-brand border-border bg-surface border p-4 opacity-60"
          >
            <p className="font-medium">{card.title}</p>
            <p className="text-muted mt-1 text-sm">{card.hint}</p>
            <p className="text-muted mt-3 text-xs">TODO {card.task}</p>
          </div>
        ))}
      </div>

      <p className="text-muted text-xs">
        Phase 0 scaffold — โครงสร้างพร้อม ยังไม่มีฟีเจอร์ (DEV_SPEC §9)
      </p>
    </main>
  );
}
