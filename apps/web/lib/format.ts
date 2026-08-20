import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Every number and date the user sees goes through here. Two rules the whole
 * app depends on (DEV_SPEC §7.2):
 *
 *  1. The itinerary is in Asia/Tokyo. A user planning from Bangkok must see the
 *     time they will actually be standing there, not their own clock.
 *  2. Converted money always carries an "อัตราโดยประมาณ" label with its date.
 *     Never render a converted amount without one.
 */

export const TOKYO_TZ = 'Asia/Tokyo';

const bahtFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

/**
 * Amounts arrive from the API as JSON numbers, but DECIMAL columns can also
 * come through as strings; accepting both keeps every call site from having to
 * remember which is which.
 */
export function formatMoney(amount: number | string | null | undefined, currency = 'JPY'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (currency === 'THB') return bahtFormatter.format(value);
  if (currency === 'JPY') return yenFormatter.format(value);
  return `${plainFormatter.format(value)} ${currency}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return plainFormatter.format(value);
}

/** The label that must accompany every converted amount. */
export function fxLabel(fxRateAt: string | null | undefined): string {
  if (!fxRateAt) return 'ยังไม่มีอัตราแลกเปลี่ยน';
  return `อัตราโดยประมาณ ณ ${formatDate(fxRateAt, 'd MMM yyyy')}`;
}

export function formatDate(iso: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  const date = toDate(iso);
  if (!date) return '—';
  return format(date, pattern, { locale: th });
}

/** Itinerary times are Tokyo times, wherever the person reading them is. */
export function formatTokyoDate(iso: string | Date | null | undefined, pattern = 'EEE d MMM'): string {
  const date = toDate(iso);
  if (!date) return '—';
  return formatInTimeZone(date, TOKYO_TZ, pattern, { locale: th });
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = toDate(start);
  const to = toDate(end);
  if (!from && !to) return 'ยังไม่ได้เลือกวัน';
  if (from && !to) return formatDate(from);
  if (!from && to) return formatDate(to);

  const sameYear = from!.getFullYear() === to!.getFullYear();
  const sameMonth = sameYear && from!.getMonth() === to!.getMonth();
  if (sameMonth) return `${format(from!, 'd', { locale: th })}–${formatDate(to)}`;
  if (sameYear) return `${formatDate(from, 'd MMM')} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatRelative(iso: string | Date | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '';
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: th });
}

/** "อีก 12 วัน" / "เหลืออีก 3 วัน" / "กำลังเที่ยวอยู่" for the home calendar. */
export function formatDaysUntil(days: number): string {
  if (days === 0) return 'วันนี้!';
  if (days < 0) return 'กำลังเที่ยวอยู่';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}

/** "09:30 – 11:00", or just the start when there is no end. */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (start && end) return `${start} – ${end}`;
  return start || '';
}

/** "2 ชม. 30 นาที" — minutes alone stop being readable past an hour. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} นาที`;
  if (rest === 0) return `${hours} ชม.`;
  return `${hours} ชม. ${rest} นาที`;
}

/**
 * An instant rendered as the clock time in Tokyo. The itinerary always reads in
 * destination time — someone planning from Bangkok needs the time they will be
 * standing there, not their own.
 */
export function formatTripTime(iso: string | Date | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '';
  return formatInTimeZone(date, TOKYO_TZ, 'HH:mm');
}

/** Number of nights between two dates, for per-night costs. */
export function nightsBetween(start?: string | null, end?: string | null): number {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return 0;
  const nights = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return nights > 0 ? nights : 0;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}
