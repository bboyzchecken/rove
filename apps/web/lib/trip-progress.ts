import type { StartedWith, TripOverview } from '@/lib/data';

/**
 * The trip's steps and what state each is in (Feedback #2 — D-11, F0.6).
 *
 * UAT round 1's biggest finding (fix-list §0, ต้นตอร่วม 1): the room offered
 * eleven identical tabs and never said which ones still needed the group and
 * which were done. So every step now has ONE of four statuses, computed in
 * ONE place, and read by everything that lists steps — the checklist, the tab
 * strip, the "กำลังวางแผน" rows on the home screen, the member dots:
 *
 *   todo     ต้องทำ      nothing here yet, and the trip needs it
 *   check    ตรวจดู      something is here — often because the group said
 *                        they already had it when they opened the room — and
 *                        someone should look it over
 *   done     เรียบร้อย   settled, nothing to do
 *   skipped  ข้ามแล้ว    the group said this trip does not need it (D-12)
 *
 * Three of the four are derived from the overview payload here and never
 * stored; only a skip is a fact the server keeps (`stepOverrides`).
 *
 * The ORDER of steps also lives here (`orderedSteps`): what the group ticked
 * on the first screen (D-9, `trip.startedWith`) decides which steps come
 * first. A group that arrives with tickets sees the flight step already
 * ticked rather than a date step asking them to start over.
 */

export type StepKey =
  | 'invite'
  | 'dates'
  | 'route'
  | 'stay'
  | 'wishlist'
  | 'plan'
  | 'budget'
  | 'bookings'
  | 'prep'
  | 'documents'
  | 'expense'
  | 'photos';

export type StepStatus = 'todo' | 'check' | 'done' | 'skipped';

export const STATUS_LABEL: Record<StepStatus, string> = {
  todo: 'ต้องทำ',
  check: 'ตรวจดู',
  done: 'เรียบร้อย',
  skipped: 'ข้ามแล้ว',
};

export interface StepInfo {
  key: StepKey;
  /** Where in the room the step is done — a segment under `/t/:id/`. */
  segment: string;
  label: string;
  /** What the button for a todo step says. */
  action: string;
  /** Which phase of the trip it belongs to (variant B's grouping). */
  phase: 'plan' | 'book' | 'during' | 'after';
  /** Whether "ข้าม" makes sense — an invite can be skipped, a plan cannot. */
  skippable: boolean;
}

/**
 * The canonical order, before `startedWith` reshuffles it. The three phases
 * follow the trip in time: decide, book and prepare, then live it.
 */
export const STEPS: StepInfo[] = [
  { key: 'invite', segment: '', label: 'ชวนเพื่อนเข้าห้อง', action: 'ชวนเพื่อน', phase: 'plan', skippable: true },
  { key: 'dates', segment: 'dates', label: 'ล็อควันเดินทาง', action: 'หาวันที่ตรงกัน', phase: 'plan', skippable: false },
  { key: 'route', segment: '', label: 'ใส่เที่ยวบิน', action: 'ใส่เที่ยวบิน', phase: 'book', skippable: true },
  { key: 'stay', segment: 'bookings', label: 'ที่พัก', action: 'ใส่ที่พัก', phase: 'book', skippable: true },
  { key: 'wishlist', segment: 'wishlist', label: 'ทุกคนใส่ที่อยากไป', action: 'ใส่ที่อยากไป', phase: 'plan', skippable: false },
  { key: 'plan', segment: 'plan', label: 'ร่างแพลนรายวัน', action: 'ให้ AI ร่างแพลน', phase: 'plan', skippable: false },
  { key: 'budget', segment: 'budget', label: 'ตั้งงบต่อคน', action: 'ตั้งงบ', phase: 'book', skippable: true },
  { key: 'bookings', segment: 'bookings', label: 'จองตั๋วและที่พัก', action: 'ดูการจอง', phase: 'book', skippable: true },
  { key: 'prep', segment: 'prep', label: 'เตรียมตัวก่อนไป', action: 'ดูเช็คลิสต์', phase: 'book', skippable: true },
  { key: 'documents', segment: 'documents', label: 'เก็บตั๋วและเอกสาร', action: 'อัปโหลดเอกสาร', phase: 'book', skippable: true },
  { key: 'expense', segment: 'expense', label: 'จดค่าใช้จ่ายจริง', action: 'จดรายจ่าย', phase: 'during', skippable: true },
  { key: 'photos', segment: 'photos', label: 'เก็บรูปเข้าทริป', action: 'เพิ่มรูป', phase: 'during', skippable: true },
];

