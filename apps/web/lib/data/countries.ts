/**
 * The countries the product names by hand (Feedback #2 — D-18, D-19, F2.4).
 *
 * The worldwide table lives in `airports.data.json`, 320 kB behind a dynamic
 * import that only the airport picker pays for. The home calendar, the dream
 * stack and the explore filter need a name and a flag for a handful of codes
 * on first paint, so the ones a Thai traveller actually meets are written out
 * here and everything else falls back to the code itself.
 */
export interface Country {
  code: string;
  th: string;
  en: string;
}

export const COUNTRIES: Country[] = [
  { code: 'JP', th: 'ญี่ปุ่น', en: 'Japan' },
  { code: 'KR', th: 'เกาหลีใต้', en: 'South Korea' },
  { code: 'TW', th: 'ไต้หวัน', en: 'Taiwan' },
  { code: 'TH', th: 'ไทย', en: 'Thailand' },
  { code: 'VN', th: 'เวียดนาม', en: 'Vietnam' },
  { code: 'SG', th: 'สิงคโปร์', en: 'Singapore' },
  { code: 'MY', th: 'มาเลเซีย', en: 'Malaysia' },
  { code: 'ID', th: 'อินโดนีเซีย', en: 'Indonesia' },
  { code: 'PH', th: 'ฟิลิปปินส์', en: 'Philippines' },
  { code: 'KH', th: 'กัมพูชา', en: 'Cambodia' },
  { code: 'LA', th: 'ลาว', en: 'Laos' },
  { code: 'MM', th: 'เมียนมา', en: 'Myanmar' },
  { code: 'HK', th: 'ฮ่องกง', en: 'Hong Kong' },
  { code: 'MO', th: 'มาเก๊า', en: 'Macao' },
  { code: 'CN', th: 'จีน', en: 'China' },
  { code: 'IN', th: 'อินเดีย', en: 'India' },
  { code: 'NP', th: 'เนปาล', en: 'Nepal' },
  { code: 'LK', th: 'ศรีลังกา', en: 'Sri Lanka' },
  { code: 'MV', th: 'มัลดีฟส์', en: 'Maldives' },
  { code: 'AE', th: 'สหรัฐอาหรับเอมิเรตส์', en: 'United Arab Emirates' },
  { code: 'QA', th: 'กาตาร์', en: 'Qatar' },
  { code: 'TR', th: 'ตุรกี', en: 'Türkiye' },
  { code: 'GE', th: 'จอร์เจีย', en: 'Georgia' },
  { code: 'EG', th: 'อียิปต์', en: 'Egypt' },
  { code: 'MA', th: 'โมร็อกโก', en: 'Morocco' },
  { code: 'ZA', th: 'แอฟริกาใต้', en: 'South Africa' },
  { code: 'AU', th: 'ออสเตรเลีย', en: 'Australia' },
  { code: 'NZ', th: 'นิวซีแลนด์', en: 'New Zealand' },
  { code: 'GB', th: 'สหราชอาณาจักร', en: 'United Kingdom' },
  { code: 'IE', th: 'ไอร์แลนด์', en: 'Ireland' },
  { code: 'FR', th: 'ฝรั่งเศส', en: 'France' },
  { code: 'DE', th: 'เยอรมนี', en: 'Germany' },
  { code: 'NL', th: 'เนเธอร์แลนด์', en: 'Netherlands' },
  { code: 'BE', th: 'เบลเยียม', en: 'Belgium' },
  { code: 'CH', th: 'สวิตเซอร์แลนด์', en: 'Switzerland' },
  { code: 'AT', th: 'ออสเตรีย', en: 'Austria' },
  { code: 'IT', th: 'อิตาลี', en: 'Italy' },
  { code: 'ES', th: 'สเปน', en: 'Spain' },
  { code: 'PT', th: 'โปรตุเกส', en: 'Portugal' },
  { code: 'GR', th: 'กรีซ', en: 'Greece' },
  { code: 'CZ', th: 'เช็ก', en: 'Czechia' },
  { code: 'HU', th: 'ฮังการี', en: 'Hungary' },
  { code: 'PL', th: 'โปแลนด์', en: 'Poland' },
  { code: 'DK', th: 'เดนมาร์ก', en: 'Denmark' },
  { code: 'SE', th: 'สวีเดน', en: 'Sweden' },
  { code: 'NO', th: 'นอร์เวย์', en: 'Norway' },
  { code: 'FI', th: 'ฟินแลนด์', en: 'Finland' },
  { code: 'IS', th: 'ไอซ์แลนด์', en: 'Iceland' },
  { code: 'US', th: 'สหรัฐอเมริกา', en: 'United States' },
  { code: 'CA', th: 'แคนาดา', en: 'Canada' },
  { code: 'MX', th: 'เม็กซิโก', en: 'Mexico' },
  { code: 'BR', th: 'บราซิล', en: 'Brazil' },
  { code: 'AR', th: 'อาร์เจนตินา', en: 'Argentina' },
  { code: 'PE', th: 'เปรู', en: 'Peru' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_TH = new Map(COUNTRIES.map((c) => [c.th, c]));

export function countryName(code: string | null | undefined, locale: 'th' | 'en' = 'th') {
  if (!code) return '';
  const found = BY_CODE.get(code.toUpperCase());
  return found ? found[locale] : code.toUpperCase();
}

/** The flag for a country code — "🇯🇵". Empty for a blank; a white flag for junk. */
export function flagOf(code: string | null | undefined) {
  if (!code) return '';
  if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️';
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/**
 * "ญี่ปุ่น · ฮิเมจิ" → "JP". The dream list has carried country and city as
 * one Thai string since M15; a code was added later (D-19), and the older
 * rows get theirs from the name they already hold.
 */
export function guessCountry(destination: string | null | undefined): string {
  if (!destination) return '';
  const head = destination.split('·')[0]?.trim() ?? '';
  return BY_TH.get(head)?.code ?? '';
}
