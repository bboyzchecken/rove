import type {
  CalendarTrip,
  DreamItem,
  PastTrip,
  PlanDay,
  RecapDecision,
  RecapSpend,
  YearStats,
} from '../../model';

/**
 * What opening a trip to the public pays (DEV_SPEC §6.5). The API awards the
 * same 500 from `domain.PointsPerPublish`; mock mode has to say it itself.
 */
export const POINTS_PER_PUBLISH = 500;

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
    endDate: '2026-03-16',
    days: 5,
    places: 21,
    spentThb: 32_800,
    cover: '/brand/covers/cover-korea.webp',
    memberIds: ['m1', 'm2', 'm3'],
    visibility: 'public',
    publicSlug: 'seoul-with-friends-2569',
  },
  {
    id: 'danang',
    title: 'ดานัง–ฮอยอัน',
    cities: ['ดานัง', 'ฮอยอัน'],
    dateLabel: '2–5 พ.ค. 2569',
    endDate: '2026-05-05',
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
    endDate: '2026-07-21',
    days: 3,
    places: 11,
    spentThb: 6_400,
    cover: '/brand/covers/cover-thailand.webp',
    memberIds: ['m1', 'm2', 'm3', 'm4'],
  },
];

/**
 * What each finished trip left behind (M17 — W17.5).
 *
 * A past trip that is only a number on a card answers nothing six months later:
 * the question people actually come back with is "ตอนนั้นเราตัดสินใจยังไง" —
 * which hotel won, why day 2 looked like that, what the money went on. These are
 * the seeds for it; a live room derives the same shape from its own tables.
 */
export interface PastTripArchive {
  decisions: RecapDecision[];
  itinerary: PlanDay[];
  spending: RecapSpend[];
}

