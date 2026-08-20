'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { SiteHeader } from '@/components/common/site-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, SkeletonList } from '@/components/ui/states';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/format';

/**
 * W13.1 — the admin console.
 *
 * Two screens' worth of information, chosen to answer the two questions that
 * actually come up: is anything happening, and is anything on fire (the AI
 * spend and which integrations are actually configured on this deploy).
 */

interface Dashboard {
  users: number;
  pois: number;
  characters: number;
  trips_last_7d: number;
  trips_last_30d: number;
  ai_cost_last_24h_usd: number;
  ai_cost_last_30d_usd: number;
  booking_clicks_last_30d: number;
  booking_confirmations_last_30d: number;
  points_issued: number;
}

type Flags = Record<string, string | number | boolean>;

export default function AdminPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const isAdmin = me?.role === 'admin';

  const { data: dashboard, isLoading } = useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: () => api.get<Dashboard>('/admin/dashboard'),
    enabled: isAdmin,
  });

  const { data: flags } = useQuery({
    queryKey: queryKeys.adminFlags(),
    queryFn: () => api.get<Flags>('/admin/flags'),
    enabled: isAdmin,
  });

  if (meLoading) return <SkeletonList rows={3} />;

  if (!isAdmin) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <EmptyState title="หน้านี้สำหรับแอดมินเท่านั้น" />
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-5">
        <h1 className="font-display text-2xl">แอดมิน</h1>

        {isLoading || !dashboard ? (
          <SkeletonList rows={2} />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>การใช้งาน</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="ผู้ใช้ทั้งหมด" value={formatNumber(dashboard.users)} />
                <Metric label="ทริป 7 วันล่าสุด" value={formatNumber(dashboard.trips_last_7d)} />
                <Metric label="ทริป 30 วันล่าสุด" value={formatNumber(dashboard.trips_last_30d)} />
                <Metric label="POI ในระบบ" value={formatNumber(dashboard.pois)} />
              </div>
            </Card>

            <Card tone={dashboard.ai_cost_last_24h_usd > 5 ? 'sun' : 'plain'}>
              <CardHeader>
                <div>
                  <CardTitle>ค่า AI</CardTitle>
                  <CardDescription>ถ้า 24 ชม. พุ่งผิดปกติ ให้เช็ก rate limit ก่อน</CardDescription>
                </div>
              </CardHeader>
              <div className="grid grid-cols-2 gap-4">
                <Metric
                  label="24 ชม. ล่าสุด"
                  value={`$${dashboard.ai_cost_last_24h_usd.toFixed(2)}`}
                />
                <Metric
                  label="30 วันล่าสุด"
                  value={`$${dashboard.ai_cost_last_30d_usd.toFixed(2)}`}
                />
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Affiliate</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-3 gap-4">
                <Metric
                  label="คลิก 30 วัน"
                  value={formatNumber(dashboard.booking_clicks_last_30d)}
                />
                <Metric
                  label="ยืนยันแล้ว"
                  value={formatNumber(dashboard.booking_confirmations_last_30d)}
                />
                <Metric label="แต้มที่แจกไป" value={formatNumber(dashboard.points_issued)} />
              </div>
            </Card>
          </>
        )}

        {flags ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>สถานะการตั้งค่า</CardTitle>
                <CardDescription>
                  เวลาฟีเจอร์ “ไม่ทำงาน” บนเซิร์ฟเวอร์ ให้ดูตรงนี้ก่อน
                </CardDescription>
              </div>
            </CardHeader>
            <ul className="space-y-1.5">
              {Object.entries(flags).map(([key, value]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {typeof value === 'boolean' ? (
                    value ? (
                      <Check className="h-4 w-4 shrink-0 text-matcha" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-sun" />
                    )
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <span className="text-muted">{key}</span>
                  <span className="ml-auto font-mono text-xs text-espresso">
                    {typeof value === 'boolean' ? (value ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้ง') : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-xl font-bold text-espresso">{value}</p>
    </div>
  );
}
