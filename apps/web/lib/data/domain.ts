import type {
  AvailabilityEntry,
  BudgetLine,
  BudgetSummary,
  CoverageSummary,
  DateWindow,
  ExpenseEntry,
  ExpenseSummary,
  Member,
  PlanDay,
  Settlement,
  WishlistItem,
} from './types';

/**
 * Pure domain rules shared by the whole front end.
 *
 * Everything here has a twin in the Go API (`pkg/domain/*.go`) and must agree
 * with it to the baht: mock mode computes locally, live mode receives the same
 * numbers from the server, and a UAT tester must not be able to tell which one
 * produced the screen they are looking at.
 */

/* ----------------------------------------------------------------- dates -- */

export function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function daysBetween(startIso: string, endIso: string) {
  const start = parseIsoDate(startIso).getTime();
  const end = parseIsoDate(endIso).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function daysInMonth(monthIso: string) {
  const d = parseIsoDate(monthIso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Day-of-week of the 1st, 0 = Sunday — what the calendar grid pads with. */
export function monthStartDow(monthIso: string) {
  const d = parseIsoDate(monthIso);
  return new Date(d.getFullYear(), d.getMonth(), 1).getDay();
}

export function monthDates(monthIso: string) {
  const d = parseIsoDate(monthIso);
  const total = daysInMonth(monthIso);
  const out: string[] = [];
  for (let i = 1; i <= total; i++) {
    out.push(toIsoDate(new Date(d.getFullYear(), d.getMonth(), i)));
  }
  return out;
}

export function isWeekend(iso: string) {
  const dow = parseIsoDate(iso).getDay();
  return dow === 0 || dow === 6;
}

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export function thaiMonthLabel(monthIso: string) {
  const d = parseIsoDate(monthIso);
  return `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "4–8 ธ.ค." / "28 ธ.ค. – 2 ม.ค." */
export function thaiRangeLabel(startIso: string, endIso: string) {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) return `${s.getDate()}–${e.getDate()} ${THAI_MONTHS_SHORT[e.getMonth()]}`;
  return `${s.getDate()} ${THAI_MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${THAI_MONTHS_SHORT[e.getMonth()]}`;
}

/* --------------------------------------------------- availability windows -- */

export interface WindowOptions {
  /** Shortest window worth suggesting. */
  minDays?: number;
  /** How many suggestions to return. */
  limit?: number;
}

interface DayMarks {
  free: Set<string>;
  maybe: Set<string>;
}

function indexEntries(entries: AvailabilityEntry[]) {
  const byDate = new Map<string, DayMarks>();
  for (const entry of entries) {
    let marks = byDate.get(entry.date);
    if (!marks) {
      marks = { free: new Set(), maybe: new Set() };
      byDate.set(entry.date, marks);
    }
    if (entry.mark === 'free') marks.free.add(entry.memberId);
    else if (entry.mark === 'maybe') marks.maybe.add(entry.memberId);
  }
  return byDate;
}

/** Members free on `date`, and members who are free-or-maybe on it. */
export function availabilityOn(entries: AvailabilityEntry[], date: string) {
  const marks = indexEntries(entries).get(date);
  return {
    free: [...(marks?.free ?? [])],
    maybe: [...(marks?.maybe ?? [])],
  };
}

function intersect(a: Set<string>, b: Set<string>) {
  const out = new Set<string>();
  for (const value of a) if (b.has(value)) out.add(value);
  return out;
}

function windowScore(days: number, freeCount: number, total: number, startIso: string, endIso: string) {
  const coverage = total === 0 ? 0 : freeCount / total;
  // A 4–6 day window is the sweet spot for the trips this app plans; shorter
  // is cramped, longer starts costing leave days nobody has.
  const lengthFit = days >= 4 && days <= 6 ? 1 : days === 3 || days === 7 ? 0.82 : days < 3 ? 0.5 : 0.7;
  let weekend = 0;
  for (let i = 0; i < days; i++) if (isWeekend(addDays(startIso, i))) weekend += 1;
  const weekendFit = Math.min(weekend, 2) / 2;
  void endIso;
  return Math.round((coverage * 0.6 + lengthFit * 0.28 + weekendFit * 0.12) * 100);
}

function windowReason(days: number, free: string[], maybe: string[], total: number, startIso: string) {
  const parts: string[] = [];
  if (free.length === total) parts.push('ทุกคนว่างครบ');
  else parts.push(`ว่าง ${free.length}/${total} คน`);
  if (maybe.length > 0) parts.push(`${maybe.length} คนไปได้แต่ไม่สะดวก`);

  let weekend = 0;
  for (let i = 0; i < days; i++) if (isWeekend(addDays(startIso, i))) weekend += 1;
  if (weekend >= 2) parts.push('คร่อมเสาร์-อาทิตย์ ลางานน้อยลง');
  if (days >= 4 && days <= 6) parts.push(`${days} วันกำลังพอดีกับทริปต่างประเทศ`);
  return parts.join(' · ');
}

/**
 * Every maximal run of consecutive days that at least two members share, best
 * first. Mirrors `domain.ComputeWindows` in the API.
 */
export function computeWindows(
  entries: AvailabilityEntry[],
  members: Member[],
  options: WindowOptions = {},
): DateWindow[] {
  const minDays = options.minDays ?? 2;
  const limit = options.limit ?? 6;
  const total = members.length;
  if (total === 0 || entries.length === 0) return [];

  const byDate = indexEntries(entries);
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];

  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const span = daysBetween(first, last);

  const candidates: DateWindow[] = [];

  for (let i = 0; i < span; i++) {
    const startIso = addDays(first, i);
    const startMarks = byDate.get(startIso);
    if (!startMarks) continue;

    let free = new Set(startMarks.free);
    let loose = new Set([...startMarks.free, ...startMarks.maybe]);

    for (let j = i; j < span; j++) {
      const endIso = addDays(first, j);
      if (j > i) {
        const marks = byDate.get(endIso);
        if (!marks) break;
        free = intersect(free, marks.free);
        loose = intersect(loose, new Set([...marks.free, ...marks.maybe]));
      }
      if (loose.size < 2) break;

      const days = j - i + 1;
      if (days < minDays) continue;

      const freeIds = [...free];
      const maybeIds = [...loose].filter((id) => !free.has(id));
      if (freeIds.length === 0) continue;

      candidates.push({
        id: `${startIso}_${endIso}`,
        startDate: startIso,
        endDate: endIso,
        days,
        memberIds: freeIds,
        maybeMemberIds: maybeIds,
        everyone: freeIds.length === total,
        score: windowScore(days, freeIds.length, total, startIso, endIso),
        reason: windowReason(days, freeIds, maybeIds, total, startIso),
      });
    }
  }

  // Keep only maximal runs per member-set: a 5-day window makes its own 2-day
  // prefix pointless as a suggestion.
  const kept: DateWindow[] = [];
  const byMembers = new Map<string, DateWindow[]>();

  for (const candidate of [...candidates].sort((a, b) => b.days - a.days)) {
    const key = [...candidate.memberIds].sort().join(',');
    const siblings = byMembers.get(key) ?? [];
    const contained = siblings.some(
      (other) => candidate.startDate >= other.startDate && candidate.endDate <= other.endDate,
    );
    if (contained) continue;
    siblings.push(candidate);
    byMembers.set(key, siblings);
    kept.push(candidate);
  }

  return kept
    .sort((a, b) => b.score - a.score || b.days - a.days || a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}

/** Members free on every day of a range (used by the lock confirmation). */
export function membersFreeInRange(
  entries: AvailabilityEntry[],
  members: Member[],
  startIso: string,
  endIso: string,
) {
  const byDate = indexEntries(entries);
  const days = daysBetween(startIso, endIso);

  const free: Member[] = [];
  const maybe: Member[] = [];

  for (const member of members) {
    let allFree = true;
    let allLoose = true;
    for (let i = 0; i < days; i++) {
      const marks = byDate.get(addDays(startIso, i));
      const isFree = marks?.free.has(member.id) ?? false;
      const isMaybe = marks?.maybe.has(member.id) ?? false;
      if (!isFree) allFree = false;
      if (!isFree && !isMaybe) allLoose = false;
    }
    if (allFree) free.push(member);
    else if (allLoose) maybe.push(member);
  }

  return { free, maybe };
}

/* -------------------------------------------------------------- coverage -- */

export function computeCoverage(wishlist: WishlistItem[]): CoverageSummary {
  const musts = wishlist.filter((w) => w.kind === 'must');
  const covered = wishlist.filter((w) => w.coverage === 'covered').length;
  const partial = wishlist.filter((w) => w.coverage === 'partial').length;
  const uncovered = wishlist.filter((w) => w.coverage === 'uncovered').length;

  return {
    covered,
    partial,
    uncovered,
    total: wishlist.length,
    mustCovered: musts.filter((w) => w.coverage === 'covered').length,
    mustTotal: musts.length,
    percent: wishlist.length === 0 ? 0 : Math.round((covered / wishlist.length) * 100),
  };
}

/** Re-derives each wish's coverage from what the plan actually contains. */
export function recomputeCoverage(wishlist: WishlistItem[], days: PlanDay[]): WishlistItem[] {
  const items = days.flatMap((d) => d.items);
  const itemIds = new Set(items.map((i) => i.id));
  const forMembers = new Map<string, number>();
  for (const item of items) {
    for (const memberId of item.forMembers ?? []) {
      forMembers.set(memberId, (forMembers.get(memberId) ?? 0) + 1);
    }
  }

  return wishlist.map((wish) => {
    if (wish.kind === 'avoid') return { ...wish, coverage: 'covered' as const };
    if (wish.itemId && itemIds.has(wish.itemId)) return { ...wish, coverage: 'covered' as const };
    const titled = items.find((i) => i.title.includes(wish.title) || wish.title.includes(i.title));
    if (titled) return { ...wish, coverage: 'covered' as const, itemId: titled.id };
    return { ...wish, coverage: wish.coverage === 'covered' ? 'partial' : wish.coverage };
  });
}

/* ---------------------------------------------------------------- budget -- */

export function computeBudget(
  lines: BudgetLine[],
  opts: { fxRate: number; fxAsOf: string; budgetPerPersonThb: number; itemsWithoutCost: number },
): BudgetSummary {
  const totalJpy = lines.reduce((sum, line) => sum + line.totalJpy, 0);
  const perPersonJpy = lines.reduce((sum, line) => sum + line.perPersonJpy, 0);
  const prepaidJpy = lines.filter((l) => l.prepaid).reduce((s, l) => s + l.totalJpy, 0);
  const perPersonThb = Math.round(perPersonJpy * opts.fxRate);

  return {
    lines,
    totalJpy,
    perPersonJpy,
    prepaidJpy,
    perPersonThb,
    budgetUsed: opts.budgetPerPersonThb === 0 ? 0 : perPersonThb / opts.budgetPerPersonThb,
    remainingThb: opts.budgetPerPersonThb - perPersonThb,
    itemsWithoutCost: opts.itemsWithoutCost,
    fxRate: opts.fxRate,
    fxAsOf: opts.fxAsOf,
  };
}

/**
 * Rebuilds the budget lines from what the plan items actually cost (A7.1).
 *
 * A category the plan prices — food, tickets, local transport — is taken from
 * the items, because that is the number the group can actually change by
 * editing the plan. Categories the itinerary says nothing about (a hotel paid
 * for months ago, shopping money) keep their manual estimate; dropping them
 * would quietly halve the budget and make the trip look cheaper than it is.
 */
export function budgetFromPlan(
  days: PlanDay[],
  partySize: number,
  manual: BudgetLine[],
): BudgetLine[] {
  const CATEGORY: Record<string, { category: string; icon: string; accent: BudgetLine['accent'] }> = {
    stay: { category: 'ที่พัก', icon: '🏠', accent: 'joyfull' },
    transport: { category: 'เดินทาง', icon: '🚄', accent: 'sky' },
    flight: { category: 'เดินทาง', icon: '🚄', accent: 'sky' },
    meal: { category: 'อาหาร', icon: '🍜', accent: 'primary' },
    poi: { category: 'ตั๋ว/กิจกรรม', icon: '🎟️', accent: 'matcha' },
    free: { category: 'อื่นๆ', icon: '✨', accent: 'joyfull' },
  };

  const fromItems = new Map<string, BudgetLine>();
  for (const day of days) {
    for (const item of day.items) {
      if (!item.costJpy) continue;
      const meta = CATEGORY[item.type] ?? CATEGORY.free!;
      const line = fromItems.get(meta.category) ?? { ...meta, totalJpy: 0, perPersonJpy: 0 };
      line.perPersonJpy += item.costJpy;
      line.totalJpy += item.costJpy * partySize;
      fromItems.set(meta.category, line);
    }
  }

  // A plan with nothing costed yet keeps the manual estimate as-is, rather
  // than showing a budget of zero — which would read as "this trip is free".
  if (fromItems.size === 0) return manual;

  const untouched = manual.filter((line) => !fromItems.has(line.category));
  return [...fromItems.values(), ...untouched];
}

/* --------------------------------------------------------------- expense -- */

export function toThb(entry: Pick<ExpenseEntry, 'amount' | 'currency'>, fxRate: number) {
  return entry.currency === 'JPY' ? Math.round(entry.amount * fxRate) : entry.amount;
}

export function computeExpenses(
  entries: ExpenseEntry[],
  members: Member[],
  fxRate: number,
  settled: { fromMemberId: string; toMemberId: string }[] = [],
): ExpenseSummary {
  const balance = new Map(members.map((m) => [m.id, 0]));
  const paid = new Map(members.map((m) => [m.id, 0]));
  const owed = new Map(members.map((m) => [m.id, 0]));
  const personal = new Map(members.map((m) => [m.id, 0]));

  let sharedTotal = 0;
  let personalTotal = 0;

  for (const entry of entries) {
    const thb = toThb(entry, fxRate);

    if (entry.scope === 'personal') {
      personalTotal += thb;
      personal.set(entry.paidBy, (personal.get(entry.paidBy) ?? 0) + thb);
      continue;
    }

    sharedTotal += thb;
    paid.set(entry.paidBy, (paid.get(entry.paidBy) ?? 0) + thb);
    balance.set(entry.paidBy, (balance.get(entry.paidBy) ?? 0) + thb);

    const participants = entry.participants.length > 0 ? entry.participants : members.map((m) => m.id);
    const share = thb / participants.length;
    for (const memberId of participants) {
      owed.set(memberId, (owed.get(memberId) ?? 0) + share);
      balance.set(memberId, (balance.get(memberId) ?? 0) - share);
    }
  }

  const perMember = members.map((m) => ({
    member: m,
    paidThb: Math.round(paid.get(m.id) ?? 0),
    shareThb: Math.round(owed.get(m.id) ?? 0),
    personalThb: Math.round(personal.get(m.id) ?? 0),
    balanceThb: Math.round(balance.get(m.id) ?? 0),
  }));

  const settledKeys = new Set(settled.map((s) => `${s.fromMemberId}>${s.toMemberId}`));

  return {
    sharedTotalThb: Math.round(sharedTotal),
    personalTotalThb: Math.round(personalTotal),
    totalThb: Math.round(sharedTotal + personalTotal),
    perMember,
    settlements: settle(perMember).filter(
      (s) => !settledKeys.has(`${s.fromMemberId}>${s.toMemberId}`),
    ),
    entries,
  };
}

/**
 * Greedy netting: repeatedly pay the largest debt to the largest credit. For a
 * group of four this always produces at most three transfers.
 */
export function settle(rows: { member: { id: string }; balanceThb: number }[]): Settlement[] {
  const debtors = rows
    .filter((r) => r.balanceThb < 0)
    .map((r) => ({ id: r.member.id, amount: -r.balanceThb }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = rows
    .filter((r) => r.balanceThb > 0)
    .map((r) => ({ id: r.member.id, amount: r.balanceThb }))
    .sort((a, b) => b.amount - a.amount);

  const out: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount >= 1) {
      out.push({
        fromMemberId: debtor.id,
        toMemberId: creditor.id,
        amountThb: Math.round(amount),
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < 1) i++;
    if (creditor.amount < 1) j++;
  }

  return out;
}

/* ------------------------------------------------------------------ plan -- */

/**
 * Re-runs the checks the editor shows as warnings: an item that starts before
 * the previous one plus its travel time ends, and a stop outside opening hours.
 */
export function validateDays(days: PlanDay[]): PlanDay[] {
  return days.map((day) => ({
    ...day,
    items: day.items.map((item, index) => {
      const previous = day.items[index - 1];
      let warning: string | undefined;

      if (previous?.end && previous.travel) {
        const arrival = addMinutes(previous.end, previous.travel.minutes);
        if (arrival > item.start) {
          warning = `เวลาชนกับ "${previous.title}" — ต้องออกก่อน ${arrival} ถึงจะทัน`;
        }
      }

      if (!warning && item.openHours && item.openHours.includes('–')) {
        const [open, close] = item.openHours.split('–');
        if (open && close && /^\d{2}:\d{2}$/.test(open) && /^\d{2}:\d{2}$/.test(close)) {
          if (item.start < open) warning = `ยังไม่เปิด — เปิด ${open}`;
          else if (item.start > close) warning = `ปิดแล้ว — ปิด ${close}`;
        }
      }

      return { ...item, warning };
    }),
  }));
}

export function addMinutes(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
