/**
 * Prototype data access.
 *
 * Components import from here and nowhere else, so replacing this module with
 * the real query hooks in `features/` once the Go API is up is a one-file
 * change. Anything the API will compute is computed here too, never inlined
 * in a component.
 */
import { BUDGET, DAYS, EXPENSES, MEMBERS, TRIP, WISHLIST } from './trip';
import type { ExpenseEntry, Settlement } from './types';

export * from './characters';
export * from './trip';
export * from './types';
export * from './user';

/* ---------------------------------------------------------------- money -- */

export function jpyToThb(jpy: number) {
  return Math.round(jpy * TRIP.fxRate);
}

export function toThb(entry: Pick<ExpenseEntry, 'amount' | 'currency'>) {
  return entry.currency === 'JPY' ? jpyToThb(entry.amount) : entry.amount;
}

/* --------------------------------------------------------------- budget -- */

export const budgetTotals = (() => {
  const totalJpy = BUDGET.reduce((sum, line) => sum + line.totalJpy, 0);
  const perPersonJpy = BUDGET.reduce((sum, line) => sum + line.perPersonJpy, 0);
  const prepaidJpy = BUDGET.filter((l) => l.prepaid).reduce((s, l) => s + l.totalJpy, 0);
  const perPersonThb = jpyToThb(perPersonJpy);

  return {
    totalJpy,
    perPersonJpy,
    prepaidJpy,
    perPersonThb,
    /** How much of the per-head budget the estimate uses, 0–1+. */
    budgetUsed: perPersonThb / TRIP.budgetPerPersonThb,
    remainingThb: TRIP.budgetPerPersonThb - perPersonThb,
  };
})();

/* ------------------------------------------------------------- coverage -- */

export const coverage = (() => {
  const musts = WISHLIST.filter((w) => w.kind === 'must');
  const covered = WISHLIST.filter((w) => w.coverage === 'covered').length;
  const partial = WISHLIST.filter((w) => w.coverage === 'partial').length;
  const uncovered = WISHLIST.filter((w) => w.coverage === 'uncovered').length;

  return {
    covered,
    partial,
    uncovered,
    total: WISHLIST.length,
    mustCovered: musts.filter((w) => w.coverage === 'covered').length,
    mustTotal: musts.length,
    /** Percentage the Coverage Board headline shows. */
    percent: Math.round((covered / WISHLIST.length) * 100),
  };
})();

/* ------------------------------------------------------------------ plan -- */

export const planStats = (() => {
  const items = DAYS.flatMap((d) => d.items);
  return {
    days: DAYS.length,
    items: items.length,
    warnings: items.filter((i) => i.warning).length,
    bookable: items.filter((i) => i.bookable).length,
    booked: items.filter((i) => i.booked).length,
    travelMinutes: items.reduce((sum, i) => sum + (i.travel?.minutes ?? 0), 0),
  };
})();

export function getDay(dayId: string) {
  return DAYS.find((d) => d.id === dayId) ?? DAYS[0]!;
}

/* --------------------------------------------------------------- expense -- */

/**
 * The shared/personal split and the settle-up (M16 — A16.2 will do this in
 * `pkg/domain/expense.go`). Shared entries are divided evenly across their
 * participants; personal entries never touch anyone else's balance.
 */
export const expenseSummary = (() => {
  const balance = new Map(MEMBERS.map((m) => [m.id, 0]));
  const paid = new Map(MEMBERS.map((m) => [m.id, 0]));
  const owed = new Map(MEMBERS.map((m) => [m.id, 0]));
  const personal = new Map(MEMBERS.map((m) => [m.id, 0]));

  let sharedTotal = 0;
  let personalTotal = 0;

  for (const entry of EXPENSES) {
    const thb = toThb(entry);

    if (entry.scope === 'personal') {
      personalTotal += thb;
      personal.set(entry.paidBy, (personal.get(entry.paidBy) ?? 0) + thb);
      continue;
    }

    sharedTotal += thb;
    paid.set(entry.paidBy, (paid.get(entry.paidBy) ?? 0) + thb);
    balance.set(entry.paidBy, (balance.get(entry.paidBy) ?? 0) + thb);

    const share = thb / entry.participants.length;
    for (const memberId of entry.participants) {
      owed.set(memberId, (owed.get(memberId) ?? 0) + share);
      balance.set(memberId, (balance.get(memberId) ?? 0) - share);
    }
  }

  const perMember = MEMBERS.map((m) => ({
    member: m,
    paidThb: Math.round(paid.get(m.id) ?? 0),
    shareThb: Math.round(owed.get(m.id) ?? 0),
    personalThb: Math.round(personal.get(m.id) ?? 0),
    balanceThb: Math.round(balance.get(m.id) ?? 0),
  }));

  return {
    sharedTotalThb: Math.round(sharedTotal),
    personalTotalThb: Math.round(personalTotal),
    totalThb: Math.round(sharedTotal + personalTotal),
    perMember,
    settlements: settle(perMember),
  };
})();

/**
 * Greedy netting: repeatedly pay the largest debt to the largest credit. For a
 * group of four this always produces at most three transfers, which is what
 * the "จ่ายคืนกันยังไง" card shows.
 */
function settle(rows: { member: { id: string }; balanceThb: number }[]): Settlement[] {
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
