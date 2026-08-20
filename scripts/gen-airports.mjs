#!/usr/bin/env node
/**
 * Builds the worldwide airport index both apps search against.
 *
 *   node scripts/gen-airports.mjs
 *
 * Output (identical payload, one copy per app because the Go module and the
 * Next app are built from different Docker contexts and neither can reach into
 * the other):
 *
 *   apps/api/data/airports.json          — go:embed, served by /api/v1/airports
 *   apps/web/lib/data/airports.data.json — mock mode, loaded on demand
 *
 * Sources, all public-domain or MIT and all pulled from the npm registry so the
 * build has exactly one network dependency:
 *
 *   airport-data-js       OurAirports — type, scheduled service, country, tz
 *   @nwpr/airport-codes   OpenFlights — the city an airport actually serves
 *   i18n-iso-countries    country names, including Thai
 *
 * We keep airports that carry a IATA code, have scheduled commercial service
 * and are classified large or medium — that is the set a flight-booking search
 * offers, roughly 3.6k rows, and it excludes the 9k airstrips nobody flies to
 * on a holiday.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = ['airport-data-js@3', '@nwpr/airport-codes@3', 'i18n-iso-countries@7'];

/**
 * Airports a Thai traveller types in Thai. The index still searches the whole
 * world in English; this is the shortlist that also answers "โตเกียว" or
 * "กรุงเทพ" — [airport in Thai, city in Thai].
 */
