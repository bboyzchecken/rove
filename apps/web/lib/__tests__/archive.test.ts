import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';
import { resetDb } from '@/lib/data/mock/db';
import { mockRepo } from '@/lib/data/mock/repo';

/**
 * Feedback #4 — D-18, D-31 … D-34, D-41 on the mock half, which has to refuse
 * the same things the API refuses or UAT designs around a door that is open.
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

beforeEach(() => resetDb());

describe('archiving a trip', () => {
  it('hides it, answers 410, and restores it private', async () => {
    const trips = await mockRepo.trips.list();
    const target = trips.find((t) => t.role === 'owner' && t.id !== 'demo')!;

    await mockRepo.trips.archive(target.id);
    expect((await mockRepo.trips.list()).some((t) => t.id === target.id)).toBe(false);
    expect((await refusal(mockRepo.trips.get(target.id))).status).toBe(410);

    const archive = await mockRepo.trips.archived();
    expect(archive.map((t) => t.id)).toContain(target.id);

    await mockRepo.trips.restore(target.id);
    expect((await mockRepo.trips.list()).some((t) => t.id === target.id)).toBe(true);
    expect((await mockRepo.share.state(target.id)).visibility).toBe('private');
  });

  it('refuses a delete until archived, and forever when tied', async () => {
    const trips = await mockRepo.trips.list();
    const loose = trips.find((t) => t.role === 'owner' && t.id !== 'demo')!;

    const early = await refusal(mockRepo.trips.remove(loose.id));
    expect(early.archiveConflict).toEqual({ archivable: true, tied: false });

    await mockRepo.trips.archive(loose.id);
    await mockRepo.trips.remove(loose.id);
    expect((await mockRepo.trips.archived()).some((t) => t.id === loose.id)).toBe(false);

    // The demo trip carries points history.
    await mockRepo.trips.archive('demo');
    expect((await mockRepo.trips.archived()).find((t) => t.id === 'demo')?.canDelete).toBe(false);
    const tied = await refusal(mockRepo.trips.remove('demo'));
    expect(tied.archiveConflict).toEqual({ archivable: false, tied: true });
  });
});

describe('archiving a booking', () => {
  it('refuses to delete a partner-confirmed booking and lists it once archived', async () => {
    const [tied] = (await mockRepo.booking.list('demo')).filter((b) => b.tied);
    expect(tied).toBeDefined();

    const error = await refusal(mockRepo.booking.remove('demo', tied!.id));
    expect(error.archiveConflict).toEqual({ archivable: true, tied: true });

    await mockRepo.booking.archive('demo', tied!.id);
    expect((await mockRepo.booking.list('demo')).some((b) => b.id === tied!.id)).toBe(false);
    expect((await mockRepo.booking.archived('demo')).map((b) => b.id)).toEqual([tied!.id]);

    await mockRepo.booking.restore('demo', tied!.id);
    expect((await mockRepo.booking.archived('demo')).length).toBe(0);
  });
});

describe('the admin trace', () => {
  it('walks up to the root and down to the credit from one earning', async () => {
    const result = await mockRepo.admin.trace('earning', 'earn-agoda');
    expect(result.nodes.map((n) => n.kind)).toEqual([
      'clone',
      'booking_click',
      'partner_confirmed',
      'booker_credit',
    ]);
    expect(result.nodes.filter((n) => n.matched).map((n) => n.kind)).toEqual(['partner_confirmed']);
  });

  it('writes an adjustment under the row it corrects, and requires a reason', async () => {
    const blank = await refusal(
      mockRepo.admin.adjust({ targetType: 'earning', targetId: 'earn-agoda', amount: -360, reason: ' ' }),
    );
    expect(blank.status).toBe(400);

    await mockRepo.admin.adjust({
      targetType: 'earning',
      targetId: 'earn-agoda',
      amount: -360,
      reason: 'พาร์ตเนอร์แจ้งยอดผิด',
    });
    const after = await mockRepo.admin.trace('earning', 'earn-agoda');
    expect(after.nodes.some((n) => n.kind === 'admin_adjustment')).toBe(true);
    const earning = after.nodes.flatMap((n) => n.earnings).find((e) => e.id === 'earn-agoda');
    expect(earning?.status).toBe('reversed');
  });

  it('resolves a flag once', async () => {
    const [flag] = await mockRepo.admin.flags(true);
    await mockRepo.admin.resolveFlag(flag!.id, 'หักจากรอบหน้า');
    expect((await refusal(mockRepo.admin.resolveFlag(flag!.id, 'ซ้ำ'))).status).toBe(409);
    expect(await mockRepo.admin.flags(true)).toEqual([]);
  });
});