export const PAST_TRIP_ARCHIVES: Record<string, PastTripArchive> = {
  seoul: {
    decisions: [
      {
        id: 'seoul-dates',
        kind: 'dates',
        title: 'วันที่ไป',
        detail: '12–16 มี.ค. 2569 · 5 วัน — เป็นช่วงเดียวที่ลาตรงกันทั้งสามคน',
        decidedAt: '2026-01-18T13:05:00.000Z',
        decidedBy: 'm1',
      },
      {
        id: 'seoul-stay',
        kind: 'booking',
        title: 'จองจริง',
        detail: 'ที่พักย่านฮงแด · Agoda · ฿2,400 ต่อคน — เลือกฮงแดเพราะกลับดึกแล้วยังมีของกิน',
        decidedAt: '2026-01-26T09:20:00.000Z',
        decidedBy: 'm2',
      },
      {
        id: 'seoul-rationale-1',
        kind: 'rationale',
        title: 'เหตุผลที่จัดแบบนี้',
        detail: 'เอาพระราชวังไว้วันแรกเพราะเช่าฮันบกแล้วเข้าฟรี และวันแรกยังไม่เพลีย',
      },
      {
        id: 'seoul-rationale-2',
        kind: 'rationale',
        title: 'เหตุผลที่จัดแบบนี้',
        detail:
          'ตัดนามิซอมออกตั้งแต่วันที่สอง เพราะไป–กลับกินเวลา 6 ชม. แลกกับที่เที่ยวในเมืองอีก 4 ที่ไม่คุ้ม',
      },
      {
        id: 'seoul-vote',
        kind: 'vote',
        title: 'โหวตกันแล้ว',
        detail: 'ล็อตเต้เวิลด์ · 1 เอา / 2 ไม่เอา — เลยเปลี่ยนเป็นเดินตลาดควังจังแทน',
        decidedAt: '2026-02-02T15:40:00.000Z',
      },
    ],
    itinerary: [
      {
        id: 'seoul-d1',
        index: 1,
        date: '2026-03-12',
        label: 'วันที่ 1 · ถึงโซล',
        city: 'โซล',
        items: [
          {
            id: 'seoul-d1-1',
            type: 'flight',
            start: '08:20',
            title: 'สุวรรณภูมิ → อินชอน',
            area: 'ICN',
          },
          {
            id: 'seoul-d1-2',
            type: 'stay',
            start: '16:00',
            title: 'เช็คอินที่พักฮงแด',
            area: 'ฮงแด',
          },
          {
            id: 'seoul-d1-3',
            type: 'meal',
            start: '19:00',
            title: 'หมูย่างร้านเก่าในซอย',
            area: 'ฮงแด',
          },
        ],
      },
      {
        id: 'seoul-d2',
        index: 2,
        date: '2026-03-13',
        label: 'วันที่ 2 · พระราชวัง',
        city: 'โซล',
        items: [
          {
            id: 'seoul-d2-1',
            type: 'poi',
            start: '09:30',
            title: 'เช่าฮันบก + พระราชวังคย็องบก',
            area: 'จงโน',
          },
          {
            id: 'seoul-d2-2',
            type: 'poi',
            start: '13:30',
            title: 'หมู่บ้านบุกชนฮันอก',
            area: 'บุกชน',
          },
          { id: 'seoul-d2-3', type: 'poi', start: '18:30', title: 'ตลาดควังจัง', area: 'จงโน' },
        ],
      },
      {
        id: 'seoul-d3',
        index: 3,
        date: '2026-03-14',
        label: 'วันที่ 3 · ช้อปปิ้ง',
        city: 'โซล',
        items: [
          { id: 'seoul-d3-1', type: 'poi', start: '11:00', title: 'เมียงดง', area: 'เมียงดง' },
          {
            id: 'seoul-d3-2',
            type: 'poi',
            start: '17:00',
            title: 'ทาวเวอร์นัมซาน ตอนพระอาทิตย์ตก',
            area: 'นัมซาน',
          },
        ],
      },
      {
        id: 'seoul-d4',
        index: 4,
        date: '2026-03-15',
        label: 'วันที่ 4 · คาเฟ่',
        city: 'โซล',
        items: [
          {
            id: 'seoul-d4-1',
            type: 'poi',
            start: '10:30',
            title: 'ซองซูดง คาเฟ่ฮอปปิ้ง',
            area: 'ซองซู',
          },
          { id: 'seoul-d4-2', type: 'poi', start: '15:00', title: 'ฮันกัง ปาร์ค', area: 'ยออีโด' },
        ],
      },
      {
        id: 'seoul-d5',
        index: 5,
        date: '2026-03-16',
        label: 'วันที่ 5 · กลับ',
        city: 'โซล',
        items: [
          {
            id: 'seoul-d5-1',
            type: 'flight',
            start: '13:40',
            title: 'อินชอน → สุวรรณภูมิ',
            area: 'ICN',
          },
        ],
      },
    ],
    spending: [
      { category: 'ที่พัก', amountThb: 10_200 },
      { category: 'อาหาร', amountThb: 9_400 },
      { category: 'เดินทาง', amountThb: 6_800 },
      { category: 'ช้อปปิ้ง', amountThb: 4_300 },
      { category: 'ตั๋วเข้าชม', amountThb: 2_100 },
    ],
  },

  danang: {
    decisions: [
      {
        id: 'danang-dates',
        kind: 'dates',
        title: 'วันที่ไป',
        detail: '2–5 พ.ค. 2569 · 4 วัน — ต่อจากวันหยุดยาว ลาเพิ่มแค่วันเดียว',
        decidedAt: '2026-03-30T08:10:00.000Z',
        decidedBy: 'm1',
      },
      {
        id: 'danang-budget',
        kind: 'budget',
        title: 'งบที่ตั้งไว้',
        detail: '฿10,000 ต่อคน — จบจริงที่ ฿9,300',
      },
      {
        id: 'danang-rationale-1',
        kind: 'rationale',
        title: 'เหตุผลที่จัดแบบนี้',
        detail: 'นอนดานังทั้งทริปแล้วนั่งรถไปฮอยอันวันเดียว ถูกกว่าและไม่ต้องย้ายกระเป๋า',
      },
      {
        id: 'danang-booking',
        kind: 'booking',
        title: 'จองจริง',
        detail: 'รถรับส่งสนามบิน–ฮอยอันเหมาวัน · Klook · ฿750 ต่อคน',
        decidedBy: 'm4',
      },
    ],
    itinerary: [
      {
        id: 'danang-d1',
        index: 1,
        date: '2026-05-02',
        label: 'วันที่ 1 · ถึงดานัง',
        city: 'ดานัง',
        items: [
          {
            id: 'danang-d1-1',
            type: 'flight',
            start: '10:15',
            title: 'ดอนเมือง → ดานัง',
            area: 'DAD',
          },
          {
            id: 'danang-d1-2',
            type: 'poi',
            start: '17:30',
            title: 'สะพานมังกร',
            area: 'ริมแม่น้ำหาน',
          },
        ],
      },
      {
        id: 'danang-d2',
        index: 2,
        date: '2026-05-03',
        label: 'วันที่ 2 · บานาฮิลส์',
        city: 'ดานัง',
        items: [
          {
            id: 'danang-d2-1',
            type: 'poi',
            start: '08:00',
            title: 'บานาฮิลส์ + สะพานมือ',
            area: 'บานาฮิลส์',
          },
          {
            id: 'danang-d2-2',
            type: 'meal',
            start: '19:00',
            title: 'ซีฟู้ดหน้าหาดหมีเคว',
            area: 'หมีเคว',
          },
        ],
      },
      {
        id: 'danang-d3',
        index: 3,
        date: '2026-05-04',
        label: 'วันที่ 3 · ฮอยอัน',
        city: 'ฮอยอัน',
        items: [
          {
            id: 'danang-d3-1',
            type: 'poi',
            start: '10:00',
            title: 'เมืองเก่าฮอยอัน',
            area: 'ฮอยอัน',
          },
          {
            id: 'danang-d3-2',
            type: 'poi',
            start: '18:30',
            title: 'ลอยกระทงแม่น้ำทูโบน',
            area: 'ฮอยอัน',
          },
        ],
      },
      {
        id: 'danang-d4',
        index: 4,
        date: '2026-05-05',
        label: 'วันที่ 4 · กลับ',
        city: 'ดานัง',
        items: [
          {
            id: 'danang-d4-1',
            type: 'flight',
            start: '14:05',
            title: 'ดานัง → ดอนเมือง',
            area: 'DAD',
          },
        ],
      },
    ],
    spending: [
      { category: 'ที่พัก', amountThb: 5_600 },
      { category: 'อาหาร', amountThb: 5_100 },
      { category: 'เดินทาง', amountThb: 4_200 },
      { category: 'ตั๋วเข้าชม', amountThb: 3_700 },
    ],
  },

  pai: {
    decisions: [
      {
        id: 'pai-dates',
        kind: 'dates',
        title: 'วันที่ไป',
        detail: '19–21 ก.ค. 2569 · 3 วัน — เสาร์–จันทร์ ไม่ต้องลาเลย',
        decidedAt: '2026-07-02T11:25:00.000Z',
        decidedBy: 'm3',
      },
      {
        id: 'pai-vote',
        kind: 'vote',
        title: 'โหวตกันแล้ว',
        detail: 'ขับรถขึ้นเองแทนนั่งรถตู้ · 3 เอา / 1 ไม่เอา — แวะจุดชมวิวระหว่างทางได้',
        decidedAt: '2026-07-05T04:00:00.000Z',
      },
      {
        id: 'pai-rationale-1',
        kind: 'rationale',
        title: 'เหตุผลที่จัดแบบนี้',
        detail: 'เก็บวัดน้ำฮูกับกองแลนไว้ขามา เพราะขากลับต้องรีบให้ถึงเชียงใหม่ก่อนมืด',
      },
    ],
    itinerary: [
      {
        id: 'pai-d1',
        index: 1,
        date: '2026-07-19',
        label: 'วันที่ 1 · ขึ้นปาย',
        city: 'ปาย',
        items: [
          {
            id: 'pai-d1-1',
            type: 'transport',
            start: '08:00',
            title: 'เชียงใหม่ → ปาย (762 โค้ง)',
            area: 'ทางหลวง 1095',
          },
          { id: 'pai-d1-2', type: 'poi', start: '14:00', title: 'วัดน้ำฮู', area: 'เวียงเหนือ' },
          {
            id: 'pai-d1-3',
            type: 'poi',
            start: '18:00',
            title: 'ถนนคนเดินปาย',
            area: 'ตัวเมืองปาย',
          },
        ],
      },
      {
        id: 'pai-d2',
        index: 2,
        date: '2026-07-20',
        label: 'วันที่ 2 · รอบเมือง',
        city: 'ปาย',
        items: [
          {
            id: 'pai-d2-1',
            type: 'poi',
            start: '06:30',
            title: 'จุดชมวิวหยุนไหล',
            area: 'บ้านสันติชล',
          },
          { id: 'pai-d2-2', type: 'poi', start: '11:00', title: 'ปายแคนยอน', area: 'กองแล' },
          { id: 'pai-d2-3', type: 'poi', start: '15:30', title: 'น้ำตกหมอแปง', area: 'หมอแปง' },
        ],
      },
      {
        id: 'pai-d3',
        index: 3,
        date: '2026-07-21',
        label: 'วันที่ 3 · กลับ',
        city: 'ปาย',
        items: [
          {
            id: 'pai-d3-1',
            type: 'transport',
            start: '11:00',
            title: 'ปาย → เชียงใหม่',
            area: 'ทางหลวง 1095',
          },
        ],
      },
    ],
    spending: [
      { category: 'ที่พัก', amountThb: 2_400 },
      { category: 'อาหาร', amountThb: 1_900 },
      { category: 'เดินทาง', amountThb: 1_500 },
      { category: 'อื่นๆ', amountThb: 600 },
    ],
  },
};

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
