import { ApiError } from '@/lib/api-client';
import { addDays, toIsoDate } from '@/lib/data/domain';
import {
  EXPIRY_WARNING_DAYS,
  HELD_EARNING_DAYS,
  KYC_STEP_LABEL,
  KYC_STEPS,
  MINIMUM_PAYOUT_THB,
  OTP_RESEND_SECONDS,
  PAYOUT_CYCLE_DAYS,
  digits,
  last4,
  nextPayoutCutoff,
  normalizeThaiPhone,
  payoutDueDate,
  validThaiId,
  isTuesday,
} from '@/lib/kyc';

import type {
  AdminAuditEntry,
  AdminEarning,
  AdminPayoutAccount,
  CreatorEarningStatus,
  CycleDetail,
  EarningsStatement,
  KycDetail,
  KycQueueRow,
  KycStepKey,
  NotificationKind,
  OtpSent,
  PayoutAccount,
  PayoutCycle,
  PayoutsOverview,
  PendingAccountChange,
  Verification,
  VerificationAccountInput,
  VerificationBasicInput,
  VerificationStatus,
} from '../types';
import type { MockDb } from './db';
import { ledgerOf } from './ledger';

/**
 * Getting paid, mock half (Feedback #4 — F11, D-21 … D-23, D-35, D-37 … D-42).
 *
 * One table of creator earnings for everybody — the demo user and a handful of
 * fictional creators from the explore feed — so the creator's statement, the
 * admin payout screen and the evidence trace all read the same rows. There is
 * no payout cycle until an admin picks the first Tuesday (D-40), exactly as a
 * fresh API install.
 */

type Step = KycStepKey;

export interface MockCreator {
  id: string;
  name: string;
  handle: string;
  verifiedAt: string | null;
}

export interface MockVerification {
  id: string;
  userId: string;
  status: VerificationStatus;
  legalType: 'individual' | 'juristic';
  legalName: string;
  phone: string;
  phoneVerifiedAt: string | null;
  email: string;
  emailVerifiedAt: string | null;
  idNumber: string;
  hasIdCard: boolean;
  hasSelfie: boolean;
  /** Small data-URL thumbnails in mock mode; '' falls back to a sample image. */
  idCardUrl: string | null;
  selfieUrl: string | null;
  rejectedSteps: Step[];
  rejectReason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  history: AdminAuditEntry[];
}

export interface MockAccount {
  id: string;
  userId: string;
  kind: 'bank' | 'promptpay';
  bankCode: string;
  number: string;
  accountName: string;
  status: PayoutAccount['status'];
  rejectReason: string;
  createdAt: string;
}

interface MockOtp {
  userId: string;
  channel: 'phone' | 'email';
  target: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
  attempts: number;
}

export interface MockEarningRow {
  id: string;
  userId: string;
  tripId: string;
  partner: string;
  bookingValueThb: number;
  commissionThb: number;
  sharePercent: number;
  amountThb: number;
  estimated: boolean;
  status: CreatorEarningStatus;
  occurredAt: string;
  payoutId: string | null;
  warned?: boolean;
}

interface MockCycle {
  id: string;
  cutoffDate: string;
  originalCutoff: string;
  dueDate: string;
  status: 'open' | 'closed';
  movedReason: string;
  closedAt: string | null;
}

interface MockPayout {
  id: string;
  userId: string;
  cycleId: string | null;
  periodStart: string;
  periodEnd: string;
  amountThb: number;
  earningCount: number;
  status: 'pending' | 'paid';
  accountId: string | null;
  accountKind: string;
  bankCode: string;
  accountLast4: string;
  accountName: string;
  transferRef: string;
  slipUrl: string | null;
  paidAt: string | null;
}

export interface MockPayoutState {
  creators: MockCreator[];
  verifications: MockVerification[];
  accounts: MockAccount[];
  otps: MockOtp[];
  earnings: MockEarningRow[];
  anchorDate: string | null;
  cycles: MockCycle[];
  payouts: MockPayout[];
}

/* ------------------------------------------------------------------ seed -- */

