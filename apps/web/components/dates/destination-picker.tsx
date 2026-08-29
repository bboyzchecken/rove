'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Plane, Sparkles, Thermometer } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useChooseDestination, useDestinations } from '@/features/dates/queries';
import type { LockedDates } from '@/lib/data';
import { thaiRangeLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * Step 5: where to go with the days the group just locked (M2.5).
 *
 * The ranking is the API's, not the card's — length of the window, season and
 * budget band. The card only has to make the top pick obvious and say why.
 */
export function DestinationPicker({
  tripId,
  locked,
  chosenId,
}: {
  tripId: string;
  locked: LockedDates;
  chosenId?: string | null;
}) {
  const router = useRouter();
  const { data: destinations, isLoading } = useDestinations(tripId);
  const choose = useChooseDestination(tripId);
  const [picked, setPicked] = useState<string | null>(chosenId ?? null);

  const selected = destinations?.find((d) => d.id === picked);

  return (
    <section className="space-y-3">
      <SectionHeader
        label={`ไปไหนดีกับ ${locked.days} วันนี้`}
        action={<span className="text-muted text-[11px]">เรียงตามความเหมาะกับกลุ่ม</span>}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-brand bg-surface h-52 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {destinations?.map((dest) => {
            const isPicked = picked === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => setPicked(dest.id)}
                className={cn(
                  'rounded-brand overflow-hidden text-left transition',
                  isPicked ? 'ring-primary ring-2' : 'ring-border ring-1',
                  dest.recommended && !isPicked && 'ring-primary/40',
                )}
              >
                {dest.recommended ? (
                  <div className="bg-primary text-primary-fg flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium">
                    <Sparkles className="size-3.5" /> แนะนำสำหรับกลุ่มคุณ
                  </div>
                ) : null}

                <div className="bg-bg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-3xl leading-none">{dest.flag}</div>
                      <h3 className="font-display text-ink mt-2 text-lg font-medium tracking-tight">
                        {dest.name}
                      </h3>
                      <p className="text-muted text-xs">{dest.subtitle}</p>
                    </div>
                    <Badge tone={isPicked ? 'solid' : 'neutral'} size="md">
                      {isPicked ? 'เลือกแล้ว' : `เหมาะ ${dest.fit}%`}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="primary">{dest.pill}</Badge>
                    <Badge tone="blue">
                      <Thermometer className="size-3" /> {dest.weather.low}–{dest.weather.high}°C
                    </Badge>
                    <Badge tone="green">
                      <Plane className="size-3" /> บิน {dest.flightHours} ชม.
                    </Badge>
                  </div>

                  <p className="text-muted mt-3 text-xs leading-relaxed">{dest.reason}</p>

                  <div className="border-border mt-3 flex items-end justify-between border-t pt-3">
                    <div>
                      <div className="text-muted text-[10px]">งบต่อคน (ไม่รวมตั๋วเครื่องบิน)</div>
                      <div className="nums font-display text-ink text-sm font-medium">
                        ฿{dest.budgetPerPersonThb[0].toLocaleString('th-TH')}–
                        {dest.budgetPerPersonThb[1].toLocaleString('th-TH')}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full',
                        isPicked ? 'bg-primary text-primary-fg' : 'bg-surface text-muted',
                      )}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <Card accent="solid" className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-display text-base font-medium">
              {selected.flag} เริ่มวางแผน {selected.name}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              {thaiRangeLabel(locked.startDate, locked.endDate)} · {locked.days} วัน{' '}
              {locked.days - 1} คืน → ขั้นต่อไป ใส่ที่อยากไปแล้วให้ AI ร่างแพลน
            </p>
          </div>
          <Button
            variant="soft"
            onClick={async () => {
              await choose.mutateAsync(selected.id);
              router.push(`/t/${tripId}/wishlist`);
            }}
            disabled={choose.isPending}
          >
            {choose.isPending ? 'กำลังบันทึก…' : 'ใช้ปลายทางนี้'}
            <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : null}
    </section>
  );
}
