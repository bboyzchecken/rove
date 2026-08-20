import type { BookingEntry, DestinationSuggestion, Poi, PrepTask } from '../types';

/**
 * Reference data the mock repository serves in place of a real provider.
 *
 * In live mode the equivalents come from the API: destinations from
 * `pkg/domain/destination.go`, POIs from the `pois` table + Google Places,
 * prep rows from the country template, booking offers from the affiliate
 * service. Keeping them here — and only here — means mock mode never has to
 * reach the network to look plausible.
 */

/* --------------------------------------------------------- destinations -- */

type DestinationSeed = Omit<DestinationSuggestion, 'fit' | 'recommended' | 'pill' | 'reason'> & {
  /** Trip lengths this destination is comfortable at. */
  idealDays: [number, number];
  /** Months (1–12) the destination is at its best. */
  bestMonths: number[];
  reasons: { short: string; long: string };
};

const DESTINATION_SEEDS: DestinationSeed[] = [
  {
    id: 'japan',
    country: 'JP',
    flag: '🇯🇵',
    name: 'ญี่ปุ่น',
    cities: ['โตเกียว', 'โยโกฮาม่า'],
    subtitle: 'โตเกียว · โยโกฮาม่า',
    accent: 'primary',
    budgetPerPersonThb: [35_000, 55_000],
    flightHours: 6,
    weather: { high: 12, low: 4, text: 'หนาวแห้ง ท้องฟ้าใส' },
    idealDays: [4, 8],
    bestMonths: [3, 4, 10, 11, 12],
    reasons: {
      short: 'Tokyo loop จบใน 4–5 วันได้พอดี ไม่ต้องเร่ง',
      long: 'มีเวลาพอต่อเกียวโตหรือคาวากูจิโกะได้อีกขา',
    },
  },
  {
    id: 'korea',
    country: 'KR',
    flag: '🇰🇷',
    name: 'เกาหลีใต้',
    cities: ['โซล', 'นัมซาน'],
    subtitle: 'โซล · นัมซาน',
    accent: 'sky',
    budgetPerPersonThb: [28_000, 40_000],
    flightHours: 5.5,
    weather: { high: 6, low: -2, text: 'มีโอกาสเจอหิมะแรกของปี' },
    idealDays: [3, 6],
    bestMonths: [4, 5, 10, 11, 12],
    reasons: {
      short: 'โซลเที่ยวได้ครบใน 3–4 วัน เดินทางในเมืองง่าย',
      long: 'ต่อปูซานหรือคังวอนโดได้ถ้ามีวันเหลือ',
    },
  },
  {
    id: 'taiwan',
    country: 'TW',
    flag: '🇹🇼',
    name: 'ไต้หวัน',
    cities: ['ไทเป', 'จิ่วเฟิ่น'],
    subtitle: 'ไทเป · จิ่วเฟิ่น',
    accent: 'matcha',
    budgetPerPersonThb: [18_000, 28_000],
    flightHours: 3.75,
    weather: { high: 20, low: 14, text: 'เย็นสบาย ไม่หนาวจัด' },
    idealDays: [3, 5],
    bestMonths: [10, 11, 12, 1, 2, 3],
    reasons: {
      short: 'บินสั้น งบเบาที่สุดในกลุ่มนี้ กิน-ช้อปครบ',
      long: 'พอไปฮวาเหลียนหรือไถจงเพิ่มได้อีกวัน',
    },
  },
  {
    id: 'vietnam',
    country: 'VN',
    flag: '🇻🇳',
    name: 'เวียดนาม',
    cities: ['ฮานอย', 'ซาปา'],
    subtitle: 'ฮานอย · ซาปา',
    accent: 'sun',
    budgetPerPersonThb: [12_000, 20_000],
    flightHours: 1.75,
    weather: { high: 19, low: 13, text: 'เย็นชื้น หมอกลงที่ซาปา' },
    idealDays: [3, 5],
    bestMonths: [11, 12, 1, 2, 3],
    reasons: {
      short: 'บินไม่ถึง 2 ชม. เหมาะกับทริปสั้นที่ไม่อยากเสียวันไปกับการเดินทาง',
      long: 'ต่อฮาลองเบย์ค้างคืนได้สบาย',
    },
  },
  {
    id: 'hongkong',
    country: 'HK',
    flag: '🇭🇰',
    name: 'ฮ่องกง',
    cities: ['ฮ่องกง', 'มาเก๊า'],
    subtitle: 'ฮ่องกง · มาเก๊า',
    accent: 'joyfull',
    budgetPerPersonThb: [20_000, 32_000],
    flightHours: 2.75,
    weather: { high: 21, low: 16, text: 'อากาศดีที่สุดของปี' },
    idealDays: [3, 4],
    bestMonths: [10, 11, 12, 1],
    reasons: {
      short: 'เมืองเดียวจบ เดินทางในเมืองไม่กินเวลา',
      long: 'ข้ามไปมาเก๊าได้อีกวันด้วยเรือ 1 ชม.',
    },
  },
];

