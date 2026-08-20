'use client';

import { AlertTriangle } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { PlanBoard } from '@/components/editor/plan-board';
import { Card } from '@/components/ui/card';
import { usePlanDays } from '@/features/plan/queries';
import { useTrip } from '@/features/trip/queries';
import { formatDuration } from '@/lib/format';

/** Plan tab (M4 + M5): the summary strip, then the editor. */
export function PlanScreen({ tripId }: { tripId: string }) {
  const { data: days = [] } = usePlanDays(tripId);
  const { data: trip } = useTrip(tripId);

  const items = days.flatMap((d) => d.items);
  const stats = {
    days: days.length,
    items: items.length,
    warnings: items.filter((i) => i.warning).length,
    bookable: items.filter((i) => i.bookable).length,
    booked: items.filter((i) => i.booked).length,
    travelMinutes: items.reduce((sum, i) => sum + (i.travel?.minutes ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      {days.length > 0 ? (
        <section>
          <SectionHeader label="แพลนที่ AI ร่างไว้" />
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat value={stats.days} label="วัน" />
              <Stat value={stats.items} label="รายการ" />
              <Stat value={formatDuration(stats.travelMinutes)} label="เวลาเดินทางรวม" />
              <Stat value={`${stats.booked}/${stats.bookable}`} label="จองแล้ว" />
            </div>

            {stats.warnings > 0 ? (
              <p className="text-warning mt-3 flex items-center gap-1.5 text-xs font-medium">
                <AlertTriangle className="size-3.5" />
                มี {stats.warnings} จุดที่ควรดูอีกที — ROVE ทำเครื่องหมายไว้ในไทม์ไลน์แล้ว
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <PlanBoard tripId={tripId} fxRate={trip?.fxRate ?? 0.235} />
    </div>
  );
}
