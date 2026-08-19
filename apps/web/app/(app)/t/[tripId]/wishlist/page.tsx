import { SectionHeader, Stat } from '@/components/common/section';
import { WishlistBoard } from '@/components/wishlist/wishlist-board';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Progress } from '@/components/ui/progress';
import { coverage, MEMBERS, WISHLIST } from '@/lib/mock';

/** Wishlist tab (M3 — W3.2 editor + W3.3 coverage board + W3.4 nudge). */
export const metadata = { title: 'ที่อยากไป' };

export default function WishlistPage() {
  const pending = MEMBERS.filter((m) => !m.hasWishlist);
  const uncovered = WISHLIST.filter((w) => w.coverage !== 'covered');

  return (
    <div className="space-y-7">
      <section>
        <SectionHeader label="สรุปว่าของใครเข้าแพลนแล้วบ้าง" />
        <Card accent="matcha" className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={`${coverage.percent}%`} label="เข้าแพลนแล้ว" />
            <Stat value={`${coverage.mustCovered}/${coverage.mustTotal}`} label="ของที่ต้องไป" />
            <Stat value={coverage.uncovered} label="ยังไม่ได้ใส่" />
          </div>
          <Progress value={coverage.percent / 100} tone="espresso" className="mt-4" />

          {uncovered.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {uncovered.map((item) => (
                <li key={item.id} className="text-espresso flex items-center gap-2 text-xs">
                  <CharacterAvatar
                    characterId={MEMBERS.find((m) => m.id === item.memberId)!.characterId}
                    size="xs"
                  />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted">
                    {item.coverage === 'partial' ? 'เข้าแพลนแค่บางส่วน' : 'ยังไม่มีในแพลน'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        {pending.length > 0 ? (
          <Card accent="sun" className="mt-3 flex items-center gap-3 p-3.5">
            <CharacterAvatar characterId={pending[0]!.characterId} size="sm" />
            <p className="text-espresso flex-1 text-xs leading-relaxed">
              <span className="font-semibold">{pending.map((m) => m.name).join(', ')}</span>{' '}
              ยังไม่ได้ใส่ที่อยากไป — แพลนอาจไม่มีของเขาเลยสักอย่าง
            </p>
            <button className="text-primary shrink-0 text-xs font-semibold">ส่งเตือน</button>
          </Card>
        ) : null}
      </section>

      <section>
        <SectionHeader label={`รายการทั้งหมด ${WISHLIST.length} อย่าง`} />
        <WishlistBoard />
      </section>
    </div>
  );
}
