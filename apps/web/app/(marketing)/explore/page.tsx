import { ExploreScreen } from '@/components/public/explore-screen';

/** Explore / discovery feed of public plans (M11 — W11.1). */
export const metadata = {
  title: 'สำรวจแพลนสาธารณะ',
  description: 'ตามรอยทริปที่คนไปมาแล้วจริงๆ — ก๊อปแพลนไปเป็นของตัวเองแล้วแก้ต่อได้เลย',
};

export default function ExplorePage() {
  return <ExploreScreen />;
}
