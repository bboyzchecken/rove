import type { CalendarTrip, DreamItem, PastTrip, YearStats } from './types';

/** The signed-in user of the prototype — ตอง, owner of the demo trip. */
export const CURRENT_USER = {
  id: 'm1',
  name: 'ตอง',
  handle: '@tong',
  characterId: 'shiba',
  /** ROVE points earned when someone books from a trip they made public. */
  points: 1_240,
  memberSince: '2568',
};

export const YEAR_STATS: YearStats = {
  year: 2569,
  trips: 3,
  days: 12,
  countries: 3,
  places: 47,
  spentThb: 86_400,
  // ม.ค. → ธ.ค. — how many days were spent travelling each month.
  monthlyDays: [0, 0, 5, 0, 4, 0, 3, 0, 0, 0, 0, 0],
};

export const UPCOMING: CalendarTrip[] = [
  {
    id: 'demo',
    title: 'ญี่ปุ่นใบไม้เปลี่ยนสี 2569',
    cities: ['โตเกียว', 'เกียวโต', 'โอซาก้า'],
    startDate: '2026-11-15',
    endDate: '2026-11-22',
    daysUntil: 88,
    cover: '/brand/covers/cover-japan.webp',
    memberIds: ['m1', 'm2', 'm3', 'm4'],
    weather: { icon: '🍁', high: 18, low: 10, text: 'ช่วงใบไม้แดงพอดี' },
  },
  {
    id: 'aurora',
    title: 'ล่าแสงเหนือที่ไอซ์แลนด์',
    cities: ['เรคยาวิก', 'วิก'],
    startDate: '2026-12-29',
    endDate: '2027-01-05',
    daysUntil: 132,
    cover: '/brand/covers/cover-iceland.webp',
    memberIds: ['m1', 'm2'],
    weather: { icon: '🌌', high: -2, low: -8, text: 'ฟ้าใส 3 คืนติด' },
  },
];

export const PAST_TRIPS: PastTrip[] = [
  {
    id: 'seoul',
    title: 'โซลกับเพื่อนสนิท',
    cities: ['โซล'],
    dateLabel: '12–16 มี.ค. 2569',
    days: 5,
    places: 21,
    spentThb: 32_800,
    cover: '/brand/covers/cover-korea.webp',
    memberIds: ['m1', 'm2', 'm3'],
  },
  {
    id: 'danang',
    title: 'ดานัง–ฮอยอัน',
    cities: ['ดานัง', 'ฮอยอัน'],
    dateLabel: '2–5 พ.ค. 2569',
    days: 4,
    places: 15,
    spentThb: 18_600,
    cover: '/brand/covers/cover-vietnam.webp',
    memberIds: ['m1', 'm4'],
  },
  {
    id: 'pai',
    title: 'ปายหนีร้อน',
    cities: ['ปาย'],
    dateLabel: '19–21 ก.ค. 2569',
    days: 3,
    places: 11,
    spentThb: 6_400,
    cover: '/brand/covers/cover-thailand.webp',
    memberIds: ['m1', 'm2', 'm3', 'm4'],
  },
];

export const DREAMS: DreamItem[] = [
  {
    id: 'dr1',
    title: 'นอนดูแสงเหนือในกระท่อมกระจก',
    destination: 'ฟินแลนด์ · โรวาเนียมิ',
    note: 'ช่วงที่ดีที่สุดคือ ก.ย.–มี.ค.',
    url: 'https://example.com/glass-igloo',
    accent: 'sky',
  },
  {
    id: 'dr2',
    title: 'เดินเส้น Nakasendo แบบ 2 วัน',
    destination: 'ญี่ปุ่น · สึมาโกะ–มาโกเมะ',
    note: 'ต่อจากทริปนี้ได้ถ้าเพิ่ม 2 วัน',
    accent: 'matcha',
  },
  {
    id: 'dr3',
    title: 'ล่องเรือฮาลองเบย์ค้างคืน',
    destination: 'เวียดนาม · ฮาลอง',
    accent: 'joyfull',
  },
  {
    id: 'dr4',
    title: 'ปีนขึ้นไปดูพระอาทิตย์ขึ้นที่ภูกระดึง',
    destination: 'ไทย · เลย',
    note: 'ต้องจองล่วงหน้าและไปช่วง พ.ย.–ม.ค.',
    accent: 'primary',
  },
  {
    id: 'dr5',
    title: 'ดูซากุระบานที่ปราสาทฮิเมจิ',
    destination: 'ญี่ปุ่น · ฮิเมจิ',
    url: 'https://example.com/himeji-sakura',
    accent: 'sun',
  },
];
