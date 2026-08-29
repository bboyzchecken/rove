import { Check, RotateCcw, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PLANS, TRIP_PASS_PLAN_ID, TRIP_PASS_PRICE_THB, splitPerPersonThb } from '@/lib/catalog/plans';
import { planPriceLabel } from '@/lib/billing';
import { cn } from '@/lib/utils';

/**
 * The three tiers (M26 — W26.1).
 *
 * Trip Pass sits in the middle and is the only card that is raised. That is not
 * decoration: it is the row this product actually sells, and the middle is
 * where the eye lands first. ROVE Year is on the right doing a job it is not
 * expected to be bought for — it gives ฿299 something to be measured against,
 * and "คุ้มตั้งแต่ทริปที่ 4" is a sentence that makes one trip's pass look
 * cheap rather than one that makes a year look necessary.
 *
 * Nothing here is a button. The pass is bought inside a trip, because a pass
 * with no trip attached is not a thing that can exist (A26.2) — so this page
 * explains the price and hands off to "เริ่มวางแผน".
 */
export function PricingTable() {
  return (
    <div className="grid gap-4 sm:grid-cols-3 sm:items-center">
      {PLANS.map((plan) => {
        const highlighted = plan.id === TRIP_PASS_PLAN_ID;

        return (
          <Card
            key={plan.id}
            accent={highlighted ? 'primary' : undefined}
            className={cn(
              'flex h-full flex-col p-5',
              highlighted && 'shadow-float-lg sm:scale-[1.04] sm:py-7',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-ink text-lg font-medium">{plan.name}</p>
              {highlighted ? (
                <Badge tone="green" size="md">
                  ที่คนส่วนใหญ่ใช้
                </Badge>
              ) : plan.available ? null : (
                <Badge tone="outline" size="md">
                  เร็ว ๆ นี้
                </Badge>
              )}
            </div>

            <p className="font-display text-ink nums mt-2 text-3xl font-medium">
              {planPriceLabel(plan)}
            </p>
            <p className="text-muted mt-1.5 text-xs leading-relaxed">{plan.tagline}</p>

            <ul className="mt-4 space-y-2">
              {plan.perks.map((perk) => (
                <li key={perk} className="text-muted flex items-start gap-2 text-xs leading-relaxed">
                  <Check className="text-primary mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            {/* The refund gets its own block on the one card it applies to.
                It is the whole argument for the price above it, and a line
                buried in the bullet list reads like a promotion rather than a
                condition of the sale (W26.3). */}
            {plan.refundableOnBooking ? (
              <div className="border-border mt-4 border-t pt-3.5">
                <p className="text-ink flex items-start gap-2 text-xs leading-relaxed font-medium">
                  <RotateCcw className="text-primary mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <span>จองผ่าน ROVE แล้วคืนให้เต็มจำนวน — เท่ากับไม่ได้จ่ายค่าวางแผนเลย</span>
                </p>
                <p className="text-muted mt-2 flex items-start gap-2 text-[11px] leading-relaxed">
                  <Users className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    เป็นของทั้งทริป ใครในห้องจ่ายก็ได้ · หารกัน 4 คนคือคนละ ฿
                    {splitPerPersonThb(4)} และคืนกลับทั้ง ฿{TRIP_PASS_PRICE_THB}
                  </span>
                </p>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
