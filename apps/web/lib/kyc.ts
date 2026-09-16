import { addDays, parseIsoDate } from '@/lib/data/domain';

/**
 * Creator verification and payout-cycle rules shared by the verify screen and
 * mock mode (Feedback #4 — F11). Each mirrors `apps/api/pkg/domain/payout.go`;
 * when one changes there, it changes here.
 */

export const PAYOUT_CYCLE_DAYS = 14;
export const PAYOUT_DUE_WORKING_DAYS = 3;
/** D-35: how long income waits for its creator to verify. */
export const HELD_EARNING_DAYS = 180;
export const EXPIRY_WARNING_DAYS = 14;
export const MINIMUM_PAYOUT_THB = 300;
export const OTP_RESEND_SECONDS = 60;

export type KycStep = 'basic' | 'identity' | 'documents' | 'account';
export const KYC_STEPS: KycStep[] = ['basic', 'identity', 'documents', 'account'];

export const KYC_STEP_LABEL: Record<KycStep, string> = {
  basic: 'ข้อมูลพื้นฐาน',
  identity: 'เลขบัตร',
  documents: 'รูปบัตรและเซลฟี่',
  account: 'บัญชีรับเงิน',
};

export function digits(value: string) {
  return value.replace(/\D/g, '');
}

/** 13-digit national ID, and the juristic tax ID that shares its checksum. */
export function validThaiId(value: string) {
  const d = digits(value);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** 08x-xxx-xxxx or +668x… → 0xxxxxxxxx, or '' when it is not a Thai mobile. */
export function normalizeThaiPhone(value: string) {
  let d = digits(value);
  if (d.startsWith('66') && d.length === 11) d = `0${d.slice(2)}`;
  return d.length === 10 && d.startsWith('0') ? d : '';
}

export function last4(value: string) {
  return value.length <= 4 ? value : value.slice(-4);
}

/** Cutoff plus three working days (Mon–Fri). Holidays are the admin's to move around. */
export function payoutDueDate(cutoff: string) {
  let day = cutoff;
  let added = 0;
  while (added < PAYOUT_DUE_WORKING_DAYS) {
    day = addDays(day, 1);
    const weekday = parseIsoDate(day).getDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return day;
}

/** The anchor's fortnightly rhythm: the first cutoff on or after `from`. */
export function nextPayoutCutoff(anchor: string, from: string) {
  if (from <= anchor) return anchor;
  const days = Math.round((parseIsoDate(from).getTime() - parseIsoDate(anchor).getTime()) / 86_400_000);
  const steps = Math.ceil(days / PAYOUT_CYCLE_DAYS);
  return addDays(anchor, steps * PAYOUT_CYCLE_DAYS);
}

export function isTuesday(iso: string) {
  return parseIsoDate(iso).getDay() === 2;
}