export const STEP_BY_KEY: Record<StepKey, StepInfo> = Object.fromEntries(
  STEPS.map((step) => [step.key, step]),
) as Record<StepKey, StepInfo>;

/** Which tab (segment under /t/:id/) carries which step's status. */
export const TAB_STEP: Record<string, StepKey | undefined> = {
  dates: 'dates',
  wishlist: 'wishlist',
  plan: 'plan',
  budget: 'budget',
  bookings: 'bookings',
  prep: 'prep',
  documents: 'documents',
  expense: 'expense',
  photos: 'photos',
};

/**
 * What the room's own tables say about one step — before any skip is applied.
 * Exported for tests; callers want `stepStatus`.
 */
export function derivedStatus(overview: TripOverview, step: StepKey): Exclude<StepStatus, 'skipped'> {
  const { trip, members, counts, coverage, locked } = overview;
  const started = new Set<StartedWith>(trip.startedWith ?? []);
  const hasDates = Boolean(trip.startDate && trip.endDate);
  const flights = trip.route?.flights.length ?? 0;

  switch (step) {
    case 'invite':
      if (members.length > 1) return 'done';
      // "มีเพื่อนไปด้วยแล้ว" but nobody in the room yet: the invites are the
      // thing to check, not a blank to fill.
      return started.has('friends') ? 'check' : 'todo';
    case 'dates':
      if (locked) return 'done';
      // Dates typed into the frame or read off a ticket are a fact to confirm,
      // not an agreement (M2.5 keeps those apart).
      if (hasDates) return 'check';
      return 'todo';
    case 'route':
      if (flights > 0) {
        // A leg with no arrival time is a route still being filled in.
        const incomplete = trip.route?.flights.some((leg) => !leg.arrTime && leg.mode === 'flight');
        return incomplete ? 'check' : 'done';
      }
      return started.has('flights') ? 'check' : 'todo';
    case 'stay':
      if (counts.bookings > 0) return 'done';
      return started.has('stay') ? 'check' : 'todo';
    case 'wishlist':
      if (counts.wishlistItems === 0) return 'todo';
      return counts.membersWithoutWishlist === 0 ? 'done' : 'check';
    case 'plan':
      if (counts.planDays === 0) return 'todo';
      return coverage.percent >= 100 || coverage.mustTotal === 0 ? 'done' : 'check';
    case 'budget':
      return trip.budgetPerPersonThb > 0 ? 'done' : 'todo';
    case 'bookings':
      if (counts.bookings > 0) return 'done';
      return started.has('flights') || started.has('stay') ? 'check' : 'todo';
    case 'prep':
      if (counts.prepTasks === 0) return 'todo';
      return counts.openPrep === 0 ? 'done' : 'check';
    case 'documents':
      if (counts.documents > 0) return 'done';
      return started.has('flights') ? 'check' : 'todo';
    case 'expense':
      return counts.expenses > 0 ? 'check' : 'todo';
    case 'photos':
      return counts.photos > 0 ? 'done' : 'todo';
  }
}

/**
 * The status the room shows for a step: what it derives, unless the group
 * overrode it — skipped it (D-12), or confirmed it done by hand (Feedback #4
 * — D-26) because it had no way to reach 100% on its own.
 */
