'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Download, Heart, Share2, Sparkles } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { useExportPlan, useTripOverview } from '@/features/trip/queries';
import { ActivityFeed } from '@/components/trip/activity-feed';
import { MembersCard } from '@/components/trip/members-card';
import { OnboardingChecklist } from '@/components/trip/onboarding-checklist';
import { ShareDialog } from '@/components/trip/share-dialog';
import { TripFrameCard } from '@/components/trip/trip-frame-card';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import { formatTripTime } from '@/lib/format';

/** W2.2 — the Overview tab: what this trip is, who is in it, what to do next. */
export default function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const [sharing, setSharing] = useState(false);

  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useTripOverview(tripId);
  const exportPlan = useExportPlan(tripId);

  if (isLoading) return <SkeletonList rows={4} />;
  if (error || !data) {
    return (
      <ErrorState
        title="เปิดทริปนี้ไม่ได้"
        description="อาจถูกลบไปแล้ว หรือคุณไม่ได้อยู่ในทริปนี้"
        onRetry={() => void refetch()}
      />
    );
  }

  const canEdit = data.my_role !== 'viewer';

  return (
    <div className="space-y-4">
      <OnboardingChecklist tripId={tripId} overview={data} />

      <TripFrameCard tripId={tripId} overview={data} canEdit={canEdit} />

      <div className="flex flex-wrap gap-2">
        <Link href={`/t/${tripId}/wishlist`}>
          <Button variant="soft" size="sm">
            <Heart className="h-4 w-4" />
            ใส่ที่อยากไป
          </Button>
        </Link>
        <Link href={`/t/${tripId}/plan`}>
          <Button variant="soft" size="sm">
            <Sparkles className="h-4 w-4" />
            {data.flags.has_plan ? 'ดูแพลน' : 'ให้ AI ร่างแพลน'}
          </Button>
        </Link>
        <Button variant="soft" size="sm" onClick={() => setSharing(true)}>
          <Share2 className="h-4 w-4" />
          แชร์
        </Button>
        {data.flags.has_plan ? (
          <Button
            variant="soft"
            size="sm"
            loading={exportPlan.isPending}
            onClick={async () => {
              const result = await exportPlan.mutateAsync({ format: 'html' });
              window.open(result.url, '_blank', 'noopener');
            }}
          >
            <Download className="h-4 w-4" />
            ดาวน์โหลด
          </Button>
        ) : null}
      </div>

      {exportPlan.error ? (
        <p className="text-sm text-danger">{(exportPlan.error as Error).message}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <MembersCard
          tripId={tripId}
          members={data.members}
          myRole={data.my_role}
          meId={me?.id}
        />

        {data.flights.length > 0 ? (
          <Card tone="sky">
            <CardHeader>
              <CardTitle>เที่ยวบิน</CardTitle>
            </CardHeader>
            <ul className="space-y-2 text-sm">
              {data.flights.map((flight) => (
                <li key={flight.id}>
                  <p className="font-medium text-espresso">
                    {flight.airline} {flight.flight_no} · {flight.dep_airport} →{' '}
                    {flight.arr_airport}
                  </p>
                  <p className="text-espresso/70">
                    ออก {formatTripTime(flight.dep_at)} · ถึง {formatTripTime(flight.arr_at)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ความเคลื่อนไหว</CardTitle>
        </CardHeader>
        <ActivityFeed tripId={tripId} />
      </Card>

      <ShareDialog
        tripId={tripId}
        open={sharing}
        onClose={() => setSharing(false)}
        visibility={data.trip.visibility}
        shareToken={data.trip.share_token}
      />
    </div>
  );
}
