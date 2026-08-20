'use client';

import { use, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { useNormalizeWishlist } from '@/features/ai/queries';
import { usePlans } from '@/features/plan/queries';
import { useTripOverview } from '@/features/trip/queries';
import { CoverageBoard } from '@/components/wishlist/coverage-board';
import { ProfileForm } from '@/components/wishlist/profile-form';
import { WishlistEditor } from '@/components/wishlist/wishlist-editor';
import { Button } from '@/components/ui/button';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import { cn } from '@/lib/utils';

type View = 'wishlist' | 'coverage' | 'profile';

/** M3 — the wishlist tab: everyone's wishes, the coverage board, your profile. */
export default function WishlistPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [view, setView] = useState<View>('wishlist');

  const { data: me } = useMe();
  const { data: overview, isLoading, error, refetch } = useTripOverview(tripId);
  const { data: plans } = usePlans(tripId);
  const normalize = useNormalizeWishlist(tripId);

  if (isLoading) return <SkeletonList rows={3} />;
  if (error || !overview) return <ErrorState onRetry={() => void refetch()} />;

  const activePlan = plans?.items.find((p) => p.is_final) ?? plans?.items[0];
  const canEdit = overview.my_role !== 'viewer';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ViewTab active={view === 'wishlist'} onClick={() => setView('wishlist')}>
          ที่อยากไป
        </ViewTab>
        <ViewTab active={view === 'coverage'} onClick={() => setView('coverage')}>
          เทียบกับแพลน
        </ViewTab>
        <ViewTab active={view === 'profile'} onClick={() => setView('profile')}>
          สไตล์ของฉัน
        </ViewTab>

        {view === 'wishlist' && canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            loading={normalize.isPending}
            onClick={() => normalize.mutate()}
            title="ให้ AI ใส่แท็กและจับคู่กับสถานที่ในระบบ"
          >
            <Sparkles className="h-4 w-4" />
            จัดหมวดให้อัตโนมัติ
          </Button>
        ) : null}
      </div>

      {view === 'wishlist' ? (
        <WishlistEditor
          tripId={tripId}
          members={overview.members}
          meId={me?.id}
          canEdit={canEdit}
          isOwner={overview.my_role === 'owner'}
        />
      ) : null}

      {view === 'coverage' ? (
        <CoverageBoard tripId={tripId} planId={activePlan?.id} members={overview.members} />
      ) : null}

      {view === 'profile' ? <ProfileForm tripId={tripId} /> : null}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-espresso text-white' : 'bg-espresso/6 text-muted hover:bg-espresso/10',
      )}
    >
      {children}
    </button>
  );
}