const THAI = {
  BKK: ['สุวรรณภูมิ', 'กรุงเทพ'],
  DMK: ['ดอนเมือง', 'กรุงเทพ'],
  CNX: ['เชียงใหม่', 'เชียงใหม่'],
  CEI: ['เชียงราย', 'เชียงราย'],
  HKT: ['ภูเก็ต', 'ภูเก็ต'],
  KBV: ['กระบี่', 'กระบี่'],
  USM: ['สมุย', 'เกาะสมุย'],
  HDY: ['หาดใหญ่', 'หาดใหญ่'],
  UBP: ['อุบลราชธานี', 'อุบลราชธานี'],
  KKC: ['ขอนแก่น', 'ขอนแก่น'],
  NRT: ['นาริตะ', 'โตเกียว'],
  HND: ['ฮาเนดะ', 'โตเกียว'],
  KIX: ['คันไซ', 'โอซาก้า'],
  ITM: ['อิตามิ', 'โอซาก้า'],
  UKB: ['โกเบ', 'โกเบ'],
  NGO: ['ชูบุเซ็นแทรร์', 'นาโกย่า'],
  CTS: ['ชิโตเสะ', 'ซัปโปโร'],
  FUK: ['ฟุกุโอกะ', 'ฟุกุโอกะ'],
  OKA: ['นาฮะ', 'โอกินาว่า'],
  KMQ: ['โคมัตสึ', 'คานาซาว่า'],
  HIJ: ['ฮิโรชิม่า', 'ฮิโรชิม่า'],
  SDJ: ['เซนได', 'เซนได'],
  KOJ: ['คาโกชิม่า', 'คาโกชิม่า'],
  TAK: ['ทาคามัตสึ', 'ทาคามัตสึ'],
  ICN: ['อินชอน', 'โซล'],
  GMP: ['กิมโป', 'โซล'],
  PUS: ['กิมแฮ', 'ปูซาน'],
  CJU: ['เชจู', 'เชจู'],
  TPE: ['เถาหยวน', 'ไทเป'],
  TSA: ['ซงซาน', 'ไทเป'],
  KHH: ['เกาสง', 'เกาสง'],
  RMQ: ['ไถจง', 'ไถจง'],
  HKG: ['ฮ่องกง', 'ฮ่องกง'],
  MFM: ['มาเก๊า', 'มาเก๊า'],
  PVG: ['ผู่ตง', 'เซี่ยงไฮ้'],
  SHA: ['หงเฉียว', 'เซี่ยงไฮ้'],
  PEK: ['ปักกิ่ง', 'ปักกิ่ง'],
  PKX: ['ต้าซิง', 'ปักกิ่ง'],
  CAN: ['กว่างโจว', 'กว่างโจว'],
  SZX: ['เซินเจิ้น', 'เซินเจิ้น'],
  CTU: ['เฉิงตู', 'เฉิงตู'],
  CKG: ['ฉงชิ่ง', 'ฉงชิ่ง'],
  XIY: ['ซีอาน', 'ซีอาน'],
  KMG: ['คุนหมิง', 'คุนหมิง'],
  HGH: ['หางโจว', 'หางโจว'],
  SIN: ['ชางงี', 'สิงคโปร์'],
  KUL: ['กัวลาลัมเปอร์', 'กัวลาลัมเปอร์'],
  PEN: ['ปีนัง', 'ปีนัง'],
  BKI: ['โกตาคินาบาลู', 'โกตาคินาบาลู'],
  CGK: ['ซูการ์โน-ฮัตตา', 'จาการ์ตา'],
  DPS: ['งูราห์ไร', 'บาหลี'],
  SUB: ['สุราบายา', 'สุราบายา'],
  MNL: ['นินอย อากีโน', 'มะนิลา'],
  CEB: ['เซบู', 'เซบู'],
  HAN: ['โหน่ยบ่าย', 'ฮานอย'],
  SGN: ['เตินเซินเญิ้ต', 'โฮจิมินห์'],
  DAD: ['ดานัง', 'ดานัง'],
  CXR: ['กามซัญ', 'ญาจาง'],
  PQC: ['ฟูก๊วก', 'ฟูก๊วก'],
  REP: ['เสียมเรียบ', 'เสียมเรียบ'],
  PNH: ['พนมเปญ', 'พนมเปญ'],
  VTE: ['วัตไต', 'เวียงจันทน์'],
  LPQ: ['หลวงพระบาง', 'หลวงพระบาง'],
  RGN: ['ย่างกุ้ง', 'ย่างกุ้ง'],
  DEL: ['เดลี', 'นิวเดลี'],
  BOM: ['มุมไบ', 'มุมไบ'],
  MLE: ['เวลานา', 'มัลดีฟส์'],
  CMB: ['โคลัมโบ', 'โคลัมโบ'],
  KTM: ['กาฐมาณฑุ', 'กาฐมาณฑุ'],
  DXB: ['ดูไบ', 'ดูไบ'],
  AUH: ['อาบูดาบี', 'อาบูดาบี'],
  DOH: ['ฮาหมัด', 'โดฮา'],
  IST: ['อิสตันบูล', 'อิสตันบูล'],
  TLV: ['เบน กูเรียน', 'เทลอาวีฟ'],
  CAI: ['ไคโร', 'ไคโร'],
  LHR: ['ฮีทโธรว์', 'ลอนดอน'],
  LGW: ['แกตวิก', 'ลอนดอน'],
  CDG: ['ชาร์ล เดอ โกล', 'ปารีส'],
  ORY: ['ออร์ลี', 'ปารีส'],
  AMS: ['สคิปโฮล', 'อัมสเตอร์ดัม'],
  FRA: ['แฟรงก์เฟิร์ต', 'แฟรงก์เฟิร์ต'],
  MUC: ['มิวนิก', 'มิวนิก'],
  BER: ['เบอร์ลิน', 'เบอร์ลิน'],
  ZRH: ['ซูริก', 'ซูริก'],
  GVA: ['เจนีวา', 'เจนีวา'],
  VIE: ['เวียนนา', 'เวียนนา'],
  PRG: ['ปราก', 'ปราก'],
  BCN: ['บาร์เซโลนา', 'บาร์เซโลนา'],
  MAD: ['มาดริด', 'มาดริด'],
  LIS: ['ลิสบอน', 'ลิสบอน'],
  OPO: ['ปอร์โต', 'ปอร์โต'],
  FCO: ['ฟีอูมีชีโน', 'โรม'],
  MXP: ['มัลเปนซา', 'มิลาน'],
  VCE: ['เวนิส', 'เวนิส'],
  ATH: ['เอเธนส์', 'เอเธนส์'],
  CPH: ['โคเปนเฮเกน', 'โคเปนเฮเกน'],
  OSL: ['ออสโล', 'ออสโล'],
  ARN: ['อาร์ลันดา', 'สตอกโฮล์ม'],
  HEL: ['เฮลซิงกิ', 'เฮลซิงกิ'],
  KEF: ['เคฟลาวิก', 'เรคยาวิก'],
  DUB: ['ดับลิน', 'ดับลิน'],
  EDI: ['เอดินบะระ', 'เอดินบะระ'],
  WAW: ['วอร์ซอ', 'วอร์ซอ'],
  BUD: ['บูดาเปสต์', 'บูดาเปสต์'],
  JFK: ['เจเอฟเค', 'นิวยอร์ก'],
  EWR: ['นวร์ก', 'นิวยอร์ก'],
  LAX: ['แอลเอเอ็กซ์', 'ลอสแอนเจลิส'],
  SFO: ['ซานฟรานซิสโก', 'ซานฟรานซิสโก'],
  SEA: ['ซีแทค', 'ซีแอตเทิล'],
  ORD: ['โอแฮร์', 'ชิคาโก'],
  BOS: ['โลแกน', 'บอสตัน'],
  HNL: ['โฮโนลูลู', 'โฮโนลูลู'],
  LAS: ['แฮร์รี รีด', 'ลาสเวกัส'],
  YVR: ['แวนคูเวอร์', 'แวนคูเวอร์'],
  YYZ: ['เพียร์สัน', 'โตรอนโต'],
  MEX: ['เม็กซิโกซิตี', 'เม็กซิโกซิตี'],
  GRU: ['กวารูลยูส', 'เซาเปาโล'],
  SYD: ['ซิดนีย์', 'ซิดนีย์'],
  MEL: ['เมลเบิร์น', 'เมลเบิร์น'],
  BNE: ['บริสเบน', 'บริสเบน'],
  PER: ['เพิร์ธ', 'เพิร์ธ'],
  AKL: ['โอ๊คแลนด์', 'โอ๊คแลนด์'],
  CHC: ['ไครสต์เชิร์ช', 'ไครสต์เชิร์ช'],
  ZQN: ['ควีนส์ทาวน์', 'ควีนส์ทาวน์'],
  CPT: ['เคปทาวน์', 'เคปทาวน์'],
  JNB: ['โจฮันเนสเบิร์ก', 'โจฮันเนสเบิร์ก'],
  NAN: ['นาดี', 'ฟิจิ'],
};

