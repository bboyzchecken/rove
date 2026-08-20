'use client';

import { use } from 'react';
import Link from 'next/link';
import { ExternalLink, Ticket } from 'lucide-react';

import { useBookings } from '@/features/booking/queries';
import { usePlan, usePlans } from '@/features/plan/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { formatRelative } from '@/lib/format';
import type { Item } from '@/types/api';

/**
 * W12.2 — everything in this trip that can be booked, and where each stands.
 *
 * It reads from the plan rather than from the click log, because the question
 * people open this tab with is "what have we not booked yet", and a click log
 * only knows about the things somebody already started.
 */

const STATUS_LABELS: Record<Item['booking_status'], { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  none: { label: 'ยังไม่ได้จอง', tone: 'neutral' },
  clicked: { label: 'กดดูแล้ว', tone: 'info' },
  booked: { label: 'จองแล้ว', tone: 'success' },
  skipped: { label: 'ไม่จอง', tone: 'neutral' },
};

/** The types a partner can actually sell. */
const BOOKABLE: Item['type'][] = ['stay', 'place', 'transport'];

export default function BookingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);

  const { data: plans, isLoading: plansLoading } = usePlans(tripId);
  const activePlan = plans?.items.find((p) => p.is_final) ?? plans?.items[0];
  const { data: plan, isLoading } = usePlan(activePlan?.id);
  const { data: clicks, error, refetch } = useBookings(tripId);

  if (plansLoading || isLoading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState onRetry={() => void refetch()} />;

  if (!plan) {
    return (
      <EmptyState
        title="ยังไม่มีแพลนให้จอง"
        description="พอมีแพลนแล้ว ที่พักและตั๋วที่ต้องจองจะมารวมกันตรงนี้"
      />
    );
  }

  const bookable = plan.days.flatMap((day) =>
    day.items
      .filter((item) => BOOKABLE.includes(item.type))
      .map((item) => ({ item, date: day.date })),
  );

  const booked = bookable.filter(({ item }) => item.booking_status === 'booked').length;

  if (bookable.length === 0) {
    return (
      <EmptyState
        title="ไม่มีรายการที่ต้องจอง"
        description="ที่พัก ตั๋วเข้าสถานที่ และตั๋วเดินทางจะขึ้นที่นี่"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card tone="primary">
        <CardHeader>
          <div>
            <CardTitle>
              จองแล้ว {booked} จาก {bookable.length} รายการ
            </CardTitle>
            <CardDescription>
              กดจากรายการในแพลนได้เลย เราจะพาไปหน้าพาร์ทเนอร์ที่มีของนั้น
            </CardDescription>
          </div>
          <Ticket className="h-5 w-5 shrink-0 text-primary" />
        </CardHeader>
      </Card>

      <Card>
        <ul className="space-y-1">
          {bookable.map(({ item, date }) => {
            const status = STATUS_LABELS[item.booking_status];
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-brand px-1 py-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/t/${tripId}/plan#item-${item.id}`}
                    className="truncate text-sm font-medium text-espresso hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {new Date(date).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {item.booking_partner ? ` · ${item.booking_partner}` : ''}
                  </p>
                </div>

                <Badge tone={status.tone}>{status.label}</Badge>

                {item.booking_url ? (
                  <a
                    href={item.booking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`ไปหน้าจอง ${item.title}`}
                    className="shrink-0 rounded p-1.5 text-muted hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {clicks && clicks.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>ประวัติการกดจอง</CardTitle>
          </CardHeader>
          <ul className="space-y-1">
            {clicks.items.slice(0, 10).map((click) => (
              <li key={click.id} className="flex items-center gap-2 text-sm text-muted">
                <span className="font-medium text-espresso">{click.partner}</span>
                <span className="ml-auto text-xs">
                  {formatRelative(click.clicked_at ?? click.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