/** Appends the checksum digit, so every seeded number passes `validThaiId`. */
function thaiId(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (13 - i);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

function sampleImage(label: string, tone: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" rx="24" fill="${tone}"/><rect x="28" y="28" width="120" height="150" rx="12" fill="#ffffff" opacity="0.7"/><rect x="170" y="48" width="260" height="18" rx="9" fill="#ffffff" opacity="0.7"/><rect x="170" y="86" width="200" height="14" rx="7" fill="#ffffff" opacity="0.6"/><rect x="170" y="116" width="230" height="14" rx="7" fill="#ffffff" opacity="0.6"/><text x="240" y="250" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#1a1a1a">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_ID_CARD = sampleImage('รูปบัตรตัวอย่าง (โหมดจำลอง)', '#cfe3f5');
export const SAMPLE_SELFIE = sampleImage('เซลฟี่คู่บัตรตัวอย่าง (โหมดจำลอง)', '#f5dccf');

function earning(
  id: string,
  userId: string,
  partner: string,
  bookingValueThb: number,
  commissionThb: number,
  status: CreatorEarningStatus,
  occurredAt: string,
  tripId = 'demo',
): MockEarningRow {
  return {
    id,
    userId,
    tripId,
    partner,
    bookingValueThb,
    commissionThb,
    sharePercent: 15,
    amountThb: Math.round(commissionThb * 15) / 100,
    estimated: false,
    status,
    occurredAt,
    payoutId: null,
  };
}

function approved(
  id: string,
  userId: string,
  legalName: string,
  idFirst12: string,
  at: string,
): MockVerification {
  return {
    id,
    userId,
    status: 'approved',
    legalType: 'individual',
    legalName,
    phone: '0812345678',
    phoneVerifiedAt: at,
    email: `${userId}@example.com`,
    emailVerifiedAt: at,
    idNumber: thaiId(idFirst12),
    hasIdCard: true,
    hasSelfie: true,
    idCardUrl: SAMPLE_ID_CARD,
    selfieUrl: SAMPLE_SELFIE,
    rejectedSteps: [],
    rejectReason: '',
    submittedAt: at,
    reviewedAt: at,
    history: [],
  };
}

function seedPayoutState(meId: string): MockPayoutState {
  const earnings = [
    // The demo user's own lines, the same ids the admin trace shows.
    earning('earn-agoda', meId, 'Agoda', 48_000, 2_400, 'payable', '2026-08-22T06:15:00.000Z'),
    earning('earn-klook', meId, 'Klook', 9_600, 480, 'pending', '2026-08-03T14:05:00.000Z'),
    // Old enough to be inside the 14-day warning window (D-35).
    earning('earn-gyg', meId, 'GetYourGuide', 12_800, 640, 'pending', '2026-03-26T10:00:00.000Z'),
    { ...earning('earn-bcom', meId, 'Booking.com', 62_000, 2_480, 'paid', '2026-07-18T11:40:00.000Z'), payoutId: 'po-legacy-bcom' },
    earning('earn-poon-1', 'u-poon', 'Agoda', 36_000, 3_600, 'payable', '2026-08-28T09:00:00.000Z', 'pub-poon'),
    earning('earn-poon-2', 'u-poon', 'Klook', 12_000, 1_200, 'payable', '2026-09-02T09:00:00.000Z', 'pub-poon'),
    earning('earn-poon-3', 'u-poon', 'Trip.com', 14_000, 1_400, 'pending', '2026-09-10T09:00:00.000Z', 'pub-poon'),
    earning('earn-mint-1', 'u-mint', 'Klook', 12_000, 1_200, 'payable', '2026-09-05T09:00:00.000Z', 'pub-mint'),
    earning('earn-fah-1', 'u-fah', 'Agoda', 54_000, 5_400, 'payable', '2026-08-15T09:00:00.000Z', 'pub-fah'),
    earning('earn-phum-1', 'u-phum', 'Booking.com', 6_300, 630, 'pending', '2026-09-12T09:00:00.000Z', 'pub-phum'),
  ];

  const fah: MockVerification = {
    ...approved('kyc-fah', 'u-fah', 'ฟ้าใส ใจดี', '110370012345', '2026-09-14T08:30:00.000Z'),
    status: 'submitted',
    reviewedAt: null,
  };

  return {
    creators: [
      { id: 'u-poon', name: 'ปูน', handle: 'poon.rail', verifiedAt: '2026-08-01T03:00:00.000Z' },
      { id: 'u-mint', name: 'มิ้นท์', handle: 'mint.travels', verifiedAt: '2026-08-20T03:00:00.000Z' },
      { id: 'u-fah', name: 'ฟ้า', handle: 'fah.solo', verifiedAt: null },
      { id: 'u-phum', name: 'ภูมิ', handle: 'phum.eats', verifiedAt: null },
    ],
    verifications: [
      approved('kyc-poon', 'u-poon', 'ปูนปั้น ศรีสุข', '310150098765', '2026-08-01T03:00:00.000Z'),
      approved('kyc-mint', 'u-mint', 'มิ้นท์ มีสุข', '150990045678', '2026-08-20T03:00:00.000Z'),
      fah,
    ],
    accounts: [
      account('acc-poon', 'u-poon', 'KBANK', '0123456789', 'ปูนปั้น ศรีสุข', 'verified', '2026-07-30T03:00:00.000Z'),
      account('acc-mint', 'u-mint', 'SCB', '9876543210', 'มิ้นท์ มีสุข', 'verified', '2026-08-18T03:00:00.000Z'),
      // The same number as ปูน's — the shared-account flag in the queue.
      account('acc-fah', 'u-fah', 'KBANK', '0123456789', 'ฟ้าใส ใจดี', 'pending', '2026-09-14T08:20:00.000Z'),
    ],
    otps: [],
    earnings,
    anchorDate: null,
    cycles: [],
    payouts: [
      {
        // Paid under the old monthly report, before cycles existed.
        id: 'po-legacy-bcom',
        userId: meId,
        cycleId: null,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        amountThb: 372,
        earningCount: 1,
        status: 'paid',
        accountId: null,
        accountKind: 'bank',
        bankCode: '',
        accountLast4: '',
        accountName: '',
        transferRef: 'TRF-88213',
        slipUrl: null,
        paidAt: '2026-08-05T03:00:00.000Z',
      },
    ],
  };
}

function account(
  id: string,
  userId: string,
  bankCode: string,
  number: string,
  accountName: string,
  status: PayoutAccount['status'],
  createdAt: string,
): MockAccount {
  return { id, userId, kind: 'bank', bankCode, number, accountName, status, rejectReason: '', createdAt };
}

/** Seeds on first read, like the evidence chain. Call inside `mutate` when writing. */
export function payoutStateOf(db: MockDb): MockPayoutState {
  db.payoutState ??= seedPayoutState(db.user.id);
  return db.payoutState;
}

/* --------------------------------------------------------------- helpers -- */

const now = () => new Date().toISOString();
const today = () => toIsoDate(new Date());
let counter = 0;
const newId = (prefix: string) => {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
};
const round2 = (value: number) => Math.round(value * 100) / 100;

function nameOf(db: MockDb, userId: string) {
  if (userId === db.user.id) return { name: db.user.name, handle: db.user.handle.replace(/^@/, '') };
  const creator = payoutStateOf(db).creators.find((c) => c.id === userId);
  return { name: creator?.name ?? userId, handle: creator?.handle ?? '' };
}

function isVerified(db: MockDb, userId: string) {
  if (userId === db.user.id) return Boolean(db.user.verified);
  return Boolean(payoutStateOf(db).creators.find((c) => c.id === userId)?.verifiedAt);
}

function setVerified(db: MockDb, userId: string, at: string | null) {
  if (userId === db.user.id) {
    db.user.verified = at !== null;
    return;
  }
  const creator = payoutStateOf(db).creators.find((c) => c.id === userId);
  if (creator) creator.verifiedAt = at;
}

/** The D-37 badge for a public creator, looked up by handle. */
export function creatorVerified(db: MockDb, handle: string | null | undefined) {
  if (!handle) return false;
  const bare = handle.replace(/^@/, '');
  if (bare === db.user.handle.replace(/^@/, '')) return Boolean(db.user.verified);
  return Boolean(payoutStateOf(db).creators.find((c) => c.handle === bare)?.verifiedAt);
}

/** Only the signed-in demo user has an inbox; everyone else is fictional. */
function notify(db: MockDb, userId: string, kind: NotificationKind, title: string, body: string, link: string) {
  if (userId !== db.user.id) return;
  db.notifications.push({
    id: newId('ntf'),
    kind,
    title,
    body,
    link,
    tripId: null,
    actorId: db.user.id,
    read: false,
    createdAt: now(),
  });
}

function audit(db: MockDb, v: MockVerification, action: string, reason: string, before: unknown, after: unknown) {
  v.history.unshift({
    id: newId('audit'),
    actorId: db.user.id,
    actorName: db.user.name,
    action,
    targetType: 'creator_verification',
    targetId: v.id,
    reason,
    before,
    after,
    occurredAt: now(),
  });
}

/** Keeps the admin trace in step with a status change made here. */
function traceTransition(db: MockDb, earningId: string, to: CreatorEarningStatus, reason: string, ref: string) {
  for (const node of ledgerOf(db).nodes) {
    const row = node.earnings.find((e) => e.id === earningId);
    if (!row) continue;
    row.events.push({ from: String(row.status), to, actorId: db.user.id, reason, ref, occurredAt: now() });
    row.status = to;
  }
}

export function currentAccount(state: MockPayoutState, userId: string) {
  const mine = state.accounts.filter((a) => a.userId === userId && a.status !== 'replaced');
  return mine[mine.length - 1] ?? null;
}

function toAccount(a: MockAccount): PayoutAccount {
  return {
    id: a.id,
    kind: a.kind,
    bankCode: a.bankCode,
    numberLast4: last4(a.number),
    accountName: a.accountName,
    status: a.status,
    rejectReason: a.rejectReason,
  };
}

function sharedWith(db: MockDb, a: MockAccount) {
  const state = payoutStateOf(db);
  const ids = new Set(
    state.accounts
      .filter((o) => o.userId !== a.userId && o.kind === a.kind && o.number === a.number && o.status !== 'replaced')
      .map((o) => o.userId),
  );
  return [...ids].map((id) => ({ id, ...nameOf(db, id) }));
}

function toAdminAccount(db: MockDb, a: MockAccount): AdminPayoutAccount {
  return { ...toAccount(a), number: a.number, sharedWith: sharedWith(db, a) };
}

/* ---------------------------------------------------- verification (me) -- */

function stepsOf(state: MockPayoutState, v: MockVerification): Record<Step, boolean> {
  const acc = currentAccount(state, v.userId);
  return {
    basic: Boolean(v.legalName && v.phoneVerifiedAt && v.emailVerifiedAt),
    identity: v.idNumber !== '',
    documents: v.hasIdCard && v.hasSelfie,
    account: acc !== null && acc.status !== 'rejected',
  };
}

/** D-39 as a rule: draft all open, rejected only what was named, approved only the account. */
function editableSteps(v: MockVerification): Step[] {
  switch (v.status) {
    case 'draft':
      return [...KYC_STEPS];
    case 'rejected':
      return [...v.rejectedSteps];
    case 'approved':
      return ['account'];
    default:
      return [];
  }
}

function myVerification(db: MockDb): MockVerification {
  const state = payoutStateOf(db);
  let v = state.verifications.find((row) => row.userId === db.user.id);
  if (!v) {
    const email = db.user.email ?? '';
    v = {
      id: newId('kyc'),
      userId: db.user.id,
      status: 'draft',
      legalType: 'individual',
      legalName: '',
      phone: '',
      phoneVerifiedAt: null,
      email,
      // A Google sign-in already proved the address.
      emailVerifiedAt: email.startsWith('google@') ? now() : null,
      idNumber: '',
      hasIdCard: false,
      hasSelfie: false,
      idCardUrl: null,
      selfieUrl: null,
      rejectedSteps: [],
      rejectReason: '',
      submittedAt: null,
      reviewedAt: null,
      history: [],
    };
    state.verifications.push(v);
  }
  return v;
}

function view(db: MockDb, v: MockVerification): Verification {
  const state = payoutStateOf(db);
  const acc = currentAccount(state, v.userId);
  return {
    status: v.status,
    legalType: v.legalType,
    legalName: v.legalName,
    phone: v.phone,
    phoneVerified: Boolean(v.phoneVerifiedAt),
    email: v.email,
    emailVerified: Boolean(v.emailVerifiedAt),
    idNumberLast4: v.idNumber ? last4(v.idNumber) : '',
    hasIdCard: v.hasIdCard,
    hasSelfie: v.hasSelfie,
    account: acc ? toAccount(acc) : null,
    steps: stepsOf(state, v),
    editableSteps: editableSteps(v),
    rejectedSteps: [...v.rejectedSteps],
    rejectReason: v.rejectReason,
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    verified: Boolean(db.user.verified),
    verifiedAt: db.user.verified ? v.reviewedAt : null,
  };
}

function guard(v: MockVerification, step: Step) {
  if (!editableSteps(v).includes(step)) throw new ApiError(409, 'ขั้นนี้แก้ไม่ได้ตอนนี้');
}

export function getVerification(db: MockDb) {
  return view(db, myVerification(db));
}

export function saveBasic(db: MockDb, input: VerificationBasicInput) {
  const v = myVerification(db);
  guard(v, 'basic');
  if (input.legalType !== 'individual' && input.legalType !== 'juristic') {
    throw new ApiError(400, 'ประเภทผู้สมัครไม่ถูกต้อง');
  }
  const name = input.legalName.trim().split(/\s+/).join(' ');
  if ([...name].length < 3) throw new ApiError(400, 'กรอกชื่อ-นามสกุลจริงให้ตรงกับบัญชีธนาคาร');
  const phone = normalizeThaiPhone(input.phone);
  if (!phone) throw new ApiError(400, 'เบอร์โทรไม่ถูกต้อง');
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@') || /\s/.test(email)) throw new ApiError(400, 'อีเมลไม่ถูกต้อง');

  if (v.legalType !== input.legalType) v.idNumber = '';
  v.legalType = input.legalType;
  v.legalName = name;
  if (v.phone !== phone) {
    v.phone = phone;
    v.phoneVerifiedAt = null;
  }
  if (v.email !== email) {
    v.email = email;
    v.emailVerifiedAt = null;
  }
  return view(db, v);
}

export function sendOtp(db: MockDb, channel: 'phone' | 'email'): OtpSent {
  const v = myVerification(db);
  guard(v, 'basic');
  const target = channel === 'phone' ? v.phone : channel === 'email' ? v.email : '';
  if (channel !== 'phone' && channel !== 'email') throw new ApiError(400, 'ช่องทางไม่ถูกต้อง');
  if (!target) throw new ApiError(400, 'บันทึกข้อมูลขั้นแรกก่อนขอรหัส');

  const state = payoutStateOf(db);
  const last = latestOtp(state, v.userId, channel);
  if (last && Date.now() - new Date(last.createdAt).getTime() < OTP_RESEND_SECONDS * 1000) {
    throw new ApiError(429, 'รอสักครู่ก่อนขอรหัสใหม่');
  }
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const otp: MockOtp = {
    userId: v.userId,
    channel,
    target,
    code,
    createdAt: now(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    consumed: false,
    attempts: 0,
  };
  state.otps.push(otp);
  // Nothing is sent in mock mode, so the code always comes back.
  return { channel, expiresAt: otp.expiresAt, devCode: code };
}

function latestOtp(state: MockPayoutState, userId: string, channel: string) {
  const rows = state.otps.filter((o) => o.userId === userId && o.channel === channel);
  return rows[rows.length - 1] ?? null;
}

export function verifyOtp(db: MockDb, channel: 'phone' | 'email', code: string) {
  const v = myVerification(db);
  guard(v, 'basic');
  const otp = latestOtp(payoutStateOf(db), v.userId, channel);
  if (!otp) throw new ApiError(400, 'ขอรหัสใหม่อีกครั้ง');
  const target = channel === 'phone' ? v.phone : v.email;
  if (otp.consumed || Date.now() > new Date(otp.expiresAt).getTime() || otp.target !== target || otp.attempts >= 5) {
    throw new ApiError(400, 'รหัสหมดอายุแล้ว ขอรหัสใหม่อีกครั้ง');
  }
  otp.attempts += 1;
  if (otp.code !== code.trim()) throw new ApiError(400, 'รหัสไม่ถูกต้อง');
  otp.consumed = true;
  if (channel === 'phone') v.phoneVerifiedAt = now();
  else v.emailVerifiedAt = now();
  return view(db, v);
}

function idTaken(state: MockPayoutState, v: MockVerification, number: string) {
  return state.verifications.some(
    (o) => o.userId !== v.userId && o.idNumber === number && o.legalType === v.legalType,
  );
}

export function saveIdentity(db: MockDb, raw: string) {
  const v = myVerification(db);
  guard(v, 'identity');
  const number = digits(raw);
  if (!validThaiId(number)) {
    throw new ApiError(
      400,
      v.legalType === 'juristic' ? 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง' : 'เลขบัตรประชาชนไม่ถูกต้อง',
    );
  }
  if (idTaken(payoutStateOf(db), v, number)) {
    throw new ApiError(409, 'เลขนี้ถูกใช้ยืนยันตัวตนกับบัญชีอื่นแล้ว');
  }
  v.idNumber = number;
  return view(db, v);
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Checked before the object URLs are made, so a refused file leaves nothing behind. */
export function checkDocumentFiles(files: { idCard?: File; selfie?: File }) {
  const list = [files.idCard, files.selfie].filter((f): f is File => Boolean(f));
  if (list.length === 0) throw new ApiError(400, 'แนบรูปบัตร (id_card) หรือเซลฟี่คู่บัตร (selfie)');
  for (const file of list) {
    if (!IMAGE_TYPES.includes(file.type)) throw new ApiError(400, 'รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
    if (file.size > 8 * 1024 * 1024) throw new ApiError(400, 'รูปใหญ่เกิน 8 MB');
  }
}

export function saveDocuments(db: MockDb, urls: { idCard?: string; selfie?: string }) {
  const v = myVerification(db);
  guard(v, 'documents');
  if (urls.idCard !== undefined) {
    v.hasIdCard = true;
    v.idCardUrl = urls.idCard;
  }
  if (urls.selfie !== undefined) {
    v.hasSelfie = true;
    v.selfieUrl = urls.selfie;
  }
  return view(db, v);
}

export function saveAccount(db: MockDb, input: VerificationAccountInput) {
  const v = myVerification(db);
  guard(v, 'account');
  const number = digits(input.accountNumber);
  let bankCode = input.bankCode.trim();
  if (input.kind === 'bank') {
    if (!bankCode) throw new ApiError(400, 'เลือกธนาคาร');
    if (number.length < 10 || number.length > 15) throw new ApiError(400, 'เลขบัญชีไม่ถูกต้อง');
  } else if (input.kind === 'promptpay') {
    if (number.length !== 10 && number.length !== 13) {
      throw new ApiError(400, 'พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลักหรือเลขบัตร 13 หลัก');
    }
    bankCode = '';
  } else {
    throw new ApiError(400, 'ประเภทบัญชีไม่ถูกต้อง');
  }
  const name = input.accountName.trim().split(/\s+/).join(' ');
  if (!name) throw new ApiError(400, 'กรอกชื่อบัญชี');

  const state = payoutStateOf(db);
  const current = currentAccount(state, v.userId);
  if (
    current &&
    current.kind === input.kind &&
    current.number === number &&
    current.accountName === name &&
    current.bankCode === bankCode &&
    current.status !== 'rejected'
  ) {
    return view(db, v);
  }
  if (current) current.status = 'replaced';
  state.accounts.push({
    id: newId('acc'),
    userId: v.userId,
    kind: input.kind,
    bankCode,
    number,
    accountName: name,
    status: 'pending',
    rejectReason: '',
    createdAt: now(),
  });
  return view(db, v);
}

export function submitVerification(db: MockDb) {
  const v = myVerification(db);
  const state = payoutStateOf(db);
  if (v.status !== 'draft' && v.status !== 'rejected') throw new ApiError(409, 'ส่งตรวจไปแล้ว');
  const steps = stepsOf(state, v);
  if (!KYC_STEPS.every((step) => steps[step])) {
    throw new ApiError(400, 'กรอกให้ครบทั้ง 4 ขั้นก่อนส่งตรวจ');
  }
  if (idTaken(state, v, v.idNumber)) throw new ApiError(409, 'เลขนี้ถูกใช้ยืนยันตัวตนกับบัญชีอื่นแล้ว');
  v.status = 'submitted';
  v.submittedAt = now();
  v.rejectedSteps = [];
  v.rejectReason = '';
  return view(db, v);
}

/* --------------------------------------------------------- cycles & held -- */

/** Exactly one open cycle ahead once an anchor exists (D-40). */
function ensureCycles(state: MockPayoutState): MockCycle | null {
  if (!state.anchorDate) return null;
  const open = state.cycles.find((c) => c.status === 'open');
  if (open) return open;
  const day = today();
  let cutoff = nextPayoutCutoff(state.anchorDate, day);
  if (state.cycles.length > 0) {
    const latest = state.cycles.map((c) => c.originalCutoff).sort().at(-1)!;
    cutoff = addDays(latest, PAYOUT_CYCLE_DAYS);
    while (cutoff < day) cutoff = addDays(cutoff, PAYOUT_CYCLE_DAYS);
  }
  const cycle: MockCycle = {
    id: newId('cyc'),
    cutoffDate: cutoff,
    originalCutoff: cutoff,
    dueDate: payoutDueDate(cutoff),
    status: 'open',
    movedReason: '',
    closedAt: null,
  };
  state.cycles.push(cycle);
  return cycle;
}

const isHeld = (db: MockDb, row: MockEarningRow) =>
  !isVerified(db, row.userId) && row.amountThb > 0 && (row.status === 'pending' || row.status === 'payable');

const expiryOf = (row: MockEarningRow) => addDays(row.occurredAt.slice(0, 10), HELD_EARNING_DAYS);

/** D-35 without a scheduler: expire what waited too long, warn once near the end. */
function sweepHeld(db: MockDb, userId?: string) {
  const state = payoutStateOf(db);
  const day = today();
  const warnings = new Map<string, { amount: number; expiry: string }>();
  for (const row of state.earnings) {
    if ((userId && row.userId !== userId) || !isHeld(db, row)) continue;
    const expiry = expiryOf(row);
    if (expiry <= day) {
      traceTransition(db, row.id, 'expired', 'ไม่ได้ยืนยันตัวตนภายใน 180 วัน', '');
      row.status = 'expired';
      continue;
    }
    if (!row.warned && addDays(day, EXPIRY_WARNING_DAYS) >= expiry) {
      row.warned = true;
      const w = warnings.get(row.userId) ?? { amount: 0, expiry };
      w.amount += row.amountThb;
      if (expiry < w.expiry) w.expiry = expiry;
      warnings.set(row.userId, w);
    }
  }
  for (const [uid, w] of warnings) {
    notify(
      db,
      uid,
      'earning_expiring',
      `รายได้ ฿${round2(w.amount).toLocaleString('th-TH')} จะหมดอายุ ${thaiShort(w.expiry)}`,
      'ยืนยันตัวตนเพื่อเปิดรับรายได้ก่อนวันหมดอายุ ไม่งั้นรายได้ก้อนนี้จะหายไป',
      '/profile/verify',
    );
  }
}

function thaiShort(iso: string) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00`));
}

export function earningsStatement(db: MockDb, sharePercent: number): EarningsStatement {
  const state = payoutStateOf(db);
  sweepHeld(db, db.user.id);
  const cycle = ensureCycles(state);
  const mine = state.earnings
    .filter((row) => row.userId === db.user.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const sum = (status: CreatorEarningStatus) =>
    round2(mine.filter((r) => r.status === status).reduce((n, r) => n + r.amountThb, 0));

  let held: EarningsStatement['held'] = null;
  const entries = mine.map((row) => {
    const heldRow = isHeld(db, row);
    const expiresAt = heldRow ? expiryOf(row) : null;
    if (heldRow && expiresAt) {
      held ??= { amountThb: 0, count: 0, earliestExpiry: expiresAt };
      held.amountThb = round2(held.amountThb + row.amountThb);
      held.count += 1;
      if (expiresAt < held.earliestExpiry) held.earliestExpiry = expiresAt;
    }
    return {
      id: row.id,
      tripId: row.tripId,
      partner: row.partner,
      bookingValueThb: row.bookingValueThb,
      commissionThb: row.commissionThb,
      sharePercent: row.sharePercent,
      amountThb: row.amountThb,
      estimated: row.estimated,
      status: row.status,
      occurredAt: row.occurredAt,
      expiresAt,
    };
  });

  const v = state.verifications.find((row) => row.userId === db.user.id);
  return {
    totals: {
      pendingThb: sum('pending'),
      payableThb: sum('payable'),
      inPayoutThb: sum('in_payout'),
      paidThb: sum('paid'),
      expiredThb: sum('expired'),
      count: mine.length,
    },
    sharePercent,
    minimumPayoutThb: MINIMUM_PAYOUT_THB,
    verified: Boolean(db.user.verified),
    verificationStatus: v?.status ?? 'none',
    nextCycle: cycle ? { cutoffDate: cycle.cutoffDate, dueDate: cycle.dueDate } : null,
    held,
    entries,
    payouts: state.payouts
      .filter((p) => p.userId === db.user.id)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
      .map((p) => ({
        id: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        amountThb: p.amountThb,
        earningCount: p.earningCount,
        status: p.status,
        paidAt: p.paidAt,
        dueDate: p.cycleId ? (state.cycles.find((c) => c.id === p.cycleId)?.dueDate ?? null) : null,
        bankCode: p.bankCode,
        accountLast4: p.accountLast4,
        transferRef: p.transferRef,
        slipUrl: p.slipUrl,
      })),
  };
}

/** Whether any earning points at this trip — part of the D-18 "tied" rule. */
export function tripHasEarnings(db: MockDb, tripId: string) {
  return payoutStateOf(db).earnings.some((row) => row.tripId === tripId);
}

/* ------------------------------------------------------------ admin view -- */

function toCycle(state: MockPayoutState, c: MockCycle): PayoutCycle {
  const payouts = state.payouts.filter((p) => p.cycleId === c.id);
  const day = today();
  return {
    id: c.id,
    cutoffDate: c.cutoffDate,
    originalCutoff: c.originalCutoff,
    dueDate: c.dueDate,
    status: c.status,
    movedReason: c.movedReason,
    closedAt: c.closedAt,
    payoutCount: payouts.length,
    paidCount: payouts.filter((p) => p.status === 'paid').length,
    totalThb: round2(payouts.reduce((n, p) => n + p.amountThb, 0)),
    overdue: payouts.some((p) => p.status !== 'paid' && day > c.dueDate),
  };
}

export function payoutsOverview(db: MockDb): PayoutsOverview {
  const state = payoutStateOf(db);
  sweepHeld(db);
  const next = ensureCycles(state);

  const byUser = new Map<string, { amount: number; count: number }>();
  for (const row of state.earnings.filter((r) => r.status === 'payable')) {
    const agg = byUser.get(row.userId) ?? { amount: 0, count: 0 };
    agg.amount += row.amountThb;
    agg.count += 1;
    byUser.set(row.userId, agg);
  }
  const ready = [...byUser.entries()]
    .map(([userId, agg]) => {
      const amountThb = round2(agg.amount);
      const verified = isVerified(db, userId);
      const accountVerified = currentAccount(state, userId)?.status === 'verified';
      const belowMinimum = amountThb < MINIMUM_PAYOUT_THB;
      return {
        userId,
        ...nameOf(db, userId),
        amountThb,
        earningCount: agg.count,
        verified,
        accountVerified,
        belowMinimum,
        willBePaid: verified && accountVerified && !belowMinimum,
      };
    })
    .sort((a, b) => b.amountThb - a.amountThb);

  const pending = state.earnings.filter((r) => r.status === 'pending');
  return {
    anchorDate: state.anchorDate,
    minimumPayoutThb: MINIMUM_PAYOUT_THB,
    nextCycle: next ? toCycle(state, next) : null,
    cycles: [...state.cycles]
      .sort((a, b) => b.cutoffDate.localeCompare(a.cutoffDate))
      .map((c) => toCycle(state, c)),
    pendingCount: pending.length,
    pendingThb: round2(pending.reduce((n, r) => n + r.amountThb, 0)),
    ready,
    heldThb: round2(ready.filter((r) => !r.verified).reduce((n, r) => n + r.amountThb, 0)),
    kycQueue: state.verifications.filter((v) => v.status === 'submitted').length,
    accountQueue: pendingAccountChanges(db).length,
    openFlags: ledgerOf(db).flags.filter((f) => !f.resolvedAt).length,
  };
}

export function setAnchor(db: MockDb, anchorDate: string) {
  const state = payoutStateOf(db);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) throw new ApiError(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
  if (!isTuesday(anchorDate)) throw new ApiError(400, 'วันตั้งต้นต้องเป็นวันอังคาร');
  if (anchorDate < today()) throw new ApiError(400, 'วันตั้งต้นต้องไม่อยู่ในอดีต');
  if (state.cycles.length > 0) {
    throw new ApiError(409, 'ตั้งวันตั้งต้นไปแล้ว — ถ้าจะเปลี่ยนรอบ ให้เลื่อนรอบให้เร็วขึ้นแทน');
  }
  state.anchorDate = anchorDate;
  return payoutsOverview(db);
}

export function adminEarnings(db: MockDb, status = 'pending', partner = ''): AdminEarning[] {
  return payoutStateOf(db)
    .earnings.filter((r) => r.status === status && (!partner || r.partner === partner))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      name: nameOf(db, r.userId).name,
      tripId: r.tripId,
      partner: r.partner,
      bookingValueThb: r.bookingValueThb,
      commissionThb: r.commissionThb,
      amountThb: r.amountThb,
      estimated: r.estimated,
      status: r.status,
      occurredAt: r.occurredAt,
    }));
}

export function reconcile(db: MockDb, ids: string[], rawRef: string) {
  const ref = rawRef.trim();
  if (!ref || ids.length === 0) throw new ApiError(400, 'เลือกรายการและกรอกเลขใบแจ้งยอดของพาร์ตเนอร์');
  let moved = 0;
  for (const row of payoutStateOf(db).earnings) {
    if (!ids.includes(row.id) || row.status !== 'pending') continue;
    traceTransition(db, row.id, 'payable', 'พาร์ตเนอร์จ่ายแล้ว', ref);
    row.status = 'payable';
    moved += 1;
  }
  return { moved };
}

function findCycle(state: MockPayoutState, id: string) {
  const cycle = state.cycles.find((c) => c.id === id);
  if (!cycle) throw new ApiError(404, 'ไม่พบรอบนี้');
  return cycle;
}

export function cycleDetail(db: MockDb, id: string): CycleDetail {
  const state = payoutStateOf(db);
  const cycle = findCycle(state, id);
  return {
    cycle: toCycle(state, cycle),
    payouts: state.payouts
      .filter((p) => p.cycleId === id)
      .map((p) => {
        const acc = state.accounts.find((a) => a.id === p.accountId);
        return {
          id: p.id,
          userId: p.userId,
          ...nameOf(db, p.userId),
          amountThb: p.amountThb,
          earningCount: p.earningCount,
          status: p.status,
          accountKind: p.accountKind,
          bankCode: p.bankCode,
          accountLast4: p.accountLast4,
          accountName: p.accountName,
          // The full number only while the transfer is owed.
          accountNumber: p.status === 'pending' ? (acc?.number ?? '') : '',
          transferRef: p.transferRef,
          slipUrl: p.slipUrl,
          paidAt: p.paidAt,
        };
      }),
  };
}

export function moveCycle(db: MockDb, id: string, cutoffDate: string, rawReason: string) {
  const state = payoutStateOf(db);
  const reason = rawReason.trim();
  if (!reason) throw new ApiError(400, 'ต้องกรอกเหตุผลที่เลื่อนรอบ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw new ApiError(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
  const cycle = findCycle(state, id);
  if (cycle.status !== 'open') throw new ApiError(409, 'รอบนี้ปิดไปแล้ว');
  if (cutoffDate >= cycle.cutoffDate) throw new ApiError(400, 'เลื่อนรอบได้เฉพาะให้เร็วขึ้นเท่านั้น');
  if (cutoffDate < today()) throw new ApiError(400, 'วันปิดยอดต้องไม่อยู่ในอดีต');
  cycle.cutoffDate = cutoffDate;
  cycle.dueDate = payoutDueDate(cutoffDate);
  cycle.movedReason = reason;
  return toCycle(state, cycle);
}

/** Verified creator + verified account + at least the minimum; everyone else rolls over. */
export function closeCycle(db: MockDb, id: string): CycleDetail {
  const state = payoutStateOf(db);
  const cycle = findCycle(state, id);
  if (cycle.status !== 'open') throw new ApiError(409, 'รอบนี้ปิดไปแล้ว');
  sweepHeld(db);

  const byUser = new Map<string, MockEarningRow[]>();
  for (const row of state.earnings.filter((r) => r.status === 'payable')) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }
  for (const [userId, rows] of byUser) {
    if (!isVerified(db, userId)) continue;
    const acc = currentAccount(state, userId);
    if (!acc || acc.status !== 'verified') continue;
    const total = round2(rows.reduce((n, r) => n + r.amountThb, 0));
    if (total < MINIMUM_PAYOUT_THB) continue;

    const payout: MockPayout = {
      id: newId('po'),
      userId,
      cycleId: cycle.id,
      periodStart: addDays(cycle.cutoffDate, -PAYOUT_CYCLE_DAYS + 1),
      periodEnd: cycle.cutoffDate,
      amountThb: total,
      earningCount: rows.length,
      status: 'pending',
      accountId: acc.id,
      accountKind: acc.kind,
      bankCode: acc.bankCode,
      accountLast4: last4(acc.number),
      accountName: acc.accountName,
      transferRef: '',
      slipUrl: null,
      paidAt: null,
    };
    state.payouts.push(payout);
    for (const row of rows) {
      traceTransition(db, row.id, 'in_payout', 'นับเข้ารอบ', cycle.id);
      row.status = 'in_payout';
      row.payoutId = payout.id;
    }
  }
  cycle.status = 'closed';
  cycle.closedAt = now();
  ensureCycles(state);
  return cycleDetail(db, cycle.id);
}

export function markPaid(db: MockDb, payoutId: string, rawRef: string, slipUrl: string | null) {
  const state = payoutStateOf(db);
  const payout = state.payouts.find((p) => p.id === payoutId);
  if (!payout) throw new ApiError(404, 'ไม่พบรายการโอนนี้');
  if (payout.status !== 'pending') throw new ApiError(409, 'รายการนี้บันทึกโอนไปแล้ว');
  const ref = rawRef.trim();
  if (!ref) throw new ApiError(400, 'กรอกเลขอ้างอิงการโอน');

  payout.status = 'paid';
  payout.transferRef = ref;
  payout.paidAt = now();
  if (slipUrl) payout.slipUrl = slipUrl;
  for (const row of state.earnings.filter((r) => r.payoutId === payoutId && r.status === 'in_payout')) {
    traceTransition(db, row.id, 'paid', 'โอนแล้ว', ref);
    row.status = 'paid';
  }
  notify(
    db,
    payout.userId,
    'payout_paid',
    `โอนรายได้ ฿${payout.amountThb.toLocaleString('th-TH')} ให้แล้ว`,
    `เข้าบัญชีลงท้าย ${payout.accountLast4} · เลขอ้างอิง ${ref}`,
    '/profile',
  );
  return { status: payout.status };
}

/* ------------------------------------------------------------ KYC review -- */

function row(db: MockDb, v: MockVerification): KycQueueRow {
  const acc = currentAccount(payoutStateOf(db), v.userId);
  return {
    id: v.id,
    userId: v.userId,
    ...nameOf(db, v.userId),
    status: v.status,
    legalType: v.legalType,
    legalName: v.legalName,
    accountName: acc?.accountName ?? '',
    submittedAt: v.submittedAt,
    sharedAccounts: acc ? sharedWith(db, acc).length : 0,
  };
}

export function kycQueue(db: MockDb, status: VerificationStatus = 'submitted'): KycQueueRow[] {
  return payoutStateOf(db)
    .verifications.filter((v) => v.status === status)
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
    .map((v) => row(db, v));
}

function findVerification(db: MockDb, id: string) {
  const v = payoutStateOf(db).verifications.find((o) => o.id === id);
  if (!v) throw new ApiError(404, 'ไม่พบคำขอนี้');
  return v;
}

export function kycDetail(db: MockDb, id: string): KycDetail {
  const v = findVerification(db, id);
  const acc = currentAccount(payoutStateOf(db), v.userId);
  audit(db, v, 'kyc.view', '', null, null);
  return {
    ...row(db, v),
    phone: v.phone,
    phoneVerified: Boolean(v.phoneVerifiedAt),
    email: v.email,
    emailVerified: Boolean(v.emailVerifiedAt),
    idNumber: v.idNumber,
    idCardUrl: v.hasIdCard ? v.idCardUrl || SAMPLE_ID_CARD : null,
    selfieUrl: v.hasSelfie ? v.selfieUrl || SAMPLE_SELFIE : null,
    account: acc ? toAdminAccount(db, acc) : null,
    rejectedSteps: [...v.rejectedSteps],
    rejectReason: v.rejectReason,
    reviewedAt: v.reviewedAt,
    history: structuredClone(v.history),
  };
}

export function approveKyc(db: MockDb, id: string) {
  const v = findVerification(db, id);
  if (v.status !== 'submitted') throw new ApiError(409, 'คำขอนี้ไม่ได้อยู่ในคิวตรวจ');
  const at = now();
  v.status = 'approved';
  v.reviewedAt = at;
  v.rejectedSteps = [];
  v.rejectReason = '';
  const acc = currentAccount(payoutStateOf(db), v.userId);
  if (acc) {
    acc.status = 'verified';
    acc.rejectReason = '';
  }
  setVerified(db, v.userId, at);
  audit(db, v, 'kyc.approve', '', 'submitted', 'approved');
  notify(
    db,
    v.userId,
    'kyc',
    'ยืนยันตัวตนผ่านแล้ว',
    'โปรไฟล์ของคุณได้ป้ายยืนยันตัวตนแล้ว และรายได้จะเข้ารอบโอนถัดไป',
    '/profile',
  );
}

export function rejectKyc(db: MockDb, id: string, steps: string[], rawReason: string) {
  const reason = rawReason.trim();
  if (!reason || steps.length === 0) throw new ApiError(400, 'เลือกขั้นที่ไม่ผ่านและกรอกเหตุผล');
  if (steps.some((s) => !KYC_STEPS.includes(s as Step))) throw new ApiError(400, 'ขั้นที่เลือกไม่ถูกต้อง');
  const v = findVerification(db, id);
  if (v.status !== 'submitted') throw new ApiError(409, 'คำขอนี้ไม่ได้อยู่ในคิวตรวจ');
  v.status = 'rejected';
  v.rejectedSteps = steps as Step[];
  v.rejectReason = reason;
  v.reviewedAt = now();
  if (steps.includes('account')) {
    const acc = currentAccount(payoutStateOf(db), v.userId);
    if (acc) {
      acc.status = 'rejected';
      acc.rejectReason = reason;
    }
  }
  audit(db, v, 'kyc.reject', reason, null, steps);
  notify(
    db,
    v.userId,
    'kyc',
    `ยืนยันตัวตนยังไม่ผ่าน — แก้ ${steps.map((s) => KYC_STEP_LABEL[s as Step]).join(', ')}`,
    reason,
    '/profile/verify',
  );
}

export function revokeKyc(db: MockDb, id: string, rawReason: string) {
  const reason = rawReason.trim();
  if (!reason) throw new ApiError(400, 'ต้องกรอกเหตุผล');
  const v = findVerification(db, id);
  if (v.status !== 'approved') throw new ApiError(409, 'ถอนได้เฉพาะคนที่ยืนยันตัวตนแล้ว');
  v.status = 'revoked';
  v.rejectReason = reason;
  v.reviewedAt = now();
  setVerified(db, v.userId, null);
  audit(db, v, 'kyc.revoke', reason, 'approved', 'revoked');
  notify(db, v.userId, 'kyc', 'สถานะยืนยันตัวตนถูกระงับ', reason, '/profile/verify');
}

export function pendingAccountChanges(db: MockDb): PendingAccountChange[] {
  const state = payoutStateOf(db);
  return state.accounts
    .filter(
      (a) =>
        a.status === 'pending' &&
        state.verifications.some((v) => v.userId === a.userId && v.status === 'approved'),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((a) => ({
      ...toAdminAccount(db, a),
      userId: a.userId,
      name: nameOf(db, a.userId).name,
      legalName: state.verifications.find((v) => v.userId === a.userId)?.legalName ?? '',
      createdAt: a.createdAt,
    }));
}

function findAccount(db: MockDb, id: string) {
  const acc = payoutStateOf(db).accounts.find((a) => a.id === id);
  if (!acc) throw new ApiError(404, 'ไม่พบบัญชีนี้');
  if (acc.status !== 'pending') throw new ApiError(409, 'บัญชีนี้ตรวจไปแล้ว');
  return acc;
}

export function verifyAccount(db: MockDb, id: string) {
  const acc = findAccount(db, id);
  acc.status = 'verified';
  notify(
    db,
    acc.userId,
    'kyc',
    'บัญชีรับเงินใหม่ใช้ได้แล้ว',
    `รายได้รอบถัดไปจะโอนเข้าบัญชีลงท้าย ${last4(acc.number)}`,
    '/profile',
  );
}

export function rejectAccount(db: MockDb, id: string, rawReason: string) {
  const reason = rawReason.trim();
  if (!reason) throw new ApiError(400, 'ต้องกรอกเหตุผล');
  const acc = findAccount(db, id);
  acc.status = 'rejected';
  acc.rejectReason = reason;
  notify(db, acc.userId, 'kyc', 'บัญชีรับเงินใหม่ยังใช้ไม่ได้', reason, '/profile/verify');
}