/**
 * Hubs a search should float to the top. Ranking is otherwise "large airport
 * beats medium", which is not enough to keep LHR above LHE for "LH".
 */
const HUBS = [
  'BKK', 'DMK', 'HKT', 'CNX', 'NRT', 'HND', 'KIX', 'CTS', 'FUK', 'OKA', 'NGO',
  'ICN', 'GMP', 'PUS', 'TPE', 'HKG', 'MFM', 'SIN', 'KUL', 'CGK', 'DPS', 'MNL',
  'HAN', 'SGN', 'DAD', 'REP', 'PNH', 'RGN', 'PVG', 'PEK', 'PKX', 'CAN', 'SZX',
  'CTU', 'DEL', 'BOM', 'MLE', 'DXB', 'DOH', 'AUH', 'IST', 'LHR', 'LGW', 'CDG',
  'AMS', 'FRA', 'MUC', 'BER', 'ZRH', 'VIE', 'BCN', 'MAD', 'LIS', 'FCO', 'MXP',
  'CPH', 'ARN', 'OSL', 'HEL', 'KEF', 'DUB', 'PRG', 'JFK', 'EWR', 'LAX', 'SFO',
  'SEA', 'ORD', 'BOS', 'HNL', 'LAS', 'YVR', 'YYZ', 'SYD', 'MEL', 'BNE', 'AKL',
  'PER', 'CPT', 'JNB', 'GRU', 'MEX',
];

/* ------------------------------------------------------------------ fetch -- */

/** npm pack + untar into a temp dir; returns tarball stem → extracted package. */
function fetchPackages() {
  const root = mkdtempSync(path.join(tmpdir(), 'rove-airports-'));
  console.error(`↓ npm pack ${PACKAGES.join(' ')}`);
  const out = execFileSync('npm', ['pack', '--silent', ...PACKAGES], { cwd: root, encoding: 'utf8' });

  const dirs = [];
  for (const tgz of out.trim().split('\n').filter(Boolean)) {
    const stem = tgz.replace(/\.tgz$/, '');
    execFileSync('tar', ['xzf', tgz, '-C', root, `--one-top-level=${stem}`], { cwd: root });
    dirs.push([stem, path.join(root, stem, 'package')]);
  }
  return dirs;
}

