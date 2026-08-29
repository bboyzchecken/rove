'use client';

import Link from 'next/link';
import { Copy, Eye, Sparkles } from 'lucide-react';

import { BrowseShell } from '@/components/common/browse-shell';
import { SectionHeader, Stat } from '@/components/common/section';
import { TripCover } from '@/components/trip/trip-cover';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useCreator } from '@/features/public/queries';

/**
 * Creator profile (M11 — W11.2): the public face of someone whose trips are
 * worth following. Only published trips and their public numbers appear here —
 * the balance, history and everything unpublished stay behind sign-in.
 */
export function CreatorScreen({ handle, signedIn }: { handle: string; signedIn: boolean }) {
  const { data: creator, isLoading } = useCreator(handle);

  if (isLoading) {
    return (
      <BrowseShell signedIn={signedIn} width="wide">
        <div className="space-y-3 py-8">
          <div className="rounded-brand bg-surface h-32 animate-pulse" />
          <div className="rounded-brand bg-surface h-64 animate-pulse" />
        </div>
      </BrowseShell>
    );
  }

  if (!creator) {
    return (
      <BrowseShell signedIn={signedIn} width="focused" center>
        <div className="py-16 text-center">
          <h1 className="font-display text-ink text-xl font-medium">ไม่พบโปรไฟล์นี้</h1>
          <p className="text-muted mt-2 text-sm">อาจพิมพ์ชื่อผิด หรือเจ้าของยังไม่ได้เปิดโปรไฟล์</p>
          <ButtonLink href="/explore" className="mt-5">
            ไปหน้าสำรวจ
          </ButtonLink>
        </div>
      </BrowseShell>
    );
  }

  return (
    <BrowseShell
      signedIn={signedIn}
      width="wide"
      actions={
        <ButtonLink href="/explore" size="sm" variant="soft">
          สำรวจแพลนอื่น
        </ButtonLink>
      }
    >
      <Card accent="pink" className="mt-6 p-5">
        <div className="flex items-center gap-4">
          <CharacterAvatar characterId={creator.characterId} size="lg" />
          <div>
            <h1 className="font-display text-ink text-xl font-medium tracking-tight">
              {creator.name}
            </h1>
            <p className="text-muted text-sm">@{creator.handle}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={creator.publicTrips} label="ทริปที่เปิดสาธารณะ" />
          <Stat value={creator.totalViews.toLocaleString('th-TH')} label="คนเปิดดู" />
          <Stat value={creator.totalClones.toLocaleString('th-TH')} label="คนตามรอย" />
          <Stat value={creator.pointsEarned.toLocaleString('th-TH')} label="แต้มที่เคยได้" />
        </div>
      </Card>

      <section className="mt-6">
        <SectionHeader label={`ทริปทั้งหมด (${creator.trips.length})`} />
        {creator.trips.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted text-sm">ยังไม่มีทริปที่เปิดสาธารณะ</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {creator.trips.map((trip) => (
              <Link
                key={trip.slug}
                href={`/p/${trip.slug}` as never}
                className="group block transition hover:-translate-y-0.5"
              >
                <Card className="overflow-hidden p-0">
                  <TripCover src={trip.cover} frame="card" />
                  <div className="p-3.5">
                    <p className="text-ink line-clamp-1 text-sm font-medium">{trip.title}</p>
                    <p className="text-muted mt-0.5 text-xs">
                      {trip.days} วัน · {trip.cities.join(' · ')}
                    </p>
                    <p className="text-muted mt-2 flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-0.5">
                        <Eye className="size-3" />
                        {trip.viewCount.toLocaleString('th-TH')}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Copy className="size-3" />
                        {trip.cloneCount.toLocaleString('th-TH')}
                      </span>
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Card accent="yellow" className="mt-6 p-4">
        <p className="text-ink flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4" />
          อยากมีหน้าแบบนี้ของตัวเองไหม
        </p>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          เปิดทริปที่ไปมาแล้วเป็นสาธารณะ — ทุกครั้งที่มีคนตามรอยหรือกดจองจากแพลนของคุณ คุณได้แต้มไว้แลกส่วนลด
        </p>
        <ButtonLink href="/new" size="sm" className="mt-3">
          เริ่มทริปของฉัน
        </ButtonLink>
      </Card>
    </BrowseShell>
  );
}