/**
 * Ranks the catalogue for a locked window — the same shape A2.6 returns.
 *
 * Three things decide the order, in the order a group actually argues about
 * them: does the trip fit the days we got, is this the right season, and can
 * we afford it. Flight time only breaks ties, and only on short trips, where
 * a 6-hour flight really does cost a day of the five.
 */
export function rankDestinations(
  days: number,
  month: number,
  budgetPerPersonThb = 0,
): DestinationSuggestion[] {
  const ranked: DestinationSuggestion[] = DESTINATION_SEEDS.map((seed) => {
    const [minDays, maxDays] = seed.idealDays;
    const lengthFit =
      days >= minDays && days <= maxDays
        ? 100
        : days < minDays
          ? Math.max(30, 100 - (minDays - days) * 22)
          : Math.max(45, 100 - (days - maxDays) * 12);

    const seasonFit = seed.bestMonths.includes(month) ? 100 : 62;

    // Budget fit: the band's midpoint against what the group set aside. Coming
    // in under budget is never a penalty; going over is, steeply.
    const mid = (seed.budgetPerPersonThb[0] + seed.budgetPerPersonThb[1]) / 2;
    const budgetFit =
      budgetPerPersonThb <= 0
        ? 80
        : mid <= budgetPerPersonThb
          ? Math.round(88 + Math.min(12, ((budgetPerPersonThb - mid) / budgetPerPersonThb) * 40))
          : Math.max(25, Math.round(100 - ((mid - budgetPerPersonThb) / budgetPerPersonThb) * 130));

    // On a short trip the flight is a bigger share of the holiday.
    const flightPenalty = days <= 4 ? Math.round(seed.flightHours * 2.2) : 0;

    const fit = Math.max(
      1,
      Math.min(
        100,
        Math.round(lengthFit * 0.44 + seasonFit * 0.28 + budgetFit * 0.28 - flightPenalty),
      ),
    );
    const long = days > seed.idealDays[1] - 1;

    const pill =
      budgetPerPersonThb > 0 && mid > budgetPerPersonThb
        ? 'เกินงบที่ตั้งไว้'
        : seasonFit === 100
          ? 'ช่วงนี้สวยที่สุด'
          : `${days} วันไปได้`;

    return {
      id: seed.id,
      country: seed.country,
      flag: seed.flag,
      name: seed.name,
      cities: seed.cities,
      subtitle: seed.subtitle,
      accent: seed.accent,
      budgetPerPersonThb: seed.budgetPerPersonThb,
      flightHours: seed.flightHours,
      weather: seed.weather,
      fit,
      recommended: false,
      pill,
      reason: `${long ? seed.reasons.long : seed.reasons.short} · งบ ${seed.budgetPerPersonThb[0].toLocaleString('th-TH')}–${seed.budgetPerPersonThb[1].toLocaleString('th-TH')} บาท/คน`,
    };
  }).sort((a, b) => b.fit - a.fit);

  if (ranked[0]) {
    ranked[0].recommended = true;
    ranked[0].pill = 'แนะนำสำหรับกลุ่มนี้';
  }
  return ranked;
}

