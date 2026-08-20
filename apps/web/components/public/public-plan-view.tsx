import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/common/logo';
import { formatDateRange, formatMoney, formatTokyoDate } from '@/lib/format';
import { route } from '@/lib/routes';
import type { PublicPlan } from '@/types/api';

/**
 * W10.2 — the read-only plan a stranger sees.
 *
 * A server component: no hooks, no client bundle, nothing that could reach for
 * a query that requires auth. That is a structural guarantee, not a convention
 * — this file has no way to read the expense tables.
 */
export function PublicPlanView({
  plan,
  cloneHref,
}: {
  plan: PublicPlan;
  cloneHref?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="py-6">
        <Logo size="sm" />
      </header>

      <Card>
        <p className="section-label mb-2">
          {plan.destination_cities.join(' · ') || plan.destination_country}
        </p>
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{plan.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {formatDateRange(plan.start_date, plan.end_date)}
          {plan.days ? ` · ${plan.days} วัน` : ''}
          {plan.party_size ? ` · ${plan.party_size} คน` : ''}
        </p>

        {plan.summary ? <p className="mt-3 text-muted">{plan.summary}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">
            โดย <span className="font-medium text-espresso">{plan.author.display_name}</span>
          </p>
          {plan.clone_count > 0 ? (
            <Badge tone="neutral">มีคนก๊อปไปแล้ว {plan.clone_count} ครั้ง</Badge>
          ) : null}
        </div>

        {plan.can_clone && cloneHref ? (
          <Link
            href={route(cloneHref)}
            className="mt-5 inline-flex h-11 items-center rounded-brand bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-light"
          >
            ก๊อปทริปนี้ไปแก้เป็นของตัวเอง
          </Link>
        ) : null}
      </Card>

      {plan.plan.pros.length > 0 || plan.plan.cons.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {plan.plan.pros.length > 0 ? (
            <Card flat tone="matcha">
              <p className="mb-2 font-display text-sm font-bold text-espresso">ข้อดีของแพลนนี้</p>
              <ul className="space-y-1 text-sm text-espresso/80">
                {plan.plan.pros.map((pro, i) => (
                  <li key={i}>• {pro}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {plan.plan.cons.length > 0 ? (
            <Card flat tone="sun">
              <p className="mb-2 font-display text-sm font-bold text-espresso">ข้อควรรู้</p>
              <ul className="space-y-1 text-sm text-espresso/80">
                {plan.plan.cons.map((con, i) => (
                  <li key={i}>• {con}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {plan.plan.days.map((day, index) => (
          <section key={index}>
            <h2 className="mb-2 flex items-baseline gap-2 border-b border-border pb-1">
              <span className="font-display text-sm font-bold text-espresso">
                วันที่ {index + 1}
              </span>
              <span className="text-sm text-muted">{formatTokyoDate(day.date)}</span>
              {day.title ? <span className="text-sm text-espresso">{day.title}</span> : null}
            </h2>

            <ul className="space-y-2">
              {day.items.map((item, i) => (
                <li key={i} className="flex gap-3 rounded-brand bg-surface p-3">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted">
                    {item.start_time || '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-espresso">{item.title}</p>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted">
                      {item.travel_min ? <span>เดินทาง {item.travel_min} นาที</span> : null}
                      {item.cost_jpy ? (
                        <span>ประมาณ {formatMoney(item.cost_jpy, 'JPY')}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted">{plan.fx_rate_note}</p>

      <div className="mt-6 rounded-brand-lg bg-espresso p-6 text-center">
        <p className="font-display text-lg text-white">อยากวางแพลนแบบนี้บ้าง?</p>
        <p className="mt-1 text-sm text-white/70">
          ใส่ที่อยากไปกันคนละหน่อย ให้ AI ร่างให้ แล้วแก้ด้วยกันทั้งกลุ่ม
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-11 items-center rounded-brand bg-primary px-5 text-sm font-medium text-primary-fg"
        >
          เริ่มทริปของตัวเอง
        </Link>
      </div>
    </div>
  );
}
