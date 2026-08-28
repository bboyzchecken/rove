import type {
  AvailabilityEntry,
  BudgetLine,
  BudgetSummary,
  CoverageSummary,
  DateWindow,
  ExpenseEntry,
  ExpenseSummary,
  Member,
  MemberProfile,
  PlanDay,
  PlanItem,
  Settlement,
  TripConflict,
  VariantMetrics,
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

/** "4 ธ.ค." — one day, the way a boarding pass reads. */
export function thaiDate(iso: string) {
  if (!iso) return '';
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
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
    stay: { category: 'ที่พัก', icon: '🏠', accent: 'pink' },
    transport: { category: 'เดินทาง', icon: '🚄', accent: 'blue' },
    flight: { category: 'เดินทาง', icon: '🚄', accent: 'blue' },
    meal: { category: 'อาหาร', icon: '🍜', accent: 'primary' },
    poi: { category: 'ตั๋ว/กิจกรรม', icon: '🎟️', accent: 'green' },
    free: { category: 'อื่นๆ', icon: '✨', accent: 'pink' },
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
 * Who pays whom, in as few transfers as possible (A16.5).
 *
 * Twin of `Settle` in pkg/domain/expense.go. The greedy pairing everyone
 * writes first — largest debt pays largest credit — is not minimal: two pairs
 * who each owe each other 500 is two transfers, and greedy can make it three.
 * The fix is to find the largest number of subgroups that already settle among
 * themselves, because a group of k people always needs k-1 transfers.
 *
 * The search is exponential, so above SETTLE_EXACT_LIMIT people it falls back
 * to greedy. Twelve is already a large group holiday.
 */
const SETTLE_EXACT_LIMIT = 12;

interface SettleSide {
  id: string;
  amount: number;
}

export function settle(rows: { member: { id: string }; balanceThb: number }[]): Settlement[] {
  const balances = settleBalances(rows);
  if (balances.length === 0) return [];
  if (balances.length > SETTLE_EXACT_LIMIT) return settleGreedy(balances);

  return selfSettlingGroups(balances).flatMap(settleGreedy);
}

/**
 * Whole baht, noise dropped.
 *
 * Rounding each balance can leave the total a baht or two off zero, which would
 * make an exact partition impossible. The remainder is absorbed into the
 * largest balance, where it is invisible, rather than handed to somebody as a
 * phantom debt.
 */
function settleBalances(rows: { member: { id: string }; balanceThb: number }[]): SettleSide[] {
  const sides = rows
    .map((r) => ({ id: r.member.id, amount: Math.round(r.balanceThb) }))
    .filter((s) => s.amount !== 0);
  if (sides.length === 0) return [];

  let total = 0;
  let largest = 0;
  sides.forEach((side, i) => {
    total += side.amount;
    if (Math.abs(side.amount) > Math.abs((sides[largest] as SettleSide).amount)) largest = i;
  });
  (sides[largest] as SettleSide).amount -= total;

  return sides.filter((s) => s.amount !== 0);
}

/** The largest set of subgroups that each sum to zero — one saved transfer each. */
function selfSettlingGroups(balances: SettleSide[]): SettleSide[][] {
  const n = balances.length;
  const full = 1 << n;

  const sums = new Array<number>(full).fill(0);
  for (let mask = 1; mask < full; mask += 1) {
    const low = mask & -mask;
    sums[mask] = (sums[mask ^ low] as number) + (balances[Math.log2(low)] as SettleSide).amount;
  }

  // best[mask] is how many zero-sum groups `mask` splits into, -1 when it
  // cannot be split at all. pick[mask] remembers the group that got there.
  const best = new Array<number>(full).fill(-1);
  const pick = new Array<number>(full).fill(0);
  best[0] = 0;

  for (let mask = 1; mask < full; mask += 1) {
    if (sums[mask] !== 0) continue;
    // Fixing the lowest set bit stops the same partition being found once per
    // ordering of its groups.
    const low = mask & -mask;
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & low) === 0 || sums[sub] !== 0) continue;
      const rest = mask ^ sub;
      if ((best[rest] as number) < 0) continue;
      const candidate = (best[rest] as number) + 1;
      if (candidate > (best[mask] as number)) {
        best[mask] = candidate;
        pick[mask] = sub;
      }
    }
  }

  const groups: SettleSide[][] = [];
  let mask = full - 1;
  while (mask > 0) {
    const group = (pick[mask] as number) || mask;
    groups.push(balances.filter((_, i) => (group & (1 << i)) !== 0));
    mask ^= group;
  }
  return groups;
}