/* ------------------------------------------------------------------ poi -- */

export const POIS: Poi[] = [
  {
    id: 'poi-teamlab',
    name: 'teamLab Planets',
    nameEn: 'teamLab Planets TOKYO',
    city: 'โตเกียว',
    area: 'โทโยสุ',
    category: 'พิพิธภัณฑ์',
    lat: 35.6497,
    lng: 139.7903,
    rating: 4.4,
    openHours: '09:00–22:00',
    costJpy: 3_800,
    tags: ['ต้องจองล่วงหน้า', 'ในร่ม', 'ถ่ายรูปสวย'],
  },
  {
    id: 'poi-fushimi',
    name: 'ศาลเจ้าฟุชิมิอินาริ',
    nameEn: 'Fushimi Inari Taisha',
    city: 'เกียวโต',
    area: 'ฟุชิมิ',
    category: 'ศาลเจ้า',
    lat: 34.9671,
    lng: 135.7727,
    rating: 4.7,
    openHours: 'เปิด 24 ชม.',
    costJpy: 0,
    tags: ['ไปเช้าดี', 'เดินเยอะ', 'ฟรี'],
  },
  {
    id: 'poi-shibuya',
    name: 'Shibuya Sky',
    city: 'โตเกียว',
    area: 'ชิบุยะ',
    category: 'จุดชมวิว',
    lat: 35.6581,
    lng: 139.7017,
    rating: 4.5,
    openHours: '10:00–22:30',
    costJpy: 2_500,
    tags: ['พระอาทิตย์ตก', 'ต้องจองล่วงหน้า'],
  },
  {
    id: 'poi-tsukiji',
    name: 'ตลาดสึกิจิ',
    nameEn: 'Tsukiji Outer Market',
    city: 'โตเกียว',
    area: 'สึกิจิ',
    category: 'ตลาด/ของกิน',
    lat: 35.6654,
    lng: 139.7707,
    rating: 4.3,
    openHours: '05:00–14:00',
    costJpy: 2_000,
    tags: ['ไปเช้า', 'ของกิน'],
  },
  {
    id: 'poi-kawaguchiko',
    name: 'ทะเลสาบคาวากูจิโกะ',
    nameEn: 'Lake Kawaguchiko',
    city: 'ยามานาชิ',
    category: 'ธรรมชาติ',
    lat: 35.5171,
    lng: 138.7529,
    rating: 4.6,
    openHours: 'ตลอดวัน',
    costJpy: 0,
    tags: ['เห็นฟูจิ', 'ไปเช้ากลับเย็น'],
  },
  {
    id: 'poi-arashiyama',
    name: 'ป่าไผ่อาราชิยาม่า',
    nameEn: 'Arashiyama Bamboo Grove',
    city: 'เกียวโต',
    area: 'อาราชิยาม่า',
    category: 'ธรรมชาติ',
    lat: 35.0176,
    lng: 135.6685,
    rating: 4.4,
    openHours: 'เปิด 24 ชม.',
    costJpy: 0,
    tags: ['ไปเช้าเลี่ยงคน', 'ฟรี'],
  },
  {
    id: 'poi-dotonbori',
    name: 'โดทงโบริ',
    nameEn: 'Dotonbori',
    city: 'โอซาก้า',
    area: 'นัมบะ',
    category: 'ย่านกลางคืน',
    lat: 34.6687,
    lng: 135.5031,
    rating: 4.5,
    openHours: 'ตลอดวัน',
    costJpy: 3_000,
    tags: ['กลางคืน', 'ของกิน'],
  },
  {
    id: 'poi-nara',
    name: 'สวนกวางนารา',
    nameEn: 'Nara Park',
    city: 'นารา',
    category: 'สวนสาธารณะ',
    lat: 34.685,
    lng: 135.843,
    rating: 4.6,
    openHours: 'เปิด 24 ชม.',
    costJpy: 200,
    tags: ['เดย์ทริป', 'เด็กชอบ'],
  },
];

/* ----------------------------------------------------------------- prep -- */

