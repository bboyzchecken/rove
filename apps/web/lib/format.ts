import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import Decimal from 'decimal.js';

/** Japan is the only Phase 1 destination — the editor thinks in Tokyo time. */
export const TRIP_TIMEZONE = 'Asia/Tokyo';

export function formatMoney(amount: number | string, currency = 'THB', locale = 'th-TH') {
  const value = new Decimal(amount).toNumber();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string, pattern = 'd MMM yyyy') {
  return format(parseISO(iso), pattern);
}

/** Times shown inside the itinerary are always local to the destination. */
export function formatTripTime(iso: string, pattern = 'HH:mm') {
  return formatInTimeZone(parseISO(iso), TRIP_TIMEZONE, pattern);
}

/** Thai users read dates in the Buddhist era — "15 พ.ย. 2569", not 2026. */
export function formatThaiDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(parseISO(iso));
}

/** "15–22 พ.ย. 2569" — collapses the shared month and year. */
export function formatThaiRange(startIso: string, endIso: string) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const day = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric' }).format(start);
    return `${day}–${formatThaiDate(endIso)}`;
  }
  return `${formatThaiDate(startIso, { year: undefined })} – ${formatThaiDate(endIso)}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}