/**
 * Largest debt pays largest credit until everything clears. Inside a group that
 * settles among itself this is optimal — every transfer closes somebody out.
 */
function settleGreedy(balances: SettleSide[]): Settlement[] {
  const debtors = balances
    .filter((s) => s.amount < 0)
    .map((s) => ({ id: s.id, amount: -s.amount }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((s) => s.amount > 0)
    .map((s) => ({ id: s.id, amount: s.amount }))
    .sort((a, b) => b.amount - a.amount);

  const out: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i] as SettleSide;
    const creditor = creditors[j] as SettleSide;
    const amount = Math.min(debtor.amount, creditor.amount);

    // Below one baht is rounding noise, not a debt worth a bank transfer.
    if (amount >= 1) {
      out.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amountThb: amount });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < 1) i += 1;
    if (creditor.amount < 1) j += 1;
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

/* ------------------------------------------------------- variants (M6) --- */

/**
 * Scores one candidate itinerary with the same maths the live plan is scored
 * by (`pkg/domain/variants.go`). Costs are per person, so THB per person is
 * the cost sum converted and rounded to whole baht.
 */
export function variantMetricsOf(
  days: PlanDay[],
  wishlist: WishlistItem[],
  fxRate: number,
): VariantMetrics {
  const items = days.flatMap((d) => d.items);
  const totalCostJpy = items.reduce((sum, i) => sum + (i.costJpy ?? 0), 0);
  const travelMinutes = items.reduce((sum, i) => sum + (i.travel?.minutes ?? 0), 0);

  const covered = recomputeCoverage(
    wishlist.map((w) => ({ ...w })),
    days,
  );
  const coverage = computeCoverage(covered);
  const warnings = validateDays(days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i })) })))
    .flatMap((d) => d.items)
    .filter((i) => i.warning).length;

  return {
    dayCount: days.length,
    itemCount: items.length,
    totalCostJpy,
    perPersonThb: fxRate > 0 ? Math.round(totalCostJpy * fxRate) : 0,
    travelMinutes,
    coveragePercent: coverage.percent,
    mustCovered: coverage.mustCovered,
    mustTotal: coverage.mustTotal,
    warningCount: warnings,
  };
}

/**
 * The pre-generate disagreement check (A6.5), mirroring
 * `pkg/domain.DetectConflicts`: the model cannot satisfy a group that
 * disagrees with itself, so the disagreement is surfaced to the humans first.
 */
