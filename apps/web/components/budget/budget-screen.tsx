'use client';

import { useState } from 'react';
import { Info, RefreshCw, TriangleAlert } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, Input, fieldClass } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { useBudget, useRefreshFx, useSetBudget } from '@/features/plan/queries';
import { useTrip } from '@/features/trip/queries';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Budget tab (M7 — W7.1 … W7.3).
 *
 * Everything here is an ESTIMATE derived from plan items. Actual money spent
 * lives in the Expense tab (M16) and the two are never mixed, because
 * conflating them is how group budgets go wrong.
 */
export function BudgetScreen({ tripId }: { tripId: string }) {
  const { data: budget, isLoading } = useBudget(tripId);
  const { data: trip } = useTrip(tripId);
  const refreshFx = useRefreshFx(tripId);
  const [editing, setEditing] = useState(false);

  if (isLoading || !budget || !trip) {
    return (
      <div className="space-y-3 pt-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-brand bg-surface h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  const overBudget = budget.remainingThb < 0;
  const toThb = (jpy: number) => Math.round(jpy * budget.fxRate);

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="section-label">งบต่อคน</h2>
          <Badge tone="outline">ประมาณการ</Badge>
          <button
            onClick={() => setEditing(true)}
            className="text-primary ml-auto text-xs font-medium"
          >
            ตั้งงบใหม่
          </button>
        </div>

        <Card accent="primary" className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-ink nums text-3xl font-medium tracking-tight">
                {formatMoney(budget.perPersonThb, 'THB')}
              </p>
              <p className="text-muted mt-1 text-xs">
                ¥{budget.perPersonJpy.toLocaleString('en-US')} ต่อคน · รวมทั้งกลุ่ม ¥
                {budget.totalJpy.toLocaleString('en-US')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted text-xs">งบที่ตั้งไว้</p>
              <p className="font-display text-ink nums font-medium">
                {formatMoney(trip.budgetPerPersonThb, 'THB')}
              </p>
            </div>
          </div>

          <Progress
            value={budget.budgetUsed}
            tone={overBudget ? 'primary' : 'ink'}
            className="mt-4"
          />
          <p className="text-muted mt-2 text-xs">
            {overBudget
              ? `เกินงบอยู่ ${formatMoney(Math.abs(budget.remainingThb), 'THB')}`
              : `ยังเหลืออีก ${formatMoney(budget.remainingThb, 'THB')} ต่อคน`}
          </p>
        </Card>
      </section>

      <section>
        <SectionHeader label="แยกตามหมวด" />
        <Card className="overflow-hidden">
          <div className="text-muted bg-surface grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[11px] font-medium">
            <span>หมวด</span>
            <span className="w-24 text-right">รวมทั้งกลุ่ม</span>
            <span className="w-24 text-right">ต่อคน</span>
          </div>

          <div className="divide-border divide-y">
            {budget.lines.map((line) => (
              <div
                key={line.category}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span>{line.icon}</span>
                  <span className="text-ink truncate text-sm font-medium">
                    {line.category}
                  </span>
                  {line.prepaid ? <Badge tone="pink">จ่ายแล้ว</Badge> : null}
                </div>
                <div className="w-24 text-right">
                  <p className="text-ink nums text-xs">
                    ¥{line.totalJpy.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="w-24 text-right">
                  <p className="text-ink nums text-xs font-medium">
                    {formatMoney(toThb(line.perPersonJpy), 'THB')}
                  </p>
                  <p className="text-muted nums text-[10px]">
                    ¥{line.perPersonJpy.toLocaleString('en-US')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-ink text-bg grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
            <span className="font-display text-sm font-medium">รวม</span>
            <span className="nums w-24 text-right text-xs">
              ¥{budget.totalJpy.toLocaleString('en-US')}
            </span>
            <span className="font-display nums w-24 text-right text-sm font-medium">
              {formatMoney(budget.perPersonThb, 'THB')}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader label="ที่ควรรู้" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card accent="pink" className="p-4">
            <Stat
              value={formatMoney(toThb(budget.prepaidJpy / Math.max(1, trip.partySize)), 'THB')}
              label="จ่ายล่วงหน้าไปแล้ว (ที่พัก)"
              hint="ไม่ต้องเตรียมเงินสดส่วนนี้"
            />
          </Card>

          <Card accent="yellow" className="p-4">
            <div className="flex items-start gap-2">
              <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-ink text-sm font-medium">
                  ยังมี {budget.itemsWithoutCost} รายการที่ไม่ได้ใส่ราคา
                </p>
                <p className="text-muted mt-1 text-xs leading-relaxed">
                  ส่วนใหญ่เป็นเวลาว่างกับที่ที่เข้าฟรี แต่ตัวเลขจริงอาจขยับขึ้นได้อีก
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-2">
          <p className="text-muted flex flex-1 items-start gap-1.5 text-[11px] leading-relaxed">
            <Info className="mt-px size-3.5 shrink-0" />
            แปลงค่าเงินด้วยอัตราโดยประมาณ 1 เยน = {budget.fxRate} บาท ณ วันที่{' '}
            {budget.fxAsOf ? formatThaiDate(budget.fxAsOf) : '—'} —
            ตัวเลขจริงตอนรูดบัตรจะต่างจากนี้เล็กน้อย
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refreshFx.mutate()}
            disabled={refreshFx.isPending}
          >
            <RefreshCw
              className={refreshFx.isPending ? 'animate-rove-spin size-3.5' : 'size-3.5'}
            />
            อัปเดตเรต
          </Button>
        </div>
      </section>

      <BudgetDialog
        tripId={tripId}
        current={trip.budgetPerPersonThb}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

function BudgetDialog({
  tripId,
  current,
  open,
  onClose,
}: {
  tripId: string;
  current: number;
  open: boolean;
  onClose: () => void;
}) {
  const setBudget = useSetBudget(tripId);
  const [value, setValue] = useState(current);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ตั้งงบต่อคน"
      description="ใช้เป็นเส้นเทียบเฉย ๆ — ไม่ได้บล็อกอะไรถ้าเกิน"
      footer={
        <Button
          block
          size="lg"
          onClick={async () => {
            await setBudget.mutateAsync(value);
            onClose();
          }}
          disabled={setBudget.isPending}
        >
          {setBudget.isPending ? 'กำลังบันทึก…' : 'บันทึกงบ'}
        </Button>
      }
    >
      <label className="block">
        <FieldLabel>งบต่อคน (บาท)</FieldLabel>
        <Input
          type="number"
          min={0}
          step={1000}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className={cn(fieldClass, 'nums')}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[20_000, 30_000, 45_000, 60_000].map((preset) => (
          <button
            key={preset}
            onClick={() => setValue(preset)}
            className="bg-surface text-muted hover:bg-border rounded-full px-3 py-1.5 text-xs font-medium"
          >
            {formatMoney(preset, 'THB')}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