export function stepStatus(overview: TripOverview, step: StepKey): StepStatus {
  const derived = derivedStatus(overview, step);
  if (derived === 'done') return 'done';
  const override = overview.stepOverrides[step];
  if (override === 'confirmed') return 'done';
  return override === 'skipped' ? 'skipped' : derived;
}

/**
 * The steps in the order this trip should walk them (D-9, D-11).
 *
 * What the group already has moves to the FRONT — those steps are done or
 * need only a glance, and seeing them ticked first is the reassurance that
 * the room understood what they said. Everything else keeps the canonical
 * order. A step that is not relevant yet (spending, photos) stays at the end.
 */
export function orderedSteps(startedWith: StartedWith[] = []): StepInfo[] {
  const first: StepKey[] = [];
  for (const had of startedWith) {
    if (had === 'flights') first.push('route');
    if (had === 'dates') first.push('dates');
    if (had === 'stay') first.push('stay');
    if (had === 'friends') first.push('invite');
  }
  const seen = new Set(first);
  return [
    ...first.map((key) => STEP_BY_KEY[key]),
    ...STEPS.filter((step) => !seen.has(step.key) && step.key !== 'stay'),
  ];
}

/**
 * The pieces the checklist header prints: "พร้อม 40% · เหลืออีก 3 อย่าง".
 *
 * Feedback #4 — F9: "during"-phase steps (ค่าใช้จ่ายจริง, รูปเข้าทริป) never
 * count here, at any call site — they cannot be finished before the trip
 * even starts, so counting them in the pre-travel percentage is what made a
 * fully-prepared trip read "67% · เหลืออีก 2" forever and never invite the
 * owner to press พร้อมไปแล้ว. They still render as their own rows in the
 * checklist (`orderedSteps` keeps them); this only excludes them from % and
 * from "ขั้นต่อไป".
 */
export function progressSummary(overview: TripOverview, steps: StepInfo[] = orderedSteps(overview.trip.startedWith)) {
  const preTravel = steps.filter((step) => step.phase !== 'during');
  const statuses = preTravel.map((step) => stepStatus(overview, step.key));
  const counted = statuses.filter((s) => s !== 'skipped');
  const done = counted.filter((s) => s === 'done').length;
  const percent = counted.length === 0 ? 100 : Math.round((done / counted.length) * 100);
  const remaining = counted.length - done;
  const next = preTravel.find((step) => stepStatus(overview, step.key) === 'todo')
    ?? preTravel.find((step) => stepStatus(overview, step.key) === 'check');
  return { percent, done, remaining, total: counted.length, next };
}

/**
 * The plain-words list of what a trip is still missing — for the home
 * screen's "กำลังวางแผน" rows (F2.3): "ยังไม่กำหนดวัน · ยังไม่สรุปสถานที่ …".
 */
export function missingSummary(overview: TripOverview): string[] {
  const out: string[] = [];
  if (stepStatus(overview, 'dates') !== 'done') out.push('ยังไม่กำหนดวัน');
  if (stepStatus(overview, 'wishlist') !== 'done' && stepStatus(overview, 'wishlist') !== 'skipped')
    out.push('ยังไม่สรุปสถานที่');
  if (stepStatus(overview, 'invite') === 'todo') out.push('ยังไม่คอนเฟิร์มคน');
  if (stepStatus(overview, 'plan') === 'todo') out.push('ยังไม่มีแพลน');
  return out;
}

/** Which phase a step is in, in the order the room walks them. */
export const PHASES: { key: StepInfo['phase']; label: string; hint: string }[] = [
  { key: 'plan', label: 'วางแผน', hint: 'วัน · ที่อยากไป · แพลน' },
  { key: 'book', label: 'จอง + เตรียม', hint: 'การจอง · งบ · เตรียมตัว · เอกสาร' },
  { key: 'during', label: 'ระหว่างทริป', hint: 'ค่าใช้จ่าย · รูป' },
];
