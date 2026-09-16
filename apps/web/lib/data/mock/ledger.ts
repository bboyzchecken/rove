import { ApiError } from '@/lib/api-client';

import type {
  AdminAuditEntry,
  EconomySettings,
  LedgerAdjustInput,
  LedgerFlag,
  TraceEarning,
  TraceNode,
  TraceResult,
  TraceType,
} from '../types';
import type { MockDb } from './db';

/**
 * The evidence chain, mock half (Feedback #4 — F12).
 *
 * There is no webhook in the browser, so the chain is a seeded example rather
 * than something the demo writes as it goes: a publish, a copy of it, a
 * booking from the copy that the partner confirmed — with the creator's
 * earning and the booker's credit hanging off it — plus one pre-ledger row
 * and one booking cancelled after its earning was already paid (D-36). It is
 * enough to exercise every part of the admin trace screen.
 */

export interface MockLedger {
  nodes: TraceNode[];
  flags: LedgerFlag[];
  economy: { creatorSharePercent: number; bookerCreditPercent: number };
  audit: AdminAuditEntry[];
}

/** `domain.Default*` / `domain.Max*` on the API. */
const ECONOMY_LIMITS = {
  defaultCreatorSharePercent: 15,
  defaultBookerCreditPercent: 8,
  maxCreatorSharePercent: 50,
  maxBookerCreditPercent: 20,
};

const PEOPLE: Record<string, { id: string; name: string; handle: string }> = {
  m1: { id: 'm1', name: 'ตอง', handle: 'tong' },
  m2: { id: 'm2', name: 'มายด์', handle: 'mind' },
};

