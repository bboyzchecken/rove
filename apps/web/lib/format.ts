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

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}