export function detectConflicts(
  profiles: (MemberProfile & { name: string })[],
  wishlist: (WishlistItem & { ownerName: string })[],
): TripConflict[] {
  const conflicts: TripConflict[] = [];

  const relaxed = profiles.filter((p) => p.pace === 'relaxed').map((p) => p.name);
  const packed = profiles.filter((p) => p.pace === 'packed').map((p) => p.name);
  if (relaxed.length > 0 && packed.length > 0) {
    conflicts.push({
      kind: 'pace',
      severity: 'warning',
      message: `${relaxed.join(', ')} อยากเที่ยวชิลๆ แต่ ${packed.join(', ')} อยากจัดเต็ม — แพลนกลางๆ อาจไม่ถูกใจทั้งคู่ ลองคุยกันก่อน หรือร่างสองแบบมาเทียบ`,
    });
  }

  let maxOfMins = 0;
  let minOfMaxes = 0;
  let minName = '';
  let maxName = '';
  for (const p of profiles) {
    if (p.budgetMaxThb <= 0) continue;
    if (p.budgetMinThb > maxOfMins) {
      maxOfMins = p.budgetMinThb;
      minName = p.name;
    }
    if (minOfMaxes === 0 || p.budgetMaxThb < minOfMaxes) {
      minOfMaxes = p.budgetMaxThb;
      maxName = p.name;
    }
  }
  if (minOfMaxes > 0 && maxOfMins > minOfMaxes) {
    conflicts.push({
      kind: 'budget',
      severity: 'error',
      message: `งบไม่ทับกันเลย — ${minName} ตั้งต้นที่ ${maxOfMins.toLocaleString('th-TH')} บาท แต่ ${maxName} ไปได้สุดแค่ ${minOfMaxes.toLocaleString('th-TH')} บาท ต้องตกลงงบกลางก่อนร่าง`,
    });
  }

  const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const avoids = wishlist.filter((w) => w.kind === 'avoid');
  for (const must of wishlist.filter((w) => w.kind === 'must')) {
    const m = normalise(must.title);
    const clash = avoids.find((a) => {
      const n = normalise(a.title);
      return n === m || n.includes(m) || m.includes(n);
    });
    if (clash) {
      conflicts.push({
        kind: 'wish',
        severity: 'error',
        message: `"${must.title}" เป็นสิ่งที่${must.ownerName}ต้องไป แต่${clash.ownerName}ไม่อยากไป — ต้องเคลียร์กันเองก่อน AI ตัดสินให้ไม่ได้`,
      });
    }
  }

  return conflicts;
}

/* --------------------------------------------- public match & adapt (M21) - */

/**
 * Twin of `pkg/domain/match.go` — ScoreMatch and its four components.
 *
 * The weights, the neutral score and the lopsided budget curve are all pinned
 * by tests on both sides: a plan that reads 82% in mock mode must read 82% when
 * the API scores it, or the mode switch stops being invisible.
 */

const MATCH_WEIGHTS = { dates: 30, budget: 25, tags: 25, party: 20 };

/** Half marks for anything unknown: not punished, not rewarded. */
const MATCH_NEUTRAL = 0.5;

export interface MatchProfile {
  country?: string;
  startDate?: string;
  days?: number;
  budgetPerPersonThb?: number;
  partySize?: number;
  /** Item areas, cities and interest tags — whatever describes the trip. */
  tags?: string[];
}

