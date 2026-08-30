'use client';

import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/common/section';
import { usePlatformStats } from '@/features/public/queries';
import { showsAverageRating, showsPlatformStats } from '@/lib/social-proof';

/**
 * สถิติของแพลตฟอร์ม (M24 — W24.1).
 *
 * The landing page had no social proof of any kind: every number the product
 * knew was per-trip or per-creator, and a stranger arriving cold saw neither.
 *
 * **ตัวเลขจริงเท่านั้น.** Below the threshold this section does not render at
 * all — it does not round up, pad, or say "เร็วๆ นี้". Same rule and the same
 * reason as `CreatorEarningsCard` returning null before there is anything to
 * report: an invented number is worth less than no number, because it is the
 * first thing a reader can check.
 */

export function PlatformStatsSection({ className }: { className?: string }) {
  const { data: stats } = usePlatformStats();

  // No skeleton on purpose: this section is allowed to not exist, and a
  // placeholder that resolves to nothing is worse than arriving late.
  //
  // The threshold lives in `lib/social-proof` rather than here because the
  // admin overview has to be able to say *why* this section is hidden, and two
  // copies of that number would eventually disagree.
  if (!showsPlatformStats(stats) || !stats) return null;

  const showRating = showsAverageRating(stats);

  return (
    <section className={className}>
      <SectionHeader label="ตัวเลขจริงจากคนที่ใช้อยู่" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          value={stats.planners}
          label="คนวางแพลนกับ ROVE"
          hint="นับเฉพาะคนที่เปิดทริปจริง"
        />
        <Figure
          value={stats.publicTrips}
          label="แพลนที่เปิดให้ตามรอย"
          hint="เจ้าของกดเปิดสาธารณะเอง"
        />
        <Figure
          value={stats.clones}
          label="ครั้งที่มีคนก๊อปแพลนไปใช้"
          hint="ก๊อปแล้วแก้ต่อเป็นของตัวเอง"
        />
        {showRating ? (
          <Figure
            value={stats.averageRating}
            decimals={1}
            label={`คะแนนเฉลี่ยจาก ${stats.reviews.toLocaleString('th-TH')} รีวิว`}
            hint="เขียนหลังจบทริปเท่านั้น"
          />
        ) : (
          <Figure
            value={stats.reviews}
            label="รีวิวจากคนที่ไปมาแล้ว"
            hint="เขียนหลังจบทริปเท่านั้น"
          />
        )}
      </div>
    </section>
  );
}

function Figure({
  value,
  label,
  hint,
  decimals = 0,
}: {
  value: number;
  label: string;
  hint: string;
  decimals?: number;
}) {
  return (
    <Card accent="gray" className="p-5">
      <p className="font-display text-ink nums text-3xl leading-none font-medium">
        {value.toLocaleString('th-TH', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </p>
      <p className="text-ink mt-2 text-sm font-medium">{label}</p>
      <p className="text-muted mt-0.5 text-[11px] leading-relaxed">{hint}</p>
    </Card>
  );
}