const DEMO_TRIP = { id: 'demo', title: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569', archived: false, missing: false };
const COPY_TRIP = {
  id: 'trip-mind-copy',
  title: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569 (คัดลอก)',
  archived: false,
  missing: false,
};

function node(partial: Partial<TraceNode> & Pick<TraceNode, 'id' | 'kind' | 'occurredAt'>): TraceNode {
  return {
    parentId: null,
    actorUserId: null,
    subjectType: 'trip',
    subjectId: DEMO_TRIP.id,
    bookingId: null,
    snapshot: {},
    matched: false,
    legacy: false,
    trips: [],
    points: [],
    earnings: [],
    codes: [],
    flags: [],
    ...partial,
  };
}

function seedLedger(): MockLedger {
  const flag: LedgerFlag = {
    id: 'flag-bcom-cancel',
    subjectType: 'earning',
    subjectId: 'earn-bcom',
    reason: 'การจองถูกยกเลิกหลังโอนรายได้ไปแล้ว',
    createdAt: '2026-08-25T08:10:00.000Z',
    resolvedAt: null,
    resolution: '',
  };

  const nodes: TraceNode[] = [
    node({
      id: 'vs-publish',
      kind: 'publish',
      actorUserId: 'm1',
      occurredAt: '2026-07-19T12:00:00.000Z',
      snapshot: { owner: PEOPLE.m1, trip: { ...DEMO_TRIP, visibility: 'public' }, points: 500 },
      trips: [DEMO_TRIP],
      points: [
        {
          id: 'pb-1',
          userId: 'm1',
          delta: 500,
          reason: 'trip_published',
          note: `เปิดทริป "${DEMO_TRIP.title}" เป็นสาธารณะ`,
          reversesId: null,
          occurredAt: '2026-07-19T12:00:00.000Z',
        },
      ],
    }),
    node({
      id: 'vs-bcom-confirmed',
      kind: 'partner_confirmed',
      subjectType: 'booking_click',
      subjectId: 'clk-bcom',
      bookingId: 'bk-bcom',
      occurredAt: '2026-07-18T11:40:00.000Z',
      snapshot: {
        partner: 'Booking.com',
        tracking_id: 'rv-2b9q4',
        booking_value_thb: 62_000,
        commission_thb: 2_480,
        creator_share_percent: 15,
        creator: PEOPLE.m1,
      },
      trips: [DEMO_TRIP],
      earnings: [
        {
          id: 'earn-bcom',
          userId: 'm1',
          amountThb: 372,
          sharePercent: 15,
          status: 'paid',
          reversesId: null,
          occurredAt: '2026-07-18T11:40:00.000Z',
          events: [
            event('', 'pending', null, 'พาร์ตเนอร์ยืนยันการจอง', 'BC-771204', '2026-07-18T11:40:00.000Z'),
            event('pending', 'payable', 'm1', 'กระทบยอดกับใบแจ้งยอดพาร์ตเนอร์', 'STMT-2026-07', '2026-07-31T09:00:00.000Z'),
            event('payable', 'in_payout', 'm1', 'นับเข้ารอบ', 'CYCLE-2026-08-04', '2026-08-04T02:00:00.000Z'),
            event('in_payout', 'paid', 'm1', 'โอนแล้ว', 'TRF-88213', '2026-08-05T03:00:00.000Z'),
          ],
        },
      ],
    }),
    node({
      id: 'vs-bcom-cancelled',
      kind: 'partner_cancelled',
      parentId: 'vs-bcom-confirmed',
      subjectType: 'booking_click',
      subjectId: 'clk-bcom',
      bookingId: 'bk-bcom',
      occurredAt: '2026-08-25T08:10:00.000Z',
      snapshot: { partner: 'Booking.com', tracking_id: 'rv-2b9q4', reason: 'ผู้จองยกเลิกกับพาร์ตเนอร์' },
      trips: [DEMO_TRIP],
      flags: [flag],
    }),
    node({
      id: 'vs-legacy-booking',
      kind: 'legacy',
      legacy: true,
      actorUserId: 'm1',
      occurredAt: '2026-08-12T09:22:00.000Z',
      snapshot: { note: 'มีคนจองที่พักจากทริปนี้', trip_title: DEMO_TRIP.title },
      trips: [DEMO_TRIP],
      points: [
        {
          id: 'pt-2',
          userId: 'm1',
          delta: 480,
          reason: 'booking_confirmed',
          note: 'มีคนจองที่พักจากทริปนี้',
          reversesId: null,
          occurredAt: '2026-08-12T09:22:00.000Z',
        },
      ],
    }),
    node({
      id: 'vs-clone',
      kind: 'clone',
      actorUserId: 'm2',
      subjectId: COPY_TRIP.id,
      occurredAt: '2026-08-14T21:40:00.000Z',
      snapshot: {
        cloner: PEOPLE.m2,
        source_trip: { id: DEMO_TRIP.id, title: DEMO_TRIP.title, owner: PEOPLE.m1 },
        copy_trip: { id: COPY_TRIP.id, title: COPY_TRIP.title },
        points: 260,
      },
      trips: [DEMO_TRIP, COPY_TRIP],
      points: [
        {
          id: 'pt-1',
          userId: 'm1',
          delta: 260,
          reason: 'trip_cloned',
          note: 'มีคนคัดลอกทริป',
          reversesId: null,
          occurredAt: '2026-08-14T21:40:00.000Z',
        },
      ],
    }),
    node({
      id: 'vs-click',
      kind: 'booking_click',
      parentId: 'vs-clone',
      actorUserId: 'm2',
      subjectType: 'booking_click',
      subjectId: 'clk-agoda',
      bookingId: 'bk-agoda-shinjuku',
      occurredAt: '2026-08-20T10:02:00.000Z',
      snapshot: {
        partner: 'Agoda',
        tracking_id: 'rv-8f2k1',
        booker: PEOPLE.m2,
        booking: { id: 'bk-agoda-shinjuku', title: 'Shinjuku Granbell Hotel — ห้องคู่ 2 เตียง' },
        trip: { id: COPY_TRIP.id, title: COPY_TRIP.title },
      },
      trips: [COPY_TRIP],
    }),
    node({
      id: 'vs-confirmed',
      kind: 'partner_confirmed',
      parentId: 'vs-click',
      subjectType: 'booking_click',
      subjectId: 'clk-agoda',
      bookingId: 'bk-agoda-shinjuku',
      occurredAt: '2026-08-22T06:15:00.000Z',
      snapshot: {
        partner: 'Agoda',
        tracking_id: 'rv-8f2k1',
        booking_value_thb: 48_000,
        commission_thb: 2_400,
        creator_share_percent: 15,
        booker_credit_percent: 8,
        creator: PEOPLE.m1,
        booker: PEOPLE.m2,
      },
      trips: [COPY_TRIP],
      earnings: [
        {
          id: 'earn-agoda',
          userId: 'm1',
          amountThb: 360,
          sharePercent: 15,
          status: 'payable',
          reversesId: null,
          occurredAt: '2026-08-22T06:15:00.000Z',
          events: [
            event('', 'pending', null, 'พาร์ตเนอร์ยืนยันการจอง', 'AG-583920', '2026-08-22T06:15:00.000Z'),
            event('pending', 'payable', 'm1', 'กระทบยอดกับใบแจ้งยอดพาร์ตเนอร์', 'STMT-2026-08', '2026-08-31T09:00:00.000Z'),
          ],
        },
      ],
    }),
    node({
      id: 'vs-booker-credit',
      kind: 'booker_credit',
      parentId: 'vs-confirmed',
      subjectType: 'discount_code',
      subjectId: 'code-agoda',
      bookingId: 'bk-agoda-shinjuku',
      occurredAt: '2026-08-22T06:15:01.000Z',
      snapshot: { booker: PEOPLE.m2, amount_thb: 163, booker_credit_percent: 8 },
      codes: [
        {
          id: 'code-agoda',
          code: 'ROVE-K7M2QX',
          userId: 'm2',
          amountThb: 163,
          usedAt: null,
          voidedAt: null,
        },
      ],
    }),
  ];

  return {
    nodes,
    flags: [flag],
    economy: {
      creatorSharePercent: ECONOMY_LIMITS.defaultCreatorSharePercent,
      bookerCreditPercent: ECONOMY_LIMITS.defaultBookerCreditPercent,
    },
    audit: [],
  };
}

function event(
  from: string,
  to: string,
  actorId: string | null,
  reason: string,
  ref: string,
  occurredAt: string,
) {
  return { from, to, actorId, reason, ref, occurredAt };
}

/** Seeds on first read. Call inside `mutate` when the result is written to. */
export function ledgerOf(db: MockDb): MockLedger {
  db.ledger ??= seedLedger();
  return db.ledger;
}

/** Whether points or money trace back to this trip — the D-18 rule behind a 409. */
export function tripTied(db: MockDb, tripId: string): boolean {
  const record = db.trips.find((t) => t.trip.id === tripId);
  return (
    db.pointsLedger.some((row) => row.tripId === tripId) ||
    ledgerOf(db).nodes.some((n) => n.trips.some((t) => t.id === tripId)) ||
    (record?.share.cloneCount ?? 0) > 0 ||
    (record?.bookings.some((b) => b.tied) ?? false)
  );
}

const NOT_FOUND: Record<TraceType, string> = {
  user: 'ไม่พบผู้ใช้นี้ในสายหลักฐาน',
  points: 'ไม่พบแถวแต้มนี้',
  earning: 'ไม่พบรายได้นี้',
  booking: 'ไม่พบหลักฐานของการจองนี้',
  click: 'ไม่พบหลักฐานของ tracking id นี้',
  trip: 'ไม่พบหลักฐานของทริปนี้',
  code: 'ไม่พบโค้ดนี้',
  source: 'ไม่พบหลักฐานต้นทาง',
};

function matches(n: TraceNode, type: TraceType, raw: string): boolean {
  const q = raw.trim();
  switch (type) {
    case 'source':
      return n.id === q;
    case 'points':
      return n.points.some((row) => row.id === q);
    case 'earning':
      return n.earnings.some((row) => row.id === q);
    case 'booking':
      return n.bookingId === q;
    case 'click':
      return (
        (n.subjectType === 'booking_click' && n.subjectId === q) || n.snapshot.tracking_id === q
      );
    case 'trip':
      return n.trips.some((t) => t.id === q);
    case 'code':
      return n.codes.some((c) => c.id === q || c.code === q.toUpperCase());
    case 'user': {
      const handle = q.replace(/^@/, '');
      const userId = Object.values(PEOPLE).find((p) => p.handle === handle)?.id ?? q;
      return (
        n.actorUserId === userId ||
        n.points.some((row) => row.userId === userId) ||
        n.earnings.some((row) => row.userId === userId)
      );
    }
  }
}

/** Up to the root and down to every descendant — what `handleAdminTrace` walks. */
export function traceIn(ledger: MockLedger, type: TraceType, query: string): TraceResult {
  if (!query.trim()) throw new ApiError(400, 'ใส่สิ่งที่ต้องการไล่ที่มา');
  const seeds = ledger.nodes.filter((n) => matches(n, type, query));
  if (seeds.length === 0) throw new ApiError(400, NOT_FOUND[type]);

  const byId = new Map(ledger.nodes.map((n) => [n.id, n]));
  const include = new Set(seeds.map((n) => n.id));

  for (const seed of seeds) {
    let parent = seed.parentId ? byId.get(seed.parentId) : undefined;
    while (parent && !include.has(parent.id)) {
      include.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of ledger.nodes) {
      if (n.parentId && include.has(n.parentId) && !include.has(n.id)) {
        include.add(n.id);
        grew = true;
      }
    }
  }

  const matched = new Set(seeds.map((n) => n.id));
  const openFlags = new Map(ledger.flags.map((f) => [f.id, f]));
  return {
    type,
    query,
    nodes: ledger.nodes
      .filter((n) => include.has(n.id))
      .map((n) => ({
        ...structuredClone(n),
        matched: matched.has(n.id),
        flags: n.flags.map((f) => structuredClone(openFlags.get(f.id) ?? f)),
      }))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  };
}

function audit(
  ledger: MockLedger,
  actor: { id: string; name: string },
  entry: Omit<AdminAuditEntry, 'id' | 'actorId' | 'actorName' | 'occurredAt'>,
) {
  ledger.audit.unshift({
    ...entry,
    id: `audit_${Date.now().toString(36)}${ledger.audit.length}`,
    actorId: actor.id,
    actorName: actor.name,
    occurredAt: new Date().toISOString(),
  });
}

function resolveFlagIn(
  ledger: MockLedger,
  flagId: string,
  resolution: string,
): LedgerFlag | null {
  const flag = ledger.flags.find((f) => f.id === flagId);
  if (!flag) throw new ApiError(404, 'ไม่พบรายการนี้');
  if (flag.resolvedAt) return null;
  flag.resolvedAt = new Date().toISOString();
  flag.resolution = resolution;
  return flag;
}

export function resolveFlag(
  ledger: MockLedger,
  actor: { id: string; name: string },
  flagId: string,
  rawResolution: string,
) {
  const resolution = rawResolution.trim();
  if (!resolution) throw new ApiError(400, 'ต้องกรอกว่าตัดสินอย่างไร');
  if (!resolveFlagIn(ledger, flagId, resolution)) {
    throw new ApiError(409, 'รายการนี้ถูกตัดสินไปแล้ว');
  }
  audit(ledger, actor, {
    action: 'flag.resolve',
    targetType: 'ledger_flag',
    targetId: flagId,
    reason: resolution,
    before: null,
    after: null,
  });
}

/**
 * The D-20 correction: a new admin_adjustment node under the row it corrects,
 * carrying the reversing row. Returns the points delta for the signed-in user,
 * if any, so the caller can keep their own ledger in step.
 */
export function adjustIn(
  ledger: MockLedger,
  actor: { id: string; name: string },
  input: LedgerAdjustInput,
): { sourceId: string; ownPoints: { delta: number; tripId: string | null } | null } {
  const reason = input.reason.trim();
  if (!reason) throw new ApiError(400, 'ต้องกรอกเหตุผลที่แก้ยอด');
  if (!input.amount || !Number.isFinite(input.amount)) {
    throw new ApiError(400, 'ยอดที่แก้ต้องไม่เป็นศูนย์');
  }

  const now = new Date().toISOString();
  const sourceId = `vs_adj_${Date.now().toString(36)}${ledger.nodes.length}`;
  const base = {
    admin: { id: actor.id, name: actor.name },
    reason,
    reference: input.reference ?? '',
    amount: input.amount,
    target_type: input.targetType,
    target_id: input.targetId,
  };
  let ownPoints: { delta: number; tripId: string | null } | null = null;

  if (input.targetType === 'points') {
    const parent = ledger.nodes.find((n) => n.points.some((row) => row.id === input.targetId));
    const target = parent?.points.find((row) => row.id === input.targetId);
    if (!parent || !target) throw new ApiError(404, 'ไม่พบแถวแต้มนี้');
    if (!Number.isInteger(input.amount)) throw new ApiError(400, 'แต้มต้องเป็นจำนวนเต็ม');

    ledger.nodes.push(
      node({
        id: sourceId,
        kind: 'admin_adjustment',
        parentId: parent.id,
        actorUserId: actor.id,
        subjectType: 'points',
        subjectId: target.id,
        occurredAt: now,
        snapshot: {
          ...base,
          target_before: { user_id: target.userId, delta: target.delta, reason: target.reason },
        },
        trips: parent.trips,
        points: [
          {
            id: `pt_adj_${Date.now().toString(36)}`,
            userId: target.userId,
            delta: input.amount,
            reason: 'adjustment',
            note: reason,
            reversesId: target.id,
            occurredAt: now,
          },
        ],
      }),
    );
    if (target.userId === actor.id) {
      ownPoints = { delta: input.amount, tripId: parent.trips[0]?.id ?? null };
    }
  } else {
    const parent = ledger.nodes.find((n) => n.earnings.some((row) => row.id === input.targetId));
    const target = parent?.earnings.find((row) => row.id === input.targetId);
    if (!parent || !target) throw new ApiError(404, 'ไม่พบรายได้นี้');

    const fullReversal =
      input.amount === -target.amountThb &&
      (target.status === 'pending' || target.status === 'payable');
    const earnings: TraceEarning[] = fullReversal
      ? []
      : [
          {
            id: `earn_adj_${Date.now().toString(36)}`,
            userId: target.userId,
            amountThb: Math.round(input.amount * 100) / 100,
            sharePercent: target.sharePercent,
            status: 'payable',
            reversesId: target.id,
            occurredAt: now,
            events: [],
          },
        ];

    ledger.nodes.push(
      node({
        id: sourceId,
        kind: 'admin_adjustment',
        parentId: parent.id,
        actorUserId: actor.id,
        subjectType: 'earning',
        subjectId: target.id,
        occurredAt: now,
        snapshot: {
          ...base,
          target_before: {
            user_id: target.userId,
            amount_thb: target.amountThb,
            status: target.status,
          },
        },
        trips: parent.trips,
        earnings,
      }),
    );
    if (fullReversal) {
      target.events.push(event(target.status, 'reversed', actor.id, reason, sourceId, now));
      target.status = 'reversed';
    }
  }

  if (input.flagId) resolveFlagIn(ledger, input.flagId, `แก้ยอดแล้ว: ${reason}`);
  audit(ledger, actor, {
    action: 'ledger.adjust',
    targetType: input.targetType,
    targetId: input.targetId,
    reason,
    before: null,
    after: base,
  });
  return { sourceId, ownPoints };
}

export function economyOf(ledger: MockLedger): EconomySettings {
  return { ...ledger.economy, ...ECONOMY_LIMITS };
}

export function setEconomyIn(
  ledger: MockLedger,
  actor: { id: string; name: string },
  input: { creatorSharePercent: number; bookerCreditPercent: number; reason?: string },
): EconomySettings {
  const { creatorSharePercent: creator, bookerCreditPercent: booker } = input;
  if (!Number.isInteger(creator) || creator < 0 || creator > ECONOMY_LIMITS.maxCreatorSharePercent) {
    throw new ApiError(400, `ส่วนแบ่งครีเอเตอร์ต้องอยู่ระหว่าง 0–${ECONOMY_LIMITS.maxCreatorSharePercent}%`);
  }
  if (!Number.isInteger(booker) || booker < 0 || booker > ECONOMY_LIMITS.maxBookerCreditPercent) {
    throw new ApiError(400, `เครดิตคืนผู้จองต้องอยู่ระหว่าง 0–${ECONOMY_LIMITS.maxBookerCreditPercent}%`);
  }
  // Snake case, like the API's `domain.Economy` JSON the audit row stores.
  const wire = (e: MockLedger['economy']) => ({
    creator_share_percent: e.creatorSharePercent,
    booker_credit_percent: e.bookerCreditPercent,
  });
  const before = wire(ledger.economy);
  ledger.economy = { creatorSharePercent: creator, bookerCreditPercent: booker };
  audit(ledger, actor, {
    action: 'settings.economy',
    targetType: 'app_settings',
    targetId: 'economy',
    reason: input.reason?.trim() ?? '',
    before,
    after: wire(ledger.economy),
  });
  return economyOf(ledger);
}
