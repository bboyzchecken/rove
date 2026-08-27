#!/usr/bin/env node
/**
 * Van Westendorp price-sensitivity analysis for D26.1 — the survey that is
 * supposed to test the one leg of the ฿299 Trip Pass price nobody has measured
 * (docs/pricing-survey.md, docs/decision-log.md).
 *
 *   node scripts/van-westendorp.mjs responses.csv
 *   node scripts/van-westendorp.mjs a.csv --label="A · no refund"
 *   node scripts/van-westendorp.mjs b.csv --by=source --json=out.json
 *
 * Input is the CSV Google Forms exports, unedited. Columns are matched by the
 * Thai question wording from the survey doc, so renaming a question in the form
 * breaks the match loudly rather than silently reading the wrong column — see
 * COLUMNS below, and --map to override one.
 *
 * What it prints:
 *
 *   PMC  point of marginal cheapness      lower edge of the acceptable range
 *   PME  point of marginal expensiveness  upper edge
 *   OPP  optimal price point              least price resistance
 *   IPP  indifference price point         what the category reads as "normal"
 *   NMS  Newton-Miller-Smith              revenue-maximising price (needs Q10/Q11)
 *
 * OPP and NMS are different questions — least-resisted vs most-revenue — and
 * the decision rules in docs/pricing-survey.md §6 treat them separately. Both
 * are printed even when they disagree, because the disagreement is the finding.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Question wording → field. Matched as a substring against the CSV header,
 * case-insensitively, after collapsing whitespace. The four price questions are
 * required; the two intent questions are optional (without them, no NMS).
 */
const COLUMNS = [
  { field: 'tooCheap', required: true, match: ['ถูกจนน่าสงสัย', 'too cheap'] },
  { field: 'cheap', required: true, match: ['ถูก — คุ้มค่าน่าลอง', 'ถูก - คุ้มค่าน่าลอง', 'คุ้มค่าน่าลอง', 'bargain'] },
  { field: 'expensive', required: true, match: ['แพง แต่ก็ยังพอคิดจะจ่าย', 'ยังพอคิดจะจ่าย', 'getting expensive'] },
  { field: 'tooExpensive', required: true, match: ['แพงเกินไป', 'too expensive'] },
  { field: 'intentLow', required: false, match: ['฿199', '199 ต่อทริป'] },
  { field: 'intentHigh', required: false, match: ['฿399', '399 ต่อทริป'] },
  { field: 'source', required: false, match: ['แหล่ง', 'source', 'utm'] },
];

/**
 * Purchase-intent weights for the NMS extension. "Definitely" is discounted to
 * 0.7 and "probably" to 0.3 because stated intent overstates behaviour, and the
 * whole point of the survey is to stop treating a stated number as a measured
 * one. The three lower options count as zero.
 *
 * Matched whole, never as a substring: "ไม่จ่ายแน่นอน" (definitely won't)
 * contains "จ่ายแน่นอน" (definitely will), so substring matching scores the
 * strongest rejection as the strongest intent. Anything not on this list is
 * counted as unrecognised and reported, rather than quietly weighted zero.
 */
const INTENT_WEIGHTS = new Map([
  ['จ่ายแน่นอน', 0.7],
  ['น่าจะจ่าย', 0.3],
  ['ไม่แน่ใจ', 0],
  ['คงไม่จ่าย', 0],
  ['ไม่จ่ายแน่นอน', 0],
  ['definitely yes', 0.7],
  ['probably yes', 0.3],
  ['not sure', 0],
  ['probably not', 0],
  ['definitely not', 0],
]);

const INTENT_PRICES = { intentLow: 199, intentHigh: 399 };

/** The sample size below which docs/pricing-survey.md §6 forbids concluding anything. */
const MIN_SAMPLE = 50;

/** A crossing at less than this share is two flat curves touching at zero, not an intersection. */
const MIN_CROSSING_SHARE = 0.02;

