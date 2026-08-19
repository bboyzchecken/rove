import { AlertTriangle } from 'lucide-react';

import { PlanBoard } from '@/components/editor/plan-board';
import { SectionHeader, Stat } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { formatDuration } from '@/lib/format';
import { AI_CREDITS, planStats } from '@/lib/mock';

/** Plan tab (M4 + M5). */
export const metadata = { title: 'แพลน' };

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <section>
        <SectionHeader label="แพลนที่ AI ร่างไว้" />
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={planStats.days} label="วัน" />
            <Stat value={planStats.items} label="รายการ" />
            <Stat value={formatDuration(planStats.travelMinutes)} label="เวลาเดินทางรวม" />
            <Stat value={`${planStats.booked}/${planStats.bookable}`} label="จองแล้ว" />
          </div>

          <p className="text-muted mt-3 text-xs">
            ทริปนี้ให้ AI ร่างฟรีได้ {AI_CREDITS.freePerTrip} ครั้ง · ใช้ไปแล้ว {AI_CREDITS.used}{' '}
            ครั้ง — ครั้งถัดไปใช้แต้มหรือซื้อเพิ่มก็ได้
          </p>

          {planStats.warnings > 0 ? (
            <p className="text-warning mt-3 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="size-3.5" />
              มี {planStats.warnings} จุดที่ควรดูอีกที — ROVE ทำเครื่องหมายไว้ในไทม์ไลน์แล้ว
            </p>
          ) : null}
        </Card>
      </section>

      <PlanBoard />
    </div>
  );
}
