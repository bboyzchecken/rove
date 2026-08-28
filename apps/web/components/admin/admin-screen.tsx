'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, EyeOff, Megaphone, Search } from 'lucide-react';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/admin/ui/data-table';
import { StatusPill } from '@/components/admin/ui/status-pill';
import { SectionHeader, Stat } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { usePlatformStats } from '@/features/public/queries';
import { usePoiSearch } from '@/features/plan/queries';
import { repo } from '@/lib/data';
import type { Poi } from '@/lib/data';
import { missingForPlatformStats, showsPlatformStats } from '@/lib/social-proof';

/**
 * The admin overview (M13 — W13.1; rehoused by Phase 5 — W25.4).
 *
 * Same questions as before the move — is it running, what is the model costing
 * today, and why is that one place wrong — rendered on the console's own
 * surface instead of inside the traveller app's chrome. The POI list is now a
 * `DataTable` rather than a stack of divs, which is the first user of the
 * primitive the rest of Phase 5 is built on.
 *
 * One section is new, and it is here because Phase 4 put it there: the landing
 * page's social proof hides itself when the real numbers are too small
 * (W24.1). That is the correct behaviour and a confusing one to meet from the
 * outside — "the statistics disappeared from the front page" is a support
 * ticket unless somebody can see the four numbers and the threshold side by
 * side. This is that screen.
 */
export function AdminScreen() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => repo.admin.stats(),
    refetchInterval: 60_000,
  });

  const [query, setQuery] = useState('');
  const { data: pois = [] } = usePoiSearch(query);

  const costRatio = stats && stats.aiCostCapUsd > 0 ? stats.aiCostTodayUsd / stats.aiCostCapUsd : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
            ภาพรวมระบบ
          </h1>
          <p className="text-muted mt-1 text-sm">รีเฟรชอัตโนมัติทุกนาที</p>
        </div>
        {stats?.commit ? (
          <StatusPill tone="plain">เวอร์ชัน {stats.commit}</StatusPill>
        ) : null}
      </div>

      {isLoading || !stats ? (
        <div className="rounded-brand bg-surface h-28 animate-pulse" />
      ) : (
        <>
          <section>
            <SectionHeader label="ตัวเลขรวม" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="p-4">
                <Stat value={stats.users.toLocaleString('th-TH')} label="ผู้ใช้" />
              </Card>
              <Card className="p-4">
                <Stat value={stats.trips.toLocaleString('th-TH')} label="ทริป" />
              </Card>
              <Card className="p-4">
                <Stat value={stats.pois.toLocaleString('th-TH')} label="สถานที่ในฐานข้อมูล" />
              </Card>
              <Card className="p-4">
                <Stat
                  value={stats.clicksToday.toLocaleString('th-TH')}
                  label="คลิกไปพาร์ตเนอร์วันนี้"
                />
              </Card>
            </div>
          </section>

          <section>
            <SectionHeader label="ค่า AI วันนี้" />
            <Card className="p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-ink nums text-2xl font-bold">
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
                tone={costRatio >= 0.8 ? 'primary' : 'ink'}
                className="mt-3"
              />
              <p className="text-muted mt-2 text-[11px]">
                พอถึงเพดาน ระบบจะหยุดรับงานร่างใหม่จนถึงเที่ยงคืน UTC
              </p>
            </Card>
          </section>

          <LandingProofSection />

          <section>
            <SectionHeader label="ค้นหาสถานที่" />
            <label className="mb-3 flex max-w-md items-center gap-2">
              <Search className="text-muted size-4" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ชื่อสถานที่ หรือเมือง"
              />
            </label>

            {query ? (
              <DataTable
                rows={pois}
                columns={POI_COLUMNS}
                rowKey={(poi) => poi.id}
                caption="สถานที่ที่ตรงกับคำค้น"
                empty="ไม่พบสถานที่ที่ตรงกับคำค้นนี้"
              />
            ) : (
              <p className="text-muted text-sm">
                พิมพ์เพื่อค้นหา — หน้านี้ยังแก้ไขไม่ได้ ฟอร์มแก้ POI มาใน M27
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const POI_COLUMNS: Column<Poi>[] = [
  {
    key: 'name',
    header: 'ชื่อ',
    cell: (poi) => <span className="font-medium">{poi.name}</span>,
    sortBy: (poi) => poi.name,
  },
  {
    key: 'city',
    header: 'เมือง / ย่าน',
    cell: (poi) => (
      <span className="text-muted">
        {poi.city}
        {poi.area ? ` · ${poi.area}` : ''}
      </span>
    ),
    sortBy: (poi) => `${poi.city} ${poi.area}`,
  },
  {
    key: 'category',
    header: 'หมวด',
    cell: (poi) => <StatusPill tone="info">{poi.category}</StatusPill>,
    sortBy: (poi) => poi.category,
  },
  {
    key: 'coords',
    header: 'พิกัด',
    align: 'right',
    cell: (poi) => (
      <span className="text-muted text-[11px]">
        {poi.lat.toFixed(3)}, {poi.lng.toFixed(3)}
      </span>
    ),
  },
];

/**
 * Whether the landing page is currently showing its statistics (Phase 4 —
 * W24.1), and if not, what it is waiting for.
 *
 * The rule is that too-small numbers are hidden rather than padded. Read from
 * the outside that is indistinguishable from a bug, so the console names the
 * threshold and the gap instead of leaving somebody to guess.
 */
function LandingProofSection() {
  const { data: proof } = usePlatformStats();
  if (!proof) return null;

  const showing = showsPlatformStats(proof);
  const missing = missingForPlatformStats(proof);

  return (
    <section>
      <SectionHeader label="หลักฐานทางสังคมบนหน้าแรก" />
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink flex items-center gap-2 text-sm font-medium">
            {showing ? <Megaphone className="size-4" /> : <EyeOff className="size-4" />}
            {showing ? 'กำลังแสดงบนหน้าแรก' : 'ยังไม่แสดงบนหน้าแรก'}
          </p>
          <StatusPill tone={showing ? 'ok' : 'wait'}>
            {showing ? 'เปิดอยู่' : 'ซ่อนอยู่'}
          </StatusPill>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat value={proof.planners.toLocaleString('th-TH')} label="คนวางแพลน" />
          <Stat value={proof.publicTrips.toLocaleString('th-TH')} label="แพลนสาธารณะ" />
          <Stat value={proof.clones.toLocaleString('th-TH')} label="ครั้งที่ถูกก๊อป" />
          <Stat
            value={proof.reviews.toLocaleString('th-TH')}
            label="รีวิว"
            hint={proof.averageRating > 0 ? `เฉลี่ย ${proof.averageRating.toFixed(1)} ดาว` : undefined}
          />
        </div>

        {missing.length > 0 ? (
          <p className="text-muted mt-4 text-[11px] leading-relaxed">
            ต้องมีอีก {missing.join(' และ ')} ถึงจะขึ้นหน้าแรก — ตั้งใจให้ซ่อนไว้จนกว่าตัวเลขจะจริงพอ
            ไม่ใช่บั๊ก
          </p>
        ) : null}
      </Card>
    </section>
  );
}
