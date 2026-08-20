'use client';

import { useState } from 'react';

import { useProfile, useSaveProfile } from '@/features/wishlist/queries';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import type { MemberProfile, Pace } from '@/types/api';

/**
 * W3.1 — the per-trip profile.
 *
 * It is per trip, not per user, because the same person is "chill" on a family
 * trip and "packed" with friends. Pace feeds the day_too_long validation rule,
 * and the planner uses the strictest answer in the group — planning at the
 * fastest pace guarantees an argument on day two.
 */

const PACE_LABELS: Record<Pace, string> = {
  chill: 'ชิล — วันละ 3-4 ที่ก็พอ',
  normal: 'กลาง ๆ — วันละ 5-6 ที่',
  packed: 'อัดเต็ม — วันละ 7 ที่ขึ้นไป',
};

export function ProfileForm({ tripId }: { tripId: string }) {
  const { data, isLoading } = useProfile(tripId);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  // The saved profile seeds the form, so it is a mount key rather than
  // something an effect copies into state.
  return <ProfileFields tripId={tripId} profile={data} />;
}

function ProfileFields({ tripId, profile }: { tripId: string; profile: MemberProfile }) {
  const saveProfile = useSaveProfile(tripId);

  const [pace, setPace] = useState<Pace>(profile.pace);
  const [walkLevel, setWalkLevel] = useState(profile.walk_level);
  const [visitedBefore, setVisitedBefore] = useState(profile.visited_before);
  const [canDrive, setCanDrive] = useState(profile.can_drive);
  const [hasIDP, setHasIDP] = useState(profile.has_idp);
  const [budgetMax, setBudgetMax] = useState(
    profile.budget_max ? String(profile.budget_max) : '',
  );
  const [dietary, setDietary] = useState((profile.dietary ?? []).join(', '));
  const [notes, setNotes] = useState(profile.notes);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>สไตล์เที่ยวของคุณ</CardTitle>
          <CardDescription>
            AI ใช้ข้อมูลนี้ตอนร่างแพลน — ตอบตามจริง ไม่มีใครเห็นนอกจากคนในทริป
          </CardDescription>
        </div>
      </CardHeader>

      <div className="space-y-4">
        <Field label="จังหวะการเที่ยว" hint="AI จะยึดคนที่ชิลที่สุดในกลุ่มเป็นหลัก">
          <Select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
            {(Object.keys(PACE_LABELS) as Pace[]).map((key) => (
              <option key={key} value={key}>
                {PACE_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`เดินไหวแค่ไหน (${walkLevel}/5)`}>
          <input
            type="range"
            min={1}
            max={5}
            value={walkLevel}
            onChange={(e) => setWalkLevel(Number(e.target.value))}
            className="w-full accent-[hsl(var(--brand-primary))]"
          />
        </Field>

        <Field label="งบต่อคนที่ตั้งไว้ (บาท)" hint="ข้ามได้ ใช้เทียบกับงบประมาณที่ AI คำนวณ">
          <Input
            type="number"
            min={0}
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="เช่น 40000"
          />
        </Field>

        <Field label="อาหารที่กินไม่ได้" hint="คั่นด้วยจุลภาค เช่น หมู, ถั่ว, อาหารทะเล">
          <Input value={dietary} onChange={(e) => setDietary(e.target.value)} />
        </Field>

        <div className="space-y-2">
          <Checkbox
            label="เคยไปญี่ปุ่นมาแล้ว"
            checked={visitedBefore}
            onChange={setVisitedBefore}
          />
          <Checkbox label="ขับรถได้" checked={canDrive} onChange={setCanDrive} />
          {canDrive ? (
            <Checkbox
              label="มีใบขับขี่สากล (IDP) แล้ว"
              checked={hasIDP}
              onChange={setHasIDP}
            />
          ) : null}
        </div>

        <Field label="อย่างอื่นที่อยากบอก" hint="เช่น มีเด็กเล็กไปด้วย, ไม่ชอบที่คนเยอะ">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>

        <Button
          full
          loading={saveProfile.isPending}
          onClick={() =>
            saveProfile.mutate({
              pace,
              walk_level: walkLevel,
              visited_before: visitedBefore,
              can_drive: canDrive,
              has_idp: canDrive && hasIDP,
              budget_max: budgetMax ? Number(budgetMax) : null,
              dietary: dietary
                .split(',')
                .map((d) => d.trim())
                .filter(Boolean),
              notes,
            })
          }
        >
          {saveProfile.isSuccess ? 'บันทึกแล้ว' : 'บันทึก'}
        </Button>

        {saveProfile.error ? (
          <p className="text-sm text-danger">{(saveProfile.error as Error).message}</p>
        ) : null}
      </div>
    </Card>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-espresso">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-[hsl(var(--brand-primary))]"
      />
      {label}
    </label>
  );
}
