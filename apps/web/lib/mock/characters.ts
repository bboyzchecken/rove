import type { Character } from './types';

/**
 * The 20 fixed characters (DEV_SPEC M14). The same list is seeded server-side
 * from `apps/api/data/characters.json` — keep the ids identical.
 */
export const CHARACTERS: Character[] = [
  { id: 'shiba', name: 'ชิบะ', image: '/characters/char-01-shiba.webp', accent: 'primary' },
  { id: 'cat', name: 'แมวส้ม', image: '/characters/char-02-cat.webp', accent: 'sun' },
  {
    id: 'red-panda',
    name: 'เรดแพนด้า',
    image: '/characters/char-03-red-panda.webp',
    accent: 'primary',
  },
  { id: 'bear', name: 'หมีน้อย', image: '/characters/char-04-bear.webp', accent: 'sun' },
  { id: 'rabbit', name: 'กระต่าย', image: '/characters/char-05-rabbit.webp', accent: 'joyfull' },
  { id: 'fox', name: 'จิ้งจอก', image: '/characters/char-06-fox.webp', accent: 'primary' },
  { id: 'penguin', name: 'เพนกวิน', image: '/characters/char-07-penguin.webp', accent: 'sky' },
  { id: 'owl', name: 'นกฮูก', image: '/characters/char-08-owl.webp', accent: 'sun' },
  { id: 'deer', name: 'กวางน้อย', image: '/characters/char-09-deer.webp', accent: 'primary' },
  {
    id: 'hedgehog',
    name: 'เม่นแคระ',
    image: '/characters/char-10-hedgehog.webp',
    accent: 'joyfull',
  },
  {
    id: 'capybara',
    name: 'คาปิบารา',
    image: '/characters/char-11-capybara.webp',
    accent: 'matcha',
  },
  { id: 'koala', name: 'โคอาลา', image: '/characters/char-12-koala.webp', accent: 'sky' },
  { id: 'panda', name: 'แพนด้า', image: '/characters/char-13-panda.webp', accent: 'matcha' },
  { id: 'tiger', name: 'เสือน้อย', image: '/characters/char-14-tiger.webp', accent: 'sun' },
  { id: 'otter', name: 'นาก', image: '/characters/char-15-otter.webp', accent: 'sky' },
  { id: 'whale', name: 'วาฬ', image: '/characters/char-16-whale.webp', accent: 'sky' },
  { id: 'frog', name: 'กบ', image: '/characters/char-17-frog.webp', accent: 'matcha' },
  { id: 'sheep', name: 'แกะ', image: '/characters/char-18-sheep.webp', accent: 'joyfull' },
  { id: 'raccoon', name: 'แรคคูน', image: '/characters/char-19-raccoon.webp', accent: 'matcha' },
  { id: 'turtle', name: 'เต่า', image: '/characters/char-20-turtle.webp', accent: 'matcha' },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string): Character {
  const found = BY_ID.get(id);
  // A missing character would be a seed bug, not a user state — fail loudly in
  // dev by falling back to the first one rather than rendering a hole.
  return found ?? CHARACTERS[0]!;
}