/** The Japan template (A8.2). Live mode keys this by destination_country. */
export const PREP_TEMPLATE: Omit<PrepTask, 'id' | 'done'>[] = [
  { title: 'เช็กวันหมดอายุพาสปอร์ต (เหลือ > 6 เดือน)', category: 'document', assigneeId: null, fromTemplate: true },
  { title: 'ลงทะเบียน Visit Japan Web ล่วงหน้า', category: 'document', assigneeId: null, fromTemplate: true },
  { title: 'ซื้อประกันเดินทาง', category: 'health', assigneeId: null, fromTemplate: true },
  { title: 'ซื้อ eSIM / pocket wifi', category: 'booking', assigneeId: null, fromTemplate: true },
  { title: 'แลกเงินเยน / เปิดบัตรที่กดเงินต่างประเทศได้', category: 'money', assigneeId: null, fromTemplate: true },
  { title: 'จองที่พักให้ครบทุกคืน', category: 'booking', assigneeId: null, fromTemplate: true },
  { title: 'เตรียมยาประจำตัว + ยาแก้หวัด', category: 'health', assigneeId: null, fromTemplate: true },
  { title: 'เตรียมเสื้อกันหนาว / ร่มพับ', category: 'packing', assigneeId: null, fromTemplate: true },
  { title: 'ปลั๊กแปลง Type A + power bank', category: 'packing', assigneeId: null, fromTemplate: true },
  { title: 'ตั้งกลุ่มแชร์ตำแหน่งไว้ใช้ตอนหลง', category: 'other', assigneeId: null, fromTemplate: true },
];

/* -------------------------------------------------------------- booking -- */

/**
 * Partner offers. In live mode the URL is /go/:id so the click can be counted
 * before redirecting to the affiliate link (D0.6); mock mode links straight out.
 */
export const BOOKING_OFFERS: Omit<BookingEntry, 'id' | 'status'>[] = [
  {
    kind: 'stay',
    title: 'Shinjuku Granbell Hotel — ห้องคู่ 2 เตียง',
    partner: 'Agoda',
    url: 'https://www.agoda.com/',
    pricePerPersonThb: 2_400,
    note: 'ยกเลิกฟรีถึง 7 วันก่อนเข้าพัก',
  },
  {
    kind: 'stay',
    title: 'MIMARU Tokyo Ueno — ห้องครอบครัว 4 คน',
    partner: 'Booking.com',
    url: 'https://www.booking.com/',
    pricePerPersonThb: 1_950,
    note: 'ห้องเดียวพอทั้งกลุ่ม มีครัวเล็ก',
  },
  {
    kind: 'activity',
    title: 'ตั๋ว teamLab Planets (จองล่วงหน้า)',
    partner: 'Klook',
    url: 'https://www.klook.com/',
    pricePerPersonThb: 890,
    note: 'ต้องเลือกรอบเวลาเข้าชม',
  },
  {
    kind: 'activity',
    title: 'ทัวร์ฟูจิ–คาวากูจิโกะ 1 วัน',
    partner: 'KKday',
    url: 'https://www.kkday.com/',
    pricePerPersonThb: 1_650,
    note: 'รถรับ-ส่งจากชินจูกุ',
  },
  {
    kind: 'transport',
    title: 'JR Pass 7 วัน',
    partner: 'Klook',
    url: 'https://www.klook.com/',
    pricePerPersonThb: 11_500,
    note: 'คุ้มถ้าไปโตเกียว–เกียวโต–โอซาก้า',
  },
  {
    kind: 'esim',
    title: 'eSIM ญี่ปุ่น 10GB / 15 วัน',
    partner: 'Airalo',
    url: 'https://www.airalo.com/',
    pricePerPersonThb: 420,
    note: 'เปิดใช้งานตอนถึงสนามบินได้เลย',
  },
  {
    kind: 'insurance',
    title: 'ประกันเดินทางเอเชีย 8 วัน',
    partner: 'Rabbit Care',
    url: 'https://rabbitcare.com/',
    pricePerPersonThb: 520,
    note: 'ครอบคลุมค่ารักษา 2 ล้านบาท',
  },
];
