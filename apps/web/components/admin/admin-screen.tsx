'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FlaskConical, Search } from 'lucide-react';
import { useState } from 'react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { useMe } from '@/features/auth/queries';
import { usePoiSearch } from '@/features/plan/queries';
import { repo } from '@/lib/data';

/**
 * Admin (M13 — W13.1).
 *
 * Four numbers and a POI search, because those are what someone actually opens
 * this page for: is it running, what is the model costing today, and why is
 * that one place wrong. Anything more elaborate is a dashboard nobody reads.
 */
export function AdminScreen() {
  const { data: me } = useMe();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => repo.admin.stats(),
    refetchInterval: 60_000,
  });

  const [query, setQuery] = useState('');
  const { data: pois = [] } = usePoiSearch(query);

  if (me && !me.isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-espresso text-xl font-extrabold">หน้านี้สำหรับแอดมิน</h1>
        <p className="text-muted mt-2 text-sm">บัญชีนี้ไม่มีสิทธิ์เข้าถึง</p>
      </main>
    );
  }

  const costRatio = stats && stats.aiCostCapUsd > 0 ? stats.aiCostTodayUsd / stats.aiCostCapUsd : 0;

  return (
    <div className="space-y-7 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            แอดมิน
          </h1>
          <p className="text-muted mt-1 text-sm">ตัวเลขรวมของระบบ · รีเฟรชอัตโนมัติทุกนาที</p>
        </div>
        {stats?.mockMode ? (
          <Badge tone="sun" size="md">
            <FlaskConical className="size-3.5" /> โหมดทดลอง
          </Badge>
        ) : null}
      </div>

      {isLoading || !stats ? (
        <div className="rounded-brand bg-surface h-28 animate-pulse" />
      ) : (
        <>
          <section>
            <SectionHeader label="ภาพรวม" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Card accent="sky" className="p-4">
                <Stat value={stats.users} label="ผู้ใช้" />
              </Card>
              <Card accent="matcha" className="p-4">
                <Stat value={stats.trips} label="ทริป" />
              </Card>
              <Card accent="joyfull" className="p-4">
                <Stat value={stats.pois} label="สถานที่ในฐานข้อมูล" />
              </Card>
              <Card accent="sun" className="p-4">
                <Stat value={stats.clicksToday} label="คลิกไปพาร์ตเนอร์วันนี้" />
              </Card>
            </div>
          </section>

          <section>
            <SectionHeader label="ค่า AI วันนี้" />
            <Card accent={costRatio >= 0.8 ? 'primary' : 'none'} className="p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-espresso nums text-2xl font-extrabold">
                    ${stats.aiCostTodayUsd.toFixed(2)}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    เพดานวันละ ${stats.aiCostCapUsd.toFixed(2)}
                  </p>
                </div>
                {costRatio >= 0.8 ? (
                  <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle className="size-4" /> ใกล้เต็มเพดานแล้ว
                  </p>
                ) : null}
              </div>
              <Progress
                value={costRatio}
                tone={costRatio >= 0.8 ? 'primary' : 'espresso'}
                className="mt-3"
              />
              <p className="text-muted mt-2 text-[11px]">
                พอถึงเพดาน ระบบจะหยุดรับงานร่างใหม่จนถึงเที่ยงคืน UTC
              </p>
            </Card>
          </section>

          <section>
            <SectionHeader label="ค้นหาสถานที่" />
            <label className="mb-2 flex items-center gap-2">
              <Search className="text-muted size-4" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ชื่อสถานที่ หรือเมือง"
              />
            </label>

            {pois.length > 0 ? (
              <Card className="divide-border divide-y">
                {pois.map((poi) => (
                  <div key={poi.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-espresso truncate text-sm font-semibold">{poi.name}</p>
                      <p className="text-muted text-[11px]">
                        {poi.city}
                        {poi.area ? ` · ${poi.area}` : ''} · {poi.category}
                      </p>
                    </div>
                    <span className="text-muted nums shrink-0 text-[11px]">
                      {poi.lat.toFixed(3)}, {poi.lng.toFixed(3)}
                    </span>
                  </div>
                ))}
              </Card>
            ) : query ? (
              <p className="text-muted text-sm">ไม่พบสถานที่ที่ตรงกับคำค้นนี้</p>
            ) : null}
          </section>

          <p className="text-muted text-[11px]">
            เวอร์ชัน <span className="nums">{stats.commit || 'local'}</span>
          </p>
        </>
      )}
    </div>
  );
}
