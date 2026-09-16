import { formatThaiDate } from '@/lib/format';

/** "อ. 29 ก.ย. 2569" — a cutoff is always read by its weekday first (D-21). */
export function dayLabel(iso: string) {
  return formatThaiDate(iso, { weekday: 'short' });
}

export function whenLabel(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