function main(argv) {
  const args = parseArgs(argv);
  if (!args.file) {
    console.error('usage: node scripts/van-westendorp.mjs <responses.csv> [--label=…] [--by=source] [--json=out.json] [--map=field:header]');
    process.exit(2);
  }

  const rows = parseCsv(readFileSync(args.file, 'utf8'));
  if (rows.length < 2) fail(`${args.file} has no data rows`);

  const header = rows[0];
  const index = mapColumns(header, args.map);
  const parsed = rows.slice(1).map((row) => readRow(row, index));

  const groups = args.by
    ? groupBy(parsed, (r) => r.source || '(ไม่ระบุแหล่ง)')
    : new Map([[args.label || 'ทั้งหมด', parsed]]);

  const report = [];
  for (const [name, members] of groups) {
    const result = analyse(members);
    report.push({ group: name, ...result });
    print(name, result);
  }

  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nเขียนผลลง ${args.json}`);
  }
}

// ---------------------------------------------------------------- analysis

/**
 * Runs the four curves over every price anyone named, then reads the crossings
 * off them. Prices are kept as the raw baht respondents typed rather than
 * bucketed, so a crossing lands between two named prices and is interpolated —
 * bucketing first would move the answer by the width of a bucket.
 */
function analyse(rows) {
  const kept = [];
  const rejected = { incomplete: 0, unordered: 0, outOfRange: 0 };

  for (const row of rows) {
    const p = [row.tooCheap, row.cheap, row.expensive, row.tooExpensive];
    if (p.some((v) => v === null)) {
      rejected.incomplete++;
      continue;
    }
    if (p.some((v) => v < 0 || v > 100000)) {
      rejected.outOfRange++;
      continue;
    }
    // The order is what makes the four answers one answer. A row that breaks it
    // means the respondent read the questions differently from everyone else,
    // and averaging it in hides that rather than fixing it.
    if (!(p[0] < p[1] && p[1] < p[2] && p[2] < p[3])) {
      rejected.unordered++;
      continue;
    }
    kept.push(row);
  }

  const n = kept.length;
  if (n === 0) return { n, rejected, curves: [], points: {}, nms: null };

  const grid = [...new Set(kept.flatMap((r) => [r.tooCheap, r.cheap, r.expensive, r.tooExpensive]))].sort((a, b) => a - b);

  // Two curves fall with price (share who consider it that cheap or cheaper to
  // be a problem) and two rise with it.
  const share = (fn) => grid.map((price) => ({ price, value: kept.filter((r) => fn(r, price)).length / n }));
  const tooCheap = share((r, price) => r.tooCheap >= price);
  const cheap = share((r, price) => r.cheap >= price);
  const expensive = share((r, price) => r.expensive <= price);
  const tooExpensive = share((r, price) => r.tooExpensive <= price);

  const points = {
    pmc: cross(tooCheap, expensive),
    pme: cross(tooExpensive, cheap),
    opp: cross(tooCheap, tooExpensive),
    ipp: cross(cheap, expensive),
  };

  const intentUnknown = kept.reduce((sum, r) => sum + r.intentUnknown, 0);
  return { n, rejected, intentUnknown, points, nms: newtonMillerSmith(kept), curves: { tooCheap, cheap, expensive, tooExpensive } };
}

/**
 * First crossing of a falling and a rising curve, linearly interpolated between
 * the two grid prices that straddle it.
 *
 * Returns null when the curves only meet at zero — that is two curves that
 * never overlap (nobody's "too cheap" reaches anybody's "too expensive"), and
 * reporting the price where the last one flatlines as if it were a crossing
 * would be inventing a number.
 */
function cross(falling, rising) {
  for (let i = 1; i < falling.length; i++) {
    const before = falling[i - 1].value - rising[i - 1].value;
    const after = falling[i].value - rising[i].value;
    if (before === 0) return falling[i - 1].value < MIN_CROSSING_SHARE ? null : falling[i - 1].price;
    if (before > 0 && after <= 0) {
      const span = before - after;
      const p0 = falling[i - 1].price;
      const p1 = falling[i].price;
      const t = span === 0 ? 1 : before / span;
      const share = falling[i - 1].value + (falling[i].value - falling[i - 1].value) * t;
      if (share < MIN_CROSSING_SHARE) return null;
      return Math.round(p0 + (p1 - p0) * t);
    }
  }
  return null;
}

/**
 * Revenue-maximising price from the two purchase-intent questions: trial rate
 * at each of the two prices asked, straight line between them, price × trial.
 * Two points is a coarse curve — it says which side of ฿299 revenue leans, not
 * the exact peak, and the doc's decision rules are written to that resolution.
 */
function newtonMillerSmith(rows) {
  const withIntent = rows.filter((r) => r.intentLow !== null && r.intentHigh !== null);
  if (withIntent.length < 10) return null;

  const trial = (field) => withIntent.reduce((sum, r) => sum + r[field], 0) / withIntent.length;
  const low = { price: INTENT_PRICES.intentLow, trial: trial('intentLow') };
  const high = { price: INTENT_PRICES.intentHigh, trial: trial('intentHigh') };

  let best = null;
  for (let price = low.price; price <= high.price; price += 1) {
    const t = low.trial + ((high.trial - low.trial) * (price - low.price)) / (high.price - low.price);
    const revenue = price * Math.max(t, 0);
    if (!best || revenue > best.revenue) best = { price, trial: t, revenue };
  }
  return { n: withIntent.length, low, high, best };
}

// ---------------------------------------------------------------- output

function print(name, { n, rejected, intentUnknown, points, nms, curves }) {
  const line = '─'.repeat(58);
  console.log(`\n${line}\n${name}\n${line}`);

  const dropped = rejected.incomplete + rejected.unordered + rejected.outOfRange;
  console.log(`คำตอบที่ใช้ได้: ${n}  (ตัดทิ้ง ${dropped} — ตอบไม่ครบ ${rejected.incomplete} · เรียงราคาไม่สอดคล้อง ${rejected.unordered} · เลขนอกช่วง ${rejected.outOfRange})`);

  if (n === 0) return;
  if (n < MIN_SAMPLE) {
    console.log(`\n⚠️  n = ${n} ต่ำกว่า ${MIN_SAMPLE} — docs/pricing-survey.md §6 ห้ามสรุปจากตัวเลขชุดนี้`);
  }

  const fmt = (v) => (v === null ? 'หาไม่เจอ' : `฿${v.toLocaleString('en-US')}`);
  console.log('');
  console.log(`  PMC  ขอบล่างของช่วงราคา        ${fmt(points.pmc)}`);
  console.log(`  PME  ขอบบนของช่วงราคา          ${fmt(points.pme)}`);
  console.log(`  OPP  ราคาที่ต่อต้านน้อยที่สุด      ${fmt(points.opp)}`);
  console.log(`  IPP  ราคาที่ตลาดอ่านว่า "ปกติ"     ${fmt(points.ipp)}`);
  if (nms) {
    console.log(`  NMS  ราคาที่ทำรายได้สูงสุด        ${fmt(nms.best.price)}  (จะซื้อ ${(nms.best.trial * 100).toFixed(0)}% · n=${nms.n})`);
  } else {
    console.log('  NMS  ราคาที่ทำรายได้สูงสุด        ไม่มีข้อมูลความตั้งใจซื้อ (ข้อ 10–11)');
  }
  if (intentUnknown > 0) {
    console.log(`\n  ⚠️  คำตอบความตั้งใจซื้อ ${intentUnknown} ช่องไม่ตรงกับตัวเลือกทั้งห้า — ถูกข้ามไป ตรวจว่าข้อความตัวเลือกในฟอร์มตรงกับ §3 ส่วนที่ 4`);
  }

  if (points.pmc !== null && points.pme !== null) {
    const inside = 299 >= points.pmc && 299 <= points.pme;
    console.log(`\n  ฿299 ${inside ? 'อยู่ใน' : '**อยู่นอก**'}ช่วง ${fmt(points.pmc)}–${fmt(points.pme)}`);
    if (points.opp !== null) {
      const gap = points.opp - 299;
      console.log(`  ห่างจาก OPP ${gap >= 0 ? '+' : ''}${gap} บาท`);
    }
  }
  if (nms && points.opp !== null && Math.abs(nms.best.price - points.opp) > 100) {
    console.log(`  ⚠️  NMS กับ OPP ห่างกัน ${Math.abs(nms.best.price - points.opp)} บาท — §6 บอกให้ยึด NMS และบันทึกส่วนต่าง`);
  }

  if (curves) console.log(`\n${chart(curves)}`);
}

/** Small ASCII plot, enough to see whether the crossings sit on real slopes. */
function chart({ tooCheap, cheap, expensive, tooExpensive }) {
  const rows = 12;
  const cols = 52;
  const prices = tooCheap.map((p) => p.price);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));

  const plot = (curve, ch) => {
    for (const { price, value } of curve) {
      const x = max === min ? 0 : Math.round(((price - min) / (max - min)) * (cols - 1));
      const y = Math.round((1 - value) * (rows - 1));
      grid[y][x] = ch;
    }
  };
  plot(tooCheap, '.');
  plot(cheap, 'c');
  plot(expensive, 'e');
  plot(tooExpensive, 'X');

  const body = grid.map((row, i) => `${(i === 0 ? '100%' : i === rows - 1 ? '  0%' : '    ')} │${row.join('')}`).join('\n');
  return `${body}\n     └${'─'.repeat(cols)}\n      ฿${min}${' '.repeat(Math.max(cols - 12, 1))}฿${max}\n      . ถูกจนน่าสงสัย   c ถูก/คุ้ม   e เริ่มแพง   X แพงเกินไป`;
}

// ---------------------------------------------------------------- input

function readRow(row, index) {
  const at = (field) => (index[field] === undefined ? '' : (row[index[field]] ?? '').trim());
  const intentLow = at('intentLow');
  const intentHigh = at('intentHigh');
  return {
    tooCheap: toBaht(at('tooCheap')),
    cheap: toBaht(at('cheap')),
    expensive: toBaht(at('expensive')),
    tooExpensive: toBaht(at('tooExpensive')),
    intentLow: toIntent(intentLow),
    intentHigh: toIntent(intentHigh),
    // Text that is present but not one of the five options — a renamed answer
    // choice, or the wrong column matched. Counted so it can be said out loud.
    intentUnknown: [intentLow, intentHigh].filter((v) => v && toIntent(v) === null).length,
    source: at('source'),
  };
}

/** "฿1,290 บาท" and "1290.-" are both what people type into a free-text field. */
function toBaht(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d.]/g, '');
  if (!digits) return null;
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function toIntent(raw) {
  if (!raw) return null;
  const key = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  const weight = INTENT_WEIGHTS.get(key);
  return weight === undefined ? null : weight;
}

function mapColumns(header, overrides) {
  const norm = header.map((h) => h.replace(/\s+/g, ' ').trim().toLowerCase());
  const index = {};

  for (const { field, required, match } of COLUMNS) {
    if (overrides[field]) {
      const forced = norm.indexOf(overrides[field].replace(/\s+/g, ' ').trim().toLowerCase());
      if (forced === -1) fail(`--map ${field}: ไม่พบคอลัมน์ "${overrides[field]}"`);
      index[field] = forced;
      continue;
    }
    const found = norm.findIndex((h) => match.some((m) => h.includes(m.toLowerCase())));
    if (found === -1) {
      if (required) {
        fail(`ไม่พบคอลัมน์ของ "${field}" (มองหา: ${match.join(' / ')})\nคอลัมน์ที่มี:\n  ${header.join('\n  ')}\nแก้ด้วย --map=${field}:<ชื่อคอลัมน์เต็ม>`);
      }
      continue;
    }
    index[field] = found;
  }
  return index;
}

/** RFC 4180 enough for what Google Forms writes: quotes, commas, newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(row);
  }
  return out;
}

function parseArgs(argv) {
  const args = { file: null, label: null, by: null, json: null, map: {} };
  for (const arg of argv) {
    if (arg.startsWith('--label=')) args.label = arg.slice(8);
    else if (arg.startsWith('--by=')) args.by = arg.slice(5);
    else if (arg.startsWith('--json=')) args.json = arg.slice(7);
    else if (arg.startsWith('--map=')) {
      const [field, ...rest] = arg.slice(6).split(':');
      args.map[field] = rest.join(':');
    } else if (!arg.startsWith('--')) args.file = arg;
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main(process.argv.slice(2));
