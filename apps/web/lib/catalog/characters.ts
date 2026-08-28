import type { Character } from '@/lib/data/model';

/**
 * The 20 fixed characters (DEV_SPEC M14). The same list is seeded server-side
 * from `apps/api/data/characters.json` — keep the ids identical.
 *
 * Real catalogue data, used in both modes — which is why it lives in
 * `lib/catalog/` and not, as it used to, in a folder called `mock`.
 */
export const CHARACTERS: Character[] = [
  { id: 'shiba', name: 'ชิบะ', image: '/characters/char-01-shiba.webp', accent: 'pink' },
  { id: 'cat', name: 'แมวส้ม', image: '/characters/char-02-cat.webp', accent: 'yellow' },
  {
    id: 'red-panda',
    name: 'เรดแพนด้า',
    image: '/characters/char-03-red-panda.webp',
    accent: 'pink',
  },
  { id: 'bear', name: 'หมีน้อย', image: '/characters/char-04-bear.webp', accent: 'yellow' },
  { id: 'rabbit', name: 'กระต่าย', image: '/characters/char-05-rabbit.webp', accent: 'pink' },
  { id: 'fox', name: 'จิ้งจอก', image: '/characters/char-06-fox.webp', accent: 'yellow' },
  { id: 'penguin', name: 'เพนกวิน', image: '/characters/char-07-penguin.webp', accent: 'blue' },
  { id: 'owl', name: 'นกฮูก', image: '/characters/char-08-owl.webp', accent: 'yellow' },
  { id: 'deer', name: 'กวางน้อย', image: '/characters/char-09-deer.webp', accent: 'blue' },
  {
    id: 'hedgehog',
    name: 'เม่นแคระ',
    image: '/characters/char-10-hedgehog.webp',
    accent: 'pink',
  },
  {
    id: 'capybara',
    name: 'คาปิบารา',
    image: '/characters/char-11-capybara.webp',
    accent: 'green',
  },
  { id: 'koala', name: 'โคอาลา', image: '/characters/char-12-koala.webp', accent: 'blue' },
  { id: 'panda', name: 'แพนด้า', image: '/characters/char-13-panda.webp', accent: 'green' },
  { id: 'tiger', name: 'เสือน้อย', image: '/characters/char-14-tiger.webp', accent: 'yellow' },
  { id: 'otter', name: 'นาก', image: '/characters/char-15-otter.webp', accent: 'blue' },
  { id: 'whale', name: 'วาฬ', image: '/characters/char-16-whale.webp', accent: 'blue' },
  { id: 'frog', name: 'กบ', image: '/characters/char-17-frog.webp', accent: 'green' },
  { id: 'sheep', name: 'แกะ', image: '/characters/char-18-sheep.webp', accent: 'pink' },
  { id: 'raccoon', name: 'แรคคูน', image: '/characters/char-19-raccoon.webp', accent: 'green' },
  { id: 'turtle', name: 'เต่า', image: '/characters/char-20-turtle.webp', accent: 'green' },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string): Character {
  const found = BY_ID.get(id);
  // A missing character would be a seed bug, not a user state — fail loudly in
  // dev by falling back to the first one rather than rendering a hole.
  return found ?? CHARACTERS[0]!;
}
