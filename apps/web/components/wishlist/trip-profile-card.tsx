'use client';

import { useState } from 'react';
import { Footprints, Pencil, UserRound } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMyTripProfile, useSaveTripProfile } from '@/features/trip/queries';
import type { MemberProfile, TripPace } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Trip-scoped member profile (M3 — A3.1).
 *
 * Lives on the wishlist tab because the two answer the same question — "what
 * do YOU want out of this trip" — one in places, one in style. The AI frame
 * and the conflict check read what is saved here.
 */

const PACES: { id: TripPace; label: string; hint: string }[] = [
  { id: 'relaxed', label: 'ชิลๆ', hint: 'วันละ 2–3 ที่ มีเวลานั่งคาเฟ่' },
  { id: 'balanced', label: 'กำลังดี', hint: 'วันละ 4–5 ที่ เดินได้เรื่อยๆ' },
  { id: 'packed', label: 'จัดเต็ม', hint: 'เก็บให้ครบ ตื่นเช้ากลับดึก' },
];

const WALKS: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'เดินน้อยสุด' },
  { id: 2, label: 'เดินได้ปกติ' },
  { id: 3, label: 'เดินเท่าไหร่ก็ได้' },
];

export function TripProfileCard({ tripId }: { tripId: string }) {
  const { data: profile } = useMyTripProfile(tripId);
  const save = useSaveTripProfile(tripId);
  const [open, setOpen] = useState(false);

  if (!profile) return null;

  const paceLabel = PACES.find((p) => p.id === profile.pace)?.label ?? 'กำลังดี';
  const walkLabel = WALKS.find((w) => w.id === profile.walkLevel)?.label ?? 'เดินได้ปกติ';

  return (
    <>
      <Card accent="feature" className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-bg/70 flex size-9 shrink-0 items-center justify-center rounded-full">
              <UserRound className="text-ink size-4.5" strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-ink text-sm font-medium">สไตล์เที่ยวของคุณในทริปนี้</p>
              {profile.filled ? (
                <p className="text-muted mt-0.5 text-xs leading-relaxed">
                  {paceLabel} · {walkLabel}
                  {profile.budgetMaxThb > 0
                    ? ` · งบ ${profile.budgetMinThb.toLocaleString('th-TH')}–${profile.budgetMaxThb.toLocaleString('th-TH')} บาท`
                    : ''}
                  {profile.dietary.length > 0 ? ` · ${profile.dietary.join(', ')}` : ''}
                </p>
              ) : (
                <p className="text-muted mt-0.5 text-xs leading-relaxed">
                  ยังไม่ได้บอกเลยว่าชอบเที่ยวแบบไหน — AI จะได้จัดแพลนให้ตรงจังหวะของคุณ
                </p>
              )}
            </div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" />
            {profile.filled ? 'แก้' : 'กรอกเลย'}
          </Button>
        </div>
      </Card>

      {open ? (
        // Mounted only while open so the form re-reads the saved profile each
        // time instead of syncing state in an effect.
        <TripProfileSheet
          onClose={() => setOpen(false)}
          profile={profile}
          saving={save.isPending}
          onSave={(input) => {
            save.mutate(input, { onSuccess: () => setOpen(false) });
          }}
        />
      ) : null}
    </>
  );
}

function TripProfileSheet({
  onClose,
  profile,
  saving,
  onSave,
}: {
  onClose: () => void;
  profile: MemberProfile;
  saving: boolean;
  onSave: (input: Omit<MemberProfile, 'userId' | 'filled'>) => void;
}) {
  const [pace, setPace] = useState<TripPace>(profile.pace);
  const [walkLevel, setWalkLevel] = useState<1 | 2 | 3>(profile.walkLevel);
  const [visitedBefore, setVisitedBefore] = useState(profile.visitedBefore);
  const [canDrive, setCanDrive] = useState(profile.canDrive);
  const [hasIdp, setHasIdp] = useState(profile.hasIdp);
  const [budgetMin, setBudgetMin] = useState(profile.budgetMinThb > 0 ? String(profile.budgetMinThb) : '');
  const [budgetMax, setBudgetMax] = useState(profile.budgetMaxThb > 0 ? String(profile.budgetMaxThb) : '');
  const [dietary, setDietary] = useState(profile.dietary.join(', '));
  const [notes, setNotes] = useState(profile.notes);

  const submit = () => {
    onSave({
      visitedBefore,
      pace,
      walkLevel,
      canDrive,
      hasIdp,
      budgetMinThb: Number(budgetMin) || 0,
      budgetMaxThb: Number(budgetMax) || 0,
      dietary: dietary
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      notes,
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="สไตล์เที่ยวของคุณ"
      description="เฉพาะทริปนี้ — AI ใช้จัดจังหวะแพลนให้เข้ากับทั้งกลุ่ม"
      footer={
        <Button block onClick={submit} disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-muted mb-1.5 text-[11px] font-medium">จังหวะการเที่ยว</p>
          <div className="grid grid-cols-3 gap-2">
            {PACES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPace(option.id)}
                className={cn(
                  'rounded-2xl px-2 py-2.5 text-center text-xs font-medium transition',
                  pace === option.id
                    ? 'bg-ink text-bg'
                    : 'bg-surface text-ink hover:bg-border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-muted mt-1.5 text-[11px]">
            {PACES.find((p) => p.id === pace)?.hint}
          </p>
        </div>

        <div>
          <p className="text-muted mb-1.5 flex items-center gap-1 text-[11px] font-medium">
            <Footprints className="size-3" /> เดินไหวแค่ไหน
          </p>
          <div className="grid grid-cols-3 gap-2">
            {WALKS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setWalkLevel(option.id)}
                className={cn(
                  'rounded-2xl px-2 py-2.5 text-center text-xs font-medium transition',
                  walkLevel === option.id
                    ? 'bg-ink text-bg'
                    : 'bg-surface text-ink hover:bg-border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="งบต่ำสุด (บาท/คน)">
            <Input
              inputMode="numeric"
              placeholder="เช่น 25,000"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <Field label="งบสูงสุด (บาท/คน)">
            <Input
              inputMode="numeric"
              placeholder="เช่น 45,000"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
        </div>

        <div className="space-y-2">
          {[
            { label: 'เคยไปที่นี่มาแล้ว', value: visitedBefore, set: setVisitedBefore },
            { label: 'ขับรถได้ (ถ้าทริปต้องเช่ารถ)', value: canDrive, set: setCanDrive },
            { label: 'มีใบขับขี่สากล (IDP)', value: hasIdp, set: setHasIdp },
          ].map((toggle) => (
            <label
              key={toggle.label}
              className="bg-surface flex cursor-pointer items-center justify-between rounded-2xl px-3.5 py-2.5"
            >
              <span className="text-ink text-sm">{toggle.label}</span>
              <input
                type="checkbox"
                checked={toggle.value}
                onChange={(e) => toggle.set(e.target.checked)}
                className="accent-primary size-4"
              />
            </label>
          ))}
        </div>

        <Field label="ข้อจำกัดอาหาร" hint="คั่นด้วยจุลภาค เช่น ไม่กินหมู, แพ้กุ้ง — เว้นว่างได้">
          <Input value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="ไม่มี" />
        </Field>

        <Field label="อยากบอกอะไรเพิ่ม">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น อยากได้ครึ่งวันว่างไว้ช้อปปิ้ง"
          />
        </Field>
      </div>
    </Sheet>
  );
}
