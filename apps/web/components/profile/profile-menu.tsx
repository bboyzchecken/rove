'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  FileText,
  Luggage,
  LogOut,
  Pencil,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { LocaleSwitch } from '@/components/common/locale-switch';
import { Card } from '@/components/ui/card';
import { useDreams, useLogout, useMe } from '@/features/auth/queries';
import { useBillingSummary } from '@/features/billing/queries';
import { useTrips } from '@/features/trip/queries';
import { cn } from '@/lib/utils';

/**
 * The profile menu.
 *
 * Everything a signed-in person can do *to their account* rather than to a
 * trip. The bottom bar already carries the five destinations; this list carries
 * the ones that have nowhere else to live — editing the profile, the admin
 * console, the legal pages, and the way out.
 *
 * One card, one column, rows the full width of the screen: on a phone a row is
 * a much bigger tap target than a chip, and this is the one screen where the
 * user is looking for a specific thing rather than browsing.
 *
 * Rows the user cannot use are not rendered at all — a greyed-out "แอดมิน" row
 * tells every user something about the product that is none of their business.
 */
export function ProfileMenu({ onEditProfile }: { onEditProfile: () => void }) {
  const { data: me } = useMe();
  const { data: trips = [] } = useTrips();
  const { data: dreams = [] } = useDreams();
  const { data: billing } = useBillingSummary();

  return (
    <Card className="divide-border divide-y overflow-hidden">
      <MenuRow
        icon={Pencil}
        label="แก้ไขโปรไฟล์"
        hint="ชื่อ ชื่อผู้ใช้ สกุลเงิน"
        onClick={onEditProfile}
      />
      <MenuRow
        icon={Luggage}
        label="ทริปของฉัน"
        hint={countLabel(trips.length, 'ทริป')}
        href="/trips"
      />
      <MenuRow
        icon={Sparkles}
        label="ที่อยากไปสักวัน"
        hint={countLabel(dreams.length, 'รายการ')}
        href="/dreams"
      />
      {/*
        Points are the other ledger this account carries (M23 — W23.1), and
        they sit next to the receipts on purpose: both answer "what happened to
        something of mine", and both are records rather than screens you browse.

        The hint here IS the balance, unlike the row below it — points are the
        product's own score, already shown in full at the top of this page, and
        a row that led somewhere without saying how many would be a row nobody
        taps.
      */}
      <MenuRow
        icon={ScrollText}
        label="ประวัติแต้ม"
        hint={countLabel(me?.points ?? 0, 'แต้ม')}
        href="/points"
      />
      {/* The hint is the receipt count, not the amount: a number of baht on a
          menu row is money the user did not ask to be reminded of. */}
      <MenuRow
        icon={ReceiptText}
        label="บิลและการชำระเงิน"
        hint={countLabel(billing?.orders ?? 0, 'ใบเสร็จ')}
        href="/billing"
      />
      {me?.isAdmin ? (
        <MenuRow icon={ShieldCheck} label="แอดมิน" hint="เฉพาะทีมงาน" href="/admin" />
      ) : null}
      {/* A preference about the person, not about a page (Phase 3). */}
      <div className="border-border border-t px-4 py-3.5">
        <LocaleSwitch />
      </div>

      <MenuRow icon={FileText} label="เงื่อนไขการใช้งาน" href="/terms" />
      <MenuRow icon={FileText} label="นโยบายความเป็นส่วนตัว" href="/privacy" />
      <SignOutRow />
    </Card>
  );
}

function countLabel(count: number, unit: string) {
  return count > 0 ? `${count.toLocaleString('th-TH')} ${unit}` : '—';
}

/**
 * A link and a button have to look identical here, so the styling lives in one
 * string and only the element around it changes.
 */
const ROW = 'hover:bg-border/40 flex w-full items-center gap-3 px-4 py-3.5 text-left transition';

function MenuRow({
  icon: Icon,
  label,
  hint,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <Icon className="text-muted size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="text-ink flex-1 text-sm font-medium">{label}</span>
      {hint ? <span className="text-muted nums text-xs">{hint}</span> : null}
      <ChevronRight className="text-muted/60 size-4 shrink-0" />
    </>
  );

  // The label is spelled out again for assistive tech: read from content, the
  // name would pick up the hint too ("ทริปของฉัน 3 ทริป"), and the count is
  // already announced as the text it sits in.
  if (href) {
    return (
      <Link href={href as never} className={ROW} aria-label={label}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={ROW} aria-label={label}>
      {body}
    </button>
  );
}

/**
 * The way out lives at the bottom of the profile because that is the one screen
 * that is unambiguously "me" — a sign-out in the nav bar is a tap away from
 * every other destination and gets hit by accident on a phone.
 */
function SignOutRow() {
  const router = useRouter();
  const logout = useLogout();

  return (
    <button
      type="button"
      disabled={logout.isPending}
      onClick={() =>
        logout.mutate(undefined, {
          // `replace`, not `push`: the session is gone, so the page the user
          // just left must not be one Back button away.
          onSuccess: () => router.replace('/'),
        })
      }
      aria-label="ออกจากระบบ"
      className={cn(ROW, 'text-danger disabled:opacity-50')}
    >
      <LogOut className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="flex-1 text-sm font-medium">
        {logout.isPending ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
      </span>
    </button>
  );
}