export function normaliseTag(s: string) {
  return s.trim().toLowerCase().replace(/\s+/gu, '').replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/** How much of what I want does this trip have — not how alike the sets are. */
export function tagCoverage(want: string[], have: string[]) {
  if (want.length === 0 || have.length === 0) return 0;
  const right = new Set(have.map(normaliseTag).filter(Boolean));
  const left = new Set(want.map(normaliseTag).filter(Boolean));
  if (left.size === 0) return 0;

  let shared = 0;
  for (const tag of left) if (right.has(tag)) shared += 1;
  return shared / left.size;
}

/** The overlap in the caller's own spelling, capped at three for one line. */
export function sharedTags(want: string[], have: string[]) {
  const right = new Set(have.map(normaliseTag).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of want) {
    const key = normaliseTag(tag);
    if (!key || seen.has(key) || !right.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === 3) break;
  }
  return out;
}

/** December and January are one month apart, not eleven. */
export function monthDistance(a: number, b: number) {
  const d = Math.abs(a - b);
  return d > 6 ? 12 - d : d;
}

/**
 * Coming in under budget is a good outcome; going over is the thing the
 * traveller asked us to avoid, so the score falls to zero at double.
 */
export function matchBudget(want: number, have: number) {
  if (want <= 0 || have <= 0) return MATCH_NEUTRAL;
  const ratio = have / want;
  if (ratio <= 1) return 0.7 + 0.3 * ratio;
  return Math.max(0, 1 - (ratio - 1));
}

function matchParty(want: number, have: number) {
  if (want <= 0 || have <= 0) return MATCH_NEUTRAL;
  return Math.max(0.2, 1 - 0.2 * Math.abs(want - have));
}

function matchDates(want: MatchProfile, have: MatchProfile) {
  let season = MATCH_NEUTRAL;
  if (want.startDate && have.startDate) {
    const distance = monthDistance(
      parseIsoDate(want.startDate).getMonth() + 1,
      parseIsoDate(have.startDate).getMonth() + 1,
    );
    season = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.3 : 0;
  }

  let length = MATCH_NEUTRAL;
  if ((want.days ?? 0) > 0 && (have.days ?? 0) > 0) {
    const a = want.days as number;
    const b = have.days as number;
    length = Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
  }

  return 0.6 * season + 0.4 * length;
}

export interface MatchOutcome {
  score: number;
  reasons: string[];
}

/**
 * How well a published trip fits what someone is looking for (A11.3).
 *
 * A different country is not a low score, it is not a match at all: nobody
 * browsing plans for Japan wants a well-fitting week in Korea ranked above a
 * decent one in Osaka.
 */
export function scoreMatch(want: MatchProfile, have: MatchProfile): MatchOutcome {
  if (want.country && have.country && want.country.toUpperCase() !== have.country.toUpperCase()) {
    return { score: 0, reasons: [] };
  }

  const dates = matchDates(want, have);
  const budget = matchBudget(want.budgetPerPersonThb ?? 0, have.budgetPerPersonThb ?? 0);
  const wantTags = want.tags ?? [];
  const haveTags = have.tags ?? [];
  const tags = wantTags.length === 0 || haveTags.length === 0
    ? MATCH_NEUTRAL
    : tagCoverage(wantTags, haveTags);
  const party = matchParty(want.partySize ?? 0, have.partySize ?? 0);

  const score = Math.round(
    dates * MATCH_WEIGHTS.dates +
      budget * MATCH_WEIGHTS.budget +
      tags * MATCH_WEIGHTS.tags +
      party * MATCH_WEIGHTS.party,
  );

  // Only components that genuinely agree earn a line. Four bullet points
  // explaining near-misses read as an excuse, not a reason.
  const reasons: string[] = [];
  if (dates >= 0.75) {
    if (
      want.startDate &&
      have.startDate &&
      parseIsoDate(want.startDate).getMonth() === parseIsoDate(have.startDate).getMonth()
    ) {
      reasons.push(`ไปเดือนเดียวกัน — ${THAI_MONTHS_SHORT[parseIsoDate(have.startDate).getMonth()]}`);
    } else if ((have.days ?? 0) > 0) {
      reasons.push(`ยาว ${have.days} วัน เท่ากับที่วางไว้`);
    } else {
      reasons.push('ช่วงเวลาใกล้เคียงกัน');
    }
  }
  if (budget >= 0.75 && (want.budgetPerPersonThb ?? 0) > 0 && (have.budgetPerPersonThb ?? 0) > 0) {
    reasons.push('งบใกล้เคียงกับที่ตั้งไว้');
  }
  if (tags >= 0.5 && wantTags.length > 0 && haveTags.length > 0) {
    const shared = sharedTags(wantTags, haveTags);
    if (shared.length > 0) reasons.push(`มีที่อยากไปตรงกัน: ${shared.join(', ')}`);
  }
  if (party >= 0.8 && (want.partySize ?? 0) > 0 && (have.partySize ?? 0) > 0) {
    reasons.push(`กลุ่มขนาดใกล้กัน (${have.partySize} คน)`);
  }

  return { score, reasons };
}

/**
 * Twin of `pkg/domain/adapt.go` — reshaping a copied plan to a different frame
 * (A11.4).
 *
 * Deterministic on purpose: the preview and the copy have to agree, and a
 * model call cannot promise that.
 */

export type AdaptChangeKind = 'day_added' | 'day_removed' | 'item_removed' | 'item_moved';

export interface AdaptChangeLine {
  kind: AdaptChangeKind;
  dayLabel: string;
  itemTitle: string;
  reason: string;
  costDeltaDest: number;
}

export interface AdaptTotalsLine {
  days: number;
  items: number;
  costPerPersonDest: number;
}

export interface AdaptOutcome {
  days: PlanDay[];
  changes: AdaptChangeLine[];
  before: AdaptTotalsLine;
  after: AdaptTotalsLine;
  warnings: string[];
}

export interface AdaptRequest {
  days?: number;
  partySize?: number;
  fromPartySize?: number;
  budgetPerPersonDest?: number;
}

/** Five stops is where a day stops being a holiday and starts being a schedule. */
const MAX_ITEMS_PER_DAY = 5;

/** Where you sleep and how you get there is never cut to save time or money. */
function anchored(item: PlanItem) {
  return item.type === 'stay' || item.type === 'flight' || item.type === 'transport';
}

// The API also counts a stop with a POI behind it as a highlight. The view
// model carries no poi id, so this side falls back to bookable-or-priced —
// which is the same answer for every plan mock mode can produce.
function highlight(item: PlanItem) {
  return Boolean(item.bookable) || (item.costJpy ?? 0) > 0;
}

function optionalItem(item: PlanItem) {
  return !anchored(item) && item.type !== 'meal';
}

function dayCost(day: PlanDay) {
  return Math.round(day.items.reduce((sum, item) => sum + (item.costJpy ?? 0), 0));
}

function totalCost(days: PlanDay[]) {
  return days.reduce((sum, day) => sum + dayCost(day), 0);
}

function totalsOf(days: PlanDay[]): AdaptTotalsLine {
  return {
    days: days.length,
    items: days.reduce((sum, day) => sum + day.items.length, 0),
    costPerPersonDest: totalCost(days),
  };
}

function paceCap(party: number) {
  if (party <= 4) return MAX_ITEMS_PER_DAY;
  if (party <= 8) return 4;
  return 3;
}

export function adaptPlan(source: PlanDay[], opt: AdaptRequest): AdaptOutcome {
  let days: PlanDay[] = source.map((day) => ({ ...day, items: [...day.items] }));
  const changes: AdaptChangeLine[] = [];
  const warnings: string[] = [];
  const before = totalsOf(days);

  // Length first: it decides which days exist at all.
  const target = opt.days ?? 0;
  if (target > 0 && days.length > 0) {
    while (target < days.length) {
      const idx = quietestInteriorDay(days);
      const removed = days[idx] as PlanDay;
      days = days.filter((_, i) => i !== idx);
      changes.push({
        kind: 'day_removed',
        dayLabel: removed.label,
        itemTitle: '',
        reason: 'ทริปคุณสั้นกว่า',
        costDeltaDest: -dayCost(removed),
      });

      for (const item of removed.items) {
        if (!highlight(item) || anchored(item)) continue;
        const host = roomiestDay(days);
        if (host < 0) {
          changes.push({
            kind: 'item_removed',
            dayLabel: removed.label,
            itemTitle: item.title,
            reason: 'ไม่มีวันไหนเหลือที่ว่างให้',
            costDeltaDest: -(item.costJpy ?? 0),
          });
          continue;
        }
        (days[host] as PlanDay).items.push(item);
        changes.push({
          kind: 'item_moved',
          dayLabel: (days[host] as PlanDay).label,
          itemTitle: item.title,
          reason: `ย้ายมาจาก ${removed.label}`,
          costDeltaDest: item.costJpy ?? 0,
        });
      }
    }

    while (target > days.length) {
      const insertAt = days.length > 1 ? days.length - 1 : days.length;
      const blank: PlanDay = {
        id: `adapt-blank-${days.length}`,
        index: insertAt,
        date: '',
        label: 'วันว่าง',
        city: insertAt > 0 ? ((days[insertAt - 1] as PlanDay).city ?? '') : '',
        items: [],
      };
      days = [...days.slice(0, insertAt), blank, ...days.slice(insertAt)];
      changes.push({
        kind: 'day_added',
        dayLabel: blank.label,
        itemTitle: '',
        reason: 'ทริปคุณยาวกว่า — เติมเองหรือให้ AI ช่วยร่างต่อได้',
        costDeltaDest: 0,
      });
    }
  }

  // Then pace: a bigger group covers less ground. A smaller one inherits the
  // original plan — nobody asked for two extra stops a day.
  const party = opt.partySize ?? 0;
  if (party > 0 && party > (opt.fromPartySize ?? 0)) {
    const cap = paceCap(party);
    for (const day of days) {
      while (day.items.filter((i) => !anchored(i)).length > cap) {
        const idx = cheapestOptional(day.items);
        if (idx < 0) break;
        const [dropped] = day.items.splice(idx, 1);
        if (!dropped) break;
        changes.push({
          kind: 'item_removed',
          dayLabel: day.label,
          itemTitle: dropped.title,
          reason: `กลุ่ม ${party} คนเดินช้ากว่า — วันละ ${cap} ที่พอ`,
          costDeltaDest: -(dropped.costJpy ?? 0),
        });
      }
    }
  }

  // Finally the budget, on what is left.
  const budget = opt.budgetPerPersonDest ?? 0;
  if (budget > 0) {
    for (;;) {
      if (totalCost(days) <= budget) break;
      const found = dearestOptional(days);
      if (!found) break;
      const [dayIdx, itemIdx] = found;
      const day = days[dayIdx] as PlanDay;
      const [dropped] = day.items.splice(itemIdx, 1);
      if (!dropped) break;
      changes.push({
        kind: 'item_removed',
        dayLabel: day.label,
        itemTitle: dropped.title,
        reason: 'ตัดให้เข้างบ',
        costDeltaDest: -(dropped.costJpy ?? 0),
      });
    }

    const over = totalCost(days) - budget;
    if (over > 0) {
      warnings.push(
        `ตัดได้เท่าที่ตัดได้แล้ว ยังเกินงบอยู่ประมาณ ${Math.round(over).toLocaleString('th-TH')} ต่อคน — ที่เหลือเป็นที่พัก เดินทาง และมื้ออาหาร`,
      );
    }
  }

  // Renumber: keeping "วันที่ 5" on the fourth day is how a group stops
  // trusting the whole copy.
  days = days.map((day, i) => ({ ...day, index: i, label: `วันที่ ${i + 1}` }));

  return { days, changes, before, after: totalsOf(days), warnings };
}

function quietestInteriorDay(days: PlanDay[]) {
  if (days.length <= 2) return days.length - 1;
  const score = (day: PlanDay) => day.items.filter(highlight).length;

  let best = 1;
  for (let i = 2; i < days.length - 1; i += 1) {
    const day = days[i] as PlanDay;
    const champion = days[best] as PlanDay;
    if (
      score(day) < score(champion) ||
      (score(day) === score(champion) && day.items.length < champion.items.length)
    ) {
      best = i;
    }
  }
  return best;
}

function roomiestDay(days: PlanDay[]) {
  let best = -1;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i] as PlanDay;
    if (day.items.length >= MAX_ITEMS_PER_DAY) continue;
    if (best < 0 || day.items.length < (days[best] as PlanDay).items.length) best = i;
  }
  return best;
}

function cheapestOptional(items: PlanItem[]) {
  let idx = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as PlanItem;
    if (optionalItem(item) && (item.costJpy ?? 0) < best) {
      idx = i;
      best = item.costJpy ?? 0;
    }
  }
  return idx;
}

function dearestOptional(days: PlanDay[]): [number, number] | null {
  let found: [number, number] | null = null;
  let best = 0;
  for (let d = 0; d < days.length; d += 1) {
    const day = days[d] as PlanDay;
    for (let i = 0; i < day.items.length; i += 1) {
      const item = day.items[i] as PlanItem;
      if (optionalItem(item) && (item.costJpy ?? 0) > best) {
        found = [d, i];
        best = item.costJpy ?? 0;
      }
    }
  }
  return found;
}
