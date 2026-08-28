'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  Gift,
  Handshake,
  Copy as CopyIcon,
  Sparkles,
  Ticket,
  Wand2,
} from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeader } from '@/components/common/section';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePointsHistory } from '@/features/rewards/queries';
import type { PointsEntry } from '@/lib/data';
import { formatThaiDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * ประวัติแต้ม (M23 — W23.1).
 *
 * Its own screen rather than a card on the profile, for the same reason
 * บิลและการชำระเงิน is: this is a record you come looking for, not something
 * you scroll past. A ledger that only exists three screens down the profile is
 * a ledger nobody checks, and points redeem for money off (8 แต้ม = ฿1,
 * A12.10) — the whole point of M23 is that the number is auditable.
 *
 * The profile keeps the balance and the redeem tiers: what you have, and what
 * it buys. This page answers where it came from.
 */
export function PointsScreen() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePointsHistory();

  const pages = data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const ledger = pages[0];
  const spent = ledger ? ledger.earned - ledger.balance : 0;

  return (
    <div className="space-y-7 px-4 py-5">
      <header>
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
          ประวัติแต้ม
        </h1>
        <p className="text-muted mt-1 text-sm">แต้มทุกแต้มมาจากไหน และถูกใช้ไปกับอะไร</p>
      </header>

      {isLoading ? (
        <div className="rounded-brand bg-surface h-40 animate-pulse" />
      ) : !ledger || entries.length === 0 ? (
        <EmptyState
          image="/brand/empty/empty-expense.webp"
          title="ยังไม่มีรายการแต้ม"
          hint="เปิดทริปเป็นสาธารณะหรือชวนเพื่อนเข้าทริปแรก แล้วแต้มแรกจะมาโผล่ที่นี่"
          action={
            <ButtonLink href="/trips" variant="ink" size="sm">
              ไปที่ทริปของฉัน
            </ButtonLink>
          }
        />
      ) : (
        <>
          {/* summary ---------------------------------------------------- */}
          <section>
            <SectionHeader label="สรุป" />
            <Card accent="yellow" className="p-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Figure label="ได้มาทั้งหมด" value={ledger.earned} tone="earn" />
                <Figure label="ใช้ไปแล้ว" value={-spent} />
                <Figure label="คงเหลือ" value={ledger.balance} />
              </div>
            </Card>
            <p className="text-muted mt-2 text-[11px] leading-relaxed">
              &quot;ได้มาทั้งหมด&quot; นับเฉพาะขาบวก จึงไม่ลดลงเวลาใช้แต้ม —
              ยอดคงเหลือคือผลรวมของทุกบรรทัดด้านล่าง
            </p>
          </section>

          {/* ledger ----------------------------------------------------- */}
          <section>
            <SectionHeader label="รายการทั้งหมด" />
            <Card className="divide-border divide-y overflow-hidden">
              {entries.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </Card>

            {hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                block
                className="mt-3"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'กำลังโหลด…' : 'ดูย้อนหลังเพิ่ม'}
              </Button>
            ) : (
              <p className="text-muted/70 mt-2 text-center text-[11px]">
                นี่คือรายการทั้งหมดตั้งแต่เปิดบัญชี
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * One row of the ledger.
 *
 * A row that came from a trip links to it. That is the difference between a
 * statement and a receipt: "260 แต้ม · มีคนคัดลอกทริป" is a claim, and being
 * able to open the trip it names is the proof.
 */
function LedgerRow({ entry }: { entry: PointsEntry }) {
  const earned = entry.delta >= 0;
  const { Icon, label } = describe(entry);

  const body = (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          earned ? 'bg-green/40' : 'bg-surface',
        )}
      >
        <Icon className="text-ink size-4" strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="text-ink block text-sm font-medium">{label}</span>
        <span className="text-muted block truncate text-[11px]">
          {formatThaiDate(entry.occurredAt, { day: 'numeric', month: 'short', year: 'numeric' })}
          {entry.tripTitle ? ` · ${entry.tripTitle}` : ''}
          {entry.note && !entry.tripTitle ? ` · ${entry.note}` : ''}
        </span>
      </span>

      <span className={cn('nums shrink-0 text-sm font-bold', earned ? 'text-success' : 'text-muted')}>
        {earned ? '+' : '−'}
        {Math.abs(entry.delta).toLocaleString('th-TH')}
      </span>
    </>
  );

  if (!entry.tripId) {
    return <div className="flex items-center gap-3 p-3.5">{body}</div>;
  }

  return (
    <Link
      href={`/t/${entry.tripId}` as never}
      className="hover:bg-border/40 flex items-center gap-3 p-3.5 transition"
    >
      {body}
      <ArrowUpRight className="text-muted size-3.5 shrink-0" />
    </Link>
  );
}

/**
 * What a ledger reason means in words.
 *
 * The API sends the machine reason and a note it wrote in Thai; the label here
 * is the reason, so the row reads the same whoever wrote the note. Anything
 * unrecognised falls back to the note rather than to the raw enum — a reason
 * added on the API side shows up as a sentence, not as `booking_confirmed`.
 */
function describe(entry: PointsEntry): { Icon: typeof Sparkles; label: string } {
  switch (entry.reason) {
    case 'trip_cloned':
      return { Icon: CopyIcon, label: 'มีคนเที่ยวตามแพลนของคุณ' };
    case 'trip_published':
      return { Icon: Sparkles, label: 'เปิดทริปเป็นสาธารณะ' };
    case 'booking_confirmed':
      return { Icon: Handshake, label: 'มีคนจองจากแพลนของคุณ' };
    case 'referral':
      return { Icon: Gift, label: 'เพื่อนที่ชวนมาเข้าร่วมทริปแรก' };
    case 'ai_draft':
      return { Icon: Wand2, label: 'ใช้แต้มให้ AI ร่างแพลน' };
    case 'redeem':
      return { Icon: Ticket, label: 'แลกเป็นโค้ดส่วนลด' };
    default:
      return { Icon: Sparkles, label: entry.note || 'ปรับแต้มโดยทีมงาน' };
  }
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'earn' }) {
  return (
    <div>
      <p className="text-muted text-[11px]">{label}</p>
      <p
        className={cn(
          'font-display nums mt-1 text-xl font-bold',
          tone === 'earn' ? 'text-success' : 'text-ink',
        )}
      >
        {value === 0 ? '0' : `${value > 0 ? '' : '−'}${Math.abs(value).toLocaleString('th-TH')}`}
      </p>
    </div>
  );
}