/** Version numbers move; match on the name npm put in front of them. */
function packageDir(dirs, prefix) {
  const hit = dirs.find(([stem]) => stem.startsWith(prefix));
  if (!hit) throw new Error(`npm pack produced no tarball for ${prefix}`);
  return hit[1];
}

/* ------------------------------------------------------------------ build -- */

async function build() {
  const dirs = fetchPackages();
  const require_ = createRequire(import.meta.url);

  const airportData = require_(path.join(packageDir(dirs, 'airport-data-js-'), 'lib', 'index.js'));

  const openFlights = JSON.parse(
    readFileSync(path.join(packageDir(dirs, 'nwpr-airport-codes-'), 'dist', 'airports.json'), 'utf8'),
  );

  const isoDir = packageDir(dirs, 'i18n-iso-countries-');
  const countryTH = JSON.parse(readFileSync(path.join(isoDir, 'langs', 'th.json'), 'utf8')).countries;
  const countryEN = JSON.parse(readFileSync(path.join(isoDir, 'langs', 'en.json'), 'utf8')).countries;

  // OurAirports rows, continent by continent — the package has no "give me
  // everything" call.
  const raw = [];
  for (const continent of ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA']) {
    raw.push(...(await airportData.getAirportByContinent(continent)));
  }

  const cityByIata = new Map();
  for (const a of openFlights) {
    if (a.iata && /^[A-Z]{3}$/.test(a.iata) && a.city) cityByIata.set(a.iata, a.city.trim());
  }

  const hubRank = new Map(HUBS.map((code, index) => [code, HUBS.length - index]));

  const seen = new Set();
  const airports = [];

  for (const a of raw) {
    const iata = (a.iata ?? '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
    if (String(a.scheduled_service).toUpperCase() !== 'TRUE') continue;
    if (a.type !== 'large_airport' && a.type !== 'medium_airport') continue;
    if (!countryEN[a.country_code]) continue;

    seen.add(iata);
    airports.push([
      iata,
      cleanName(a.airport),
      cityByIata.get(iata) ?? cityFromName(a.airport),
      a.country_code,
      a.time ?? '',
      a.type === 'large_airport' ? 1 : 0,
      round(a.latitude),
      round(a.longitude),
      hubRank.get(iata) ?? 0,
    ]);
  }

  airports.sort((x, y) => y[8] - x[8] || y[5] - x[5] || x[0].localeCompare(y[0]));

  const countries = {};
  for (const [, , , cc] of airports) {
    if (countries[cc]) continue;
    countries[cc] = [first(countryTH[cc]) ?? first(countryEN[cc]), first(countryEN[cc])];
  }

  const payload = {
    // Row layout, shared by apps/api/pkg/services/airports and apps/web:
    // [iata, name, city, countryCode, tz, isLarge, lat, lon, hubRank]
    fields: ['iata', 'name', 'city', 'country', 'tz', 'large', 'lat', 'lon', 'rank'],
    source: 'OurAirports + OpenFlights (npm: airport-data-js, @nwpr/airport-codes, i18n-iso-countries)',
    countries,
    thai: THAI,
    airports,
  };

  write(path.join(ROOT, 'apps/api/data/airports.json'), payload);
  write(path.join(ROOT, 'apps/web/lib/data/airports.data.json'), payload);
  console.error(`✓ ${airports.length} airports · ${Object.keys(countries).length} countries`);
}

function write(file, payload) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(payload) + '\n');
  console.error(`→ ${path.relative(ROOT, file)}`);
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const round = (v) => Math.round(Number(v) * 100) / 100;

/** "Tokyo Narita International Airport" reads better without the boilerplate. */
function cleanName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Last resort when OpenFlights has no city: "Awareh Airport" → "Awareh". */
function cityFromName(name) {
  return cleanName(name)
    .replace(/\s+(International|Regional|Municipal|Domestic)?\s*(Airport|Airfield|Airbase|Air Base|Heliport)$/i, '')
    .trim();
}

await build();
