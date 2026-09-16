import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';
import { loadDb, resetDb } from '@/lib/data/mock/db';
import { mockRepo } from '@/lib/data/mock/repo';
import { nextPayoutCutoff, normalizeThaiPhone, payoutDueDate, validThaiId } from '@/lib/kyc';

/**
 * Feedback #4 — F11. The rules mirror `apps/api/pkg/domain/payout.go`, and the
 * mock flow has to refuse and allow the same things the API does.
 */

async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

function pngFile(name: string) {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

describe('payout rules', () => {
  it('checks the Thai ID checksum', () => {
    expect(validThaiId('1101700230708')).toBe(true);
    expect(validThaiId('1101700230709')).toBe(false);
    expect(validThaiId('110170023070')).toBe(false);
  });

  it('normalises Thai mobile numbers', () => {
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhone('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiPhone('12345')).toBe('');
  });

  it('adds three working days to a Tuesday cutoff, and skips weekends from a Thursday', () => {
    expect(payoutDueDate('2026-09-29')).toBe('2026-10-02');
    expect(payoutDueDate('2026-10-01')).toBe('2026-10-06');
  });

  it('keeps the fortnightly rhythm from the anchor', () => {
    expect(nextPayoutCutoff('2026-09-22', '2026-09-20')).toBe('2026-09-22');
    expect(nextPayoutCutoff('2026-09-22', '2026-09-23')).toBe('2026-10-06');
    expect(nextPayoutCutoff('2026-09-22', '2026-10-06')).toBe('2026-10-06');
  });
});

beforeEach(() => resetDb());

describe('creator verification in mock mode', () => {
  it('goes from draft to approved, and the badge follows', async () => {
    const v0 = await mockRepo.verification.get();
    expect(v0.status).toBe('draft');
    expect(v0.editableSteps).toEqual(['basic', 'identity', 'documents', 'account']);

    await mockRepo.verification.saveBasic({
      legalType: 'individual',
      legalName: 'ตอง ทดสอบ',
      phone: '081-234-5678',
      email: 'tong@example.com',
    });
    for (const channel of ['phone', 'email'] as const) {
      const sent = await mockRepo.verification.sendOtp(channel);
      expect((await refusal(mockRepo.verification.verifyOtp(channel, '000000x'))).status).toBe(400);
      expect((await refusal(mockRepo.verification.sendOtp(channel))).status).toBe(429);
      await mockRepo.verification.verifyOtp(channel, sent.devCode!);
    }

    expect((await refusal(mockRepo.verification.saveIdentity('1101700230709'))).status).toBe(400);
    await mockRepo.verification.saveIdentity('1101700230708');
    expect((await refusal(mockRepo.verification.submit())).status).toBe(400);

    await mockRepo.verification.uploadDocuments({ idCard: pngFile('card.png'), selfie: pngFile('me.png') });
    const ready = await mockRepo.verification.saveAccount({
      kind: 'bank',
      bankCode: 'KBANK',
      accountNumber: '1234567890',
      accountName: 'ตอง ทดสอบ',
    });
    expect(ready.steps).toEqual({ basic: true, identity: true, documents: true, account: true });

    const submitted = await mockRepo.verification.submit();
    expect(submitted.editableSteps).toEqual([]);
    expect((await refusal(mockRepo.verification.saveIdentity('1101700230708'))).status).toBe(409);

    const [row] = (await mockRepo.admin.kycQueue('submitted')).filter((r) => r.userId === 'm1');
    await mockRepo.admin.rejectKyc(row!.id, ['documents'], 'รูปบัตรไม่ชัด');
    const rejected = await mockRepo.verification.get();
    expect(rejected.editableSteps).toEqual(['documents']);
    expect((await refusal(mockRepo.verification.saveIdentity('1101700230708'))).status).toBe(409);

    await mockRepo.verification.uploadDocuments({ idCard: pngFile('card2.png') });
    await mockRepo.verification.submit();
    await mockRepo.admin.approveKyc(row!.id);

    expect((await mockRepo.auth.me())?.verified).toBe(true);
    expect((await mockRepo.verification.get()).editableSteps).toEqual(['account']);
    expect(loadDb().notifications.some((n) => n.kind === 'kyc')).toBe(true);

    // A verified creator changing where money goes: badge stays, account waits for review.
    const changed = await mockRepo.verification.saveAccount({
      kind: 'promptpay',
      bankCode: '',
      accountNumber: '0812345678',
      accountName: 'ตอง ทดสอบ',
    });
    expect(changed.account?.status).toBe('pending');
    const [pendingAccount] = await mockRepo.admin.pendingAccounts();
    await mockRepo.admin.verifyAccount(pendingAccount!.id);
    expect((await mockRepo.verification.get()).account?.status).toBe('verified');
    expect((await mockRepo.auth.me())?.verified).toBe(true);
  });
});

describe('payout cycles in mock mode', () => {
  it('has no cycle until an anchor Tuesday is set, then pays only who qualifies', async () => {
    const before = await mockRepo.admin.payouts();
    expect(before.anchorDate).toBeNull();
    expect(before.nextCycle).toBeNull();

    // Next Tuesday from today.
    const d = new Date();
    do d.setDate(d.getDate() + 1);
    while (d.getDay() !== 2);
    const tuesday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    expect((await refusal(mockRepo.admin.setPayoutAnchor('2020-01-07'))).status).toBe(400);
    const overview = await mockRepo.admin.setPayoutAnchor(tuesday);
    expect(overview.nextCycle?.cutoffDate).toBe(tuesday);

    const poon = overview.ready.find((r) => r.userId === 'u-poon');
    const mint = overview.ready.find((r) => r.userId === 'u-mint');
    const fah = overview.ready.find((r) => r.userId === 'u-fah');
    expect(poon?.willBePaid).toBe(true);
    expect(mint?.belowMinimum).toBe(true);
    expect(fah?.verified).toBe(false);

    const detail = await mockRepo.admin.closeCycle(overview.nextCycle!.id);
    expect(detail.payouts.map((p) => p.userId)).toEqual(['u-poon']);
    expect(detail.payouts[0]?.accountNumber).toBe('0123456789');

    const after = await mockRepo.admin.payouts();
    expect(after.nextCycle?.cutoffDate).not.toBe(tuesday);

    await mockRepo.admin.markPaid(detail.payouts[0]!.id, { transferRef: 'TRF-1' });
    const paid = await mockRepo.admin.cycle(detail.cycle.id);
    expect(paid.payouts[0]?.status).toBe('paid');
    expect(paid.payouts[0]?.accountNumber).toBe('');
    expect((await refusal(mockRepo.admin.markPaid(detail.payouts[0]!.id, { transferRef: 'X' }))).status).toBe(409);
  });

  it('holds an unverified creator’s income with an expiry and moves reconciled lines to payable', async () => {
    const statement = await mockRepo.rewards.earnings();
    expect(statement.verified).toBe(false);
    expect(statement.held?.count).toBeGreaterThan(0);

    const pending = await mockRepo.admin.payoutEarnings({ status: 'pending' });
    const klook = pending.find((e) => e.id === 'earn-klook')!;
    expect(await mockRepo.admin.reconcile([klook.id], 'STMT-9')).toEqual({ moved: 1 });
    const again = await mockRepo.rewards.earnings();
    expect(again.entries.find((e) => e.id === 'earn-klook')?.status).toBe('payable');
  });
});
