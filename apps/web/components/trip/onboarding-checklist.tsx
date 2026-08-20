'use client';

import Link from 'next/link';
import { Check, Circle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { route } from '@/lib/routes';
import type { TripOverview } from '@/types/api';

/**
 * W1.5 — the checklist that tells a brand-new trip room what to do next.
 *
 * It disappears entirely once the three steps are done: a permanent checklist
 * of ticked boxes is clutter, and the room should feel like it graduated.
 */
export function OnboardingChecklist({
  tripId,
  overview,
}: {
  tripId: string;
  overview: TripOverview;
}) {
  const steps = [
    {
      done: overview.counts.members > 1,
      label: 'ชวนเพื่อนเข้าห้อง',
      hint: 'ทริปนี้จะสนุกขึ้นเมื่อมีคนอื่นมาช่วยคิด',
      href: `/t/${tripId}`,
    },
    {
      done: overview.counts.wishlist_items > 0,
      label: 'ใส่ที่อยากไป',
      hint: 'อย่างน้อยคนละ 3 ที่ AI จะร่างได้ตรงขึ้นเยอะ',
      href: `/t/${tripId}/wishlist`,
    },
    {
      done: overview.counts.plans > 0,
      label: 'กดให้ AI ร่างแพลน',
      hint: 'ร่างเสร็จแล้วยังแก้ได้ทุกอย่าง',
      href: `/t/${tripId}/plan`,
    },
  ];

  if (steps.every((step) => step.done)) return null;

  return (
    <Card tone="primary" className="mb-4">
      <p className="section-label mb-3">เริ่มต้นทริปนี้</p>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={route(step.href)}
              className="flex items-start gap-3 rounded-brand p-2 transition-colors hover:bg-surface/60"
            >
              {step.done ? (
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-matcha" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-primary/40" />
              )}
              <span>
                <span
                  className={
                    step.done
                      ? 'block text-sm text-muted line-through'
                      : 'block text-sm font-medium text-espresso'
                  }
                >
                  {step.label}
                </span>
                {!step.done ? (
                  <span className="block text-xs text-muted">{step.hint}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
