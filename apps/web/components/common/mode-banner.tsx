'use client';

import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';

import { useProviderMode } from '@/features/meta/queries';
import { dataModeLabel, isMockMode, resetMockData } from '@/lib/data';
import type { StubbedProvider } from '@/lib/data';

/**
 * The UAT strip.
 *
 * Mock mode is indistinguishable from the real thing by design — which is
 * exactly why it has to say so. This file and `lib/data/mode` are the only
 * places in the app allowed to read the data mode; everything else asks the
 * repository.
 *
 * In live mode the banner renders nothing at all — a strip across every screen
 * saying "this is the real thing" is noise, and a UAT session is supposed to
 * feel like the product, not like a demo of it. `ModeLine` below is the quiet
 * counterpart for the one place the answer is worth having.
 */
export function ModeBanner() {
  const [resetting, setResetting] = useState(false);

  if (!isMockMode) return null;

  function reset() {
    setResetting(true);
    resetMockData();
    // A full reload is the honest way to clear TanStack's cache as well as the
    // seed — a UAT tester expects "reset" to mean the demo starts over.
    window.location.reload();
  }

  return (
    <div className="bg-yellow/55 text-ink flex items-center justify-center gap-3 px-4 py-1.5 text-[11px]">
      <span className="flex items-center gap-1.5 font-medium">
        <FlaskConical className="size-3.5" /> {dataModeLabel}
      </span>
      <span className="text-ink/70 hidden sm:inline">
        ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ได้บันทึกลงเซิร์ฟเวอร์
      </span>
      <button
        onClick={reset}
        disabled={resetting}
        className="hover:bg-ink/10 ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium sm:ml-0"
      >
        <RotateCcw className="size-3" /> {resetting ? 'กำลังรีเซ็ต…' : 'รีเซ็ตข้อมูลทดลอง'}
      </button>
    </div>
  );
}

/** How a stubbed provider is named to a person rather than to a deploy script. */
const PROVIDER_LABEL: Record<StubbedProvider, string> = {
  ai: 'AI',
  places: 'ค้นหาสถานที่',
  weather: 'พยากรณ์อากาศ',
  fx: 'อัตราแลกเปลี่ยน',
  storage: 'ที่เก็บไฟล์',
  notifications: 'แจ้งเตือน LINE',
  affiliate: 'พาร์ทเนอร์จอง',
};

/**
 * The mode, stated once, in the profile footer.
 *
 * Live mode is silent everywhere else by design, which is exactly how someone
 * ends up unsure which mode they are looking at — so the screen that answers
 * "who am I" answers "and which data is this" too.
 *
 * Two facts, not one, because they can disagree: whether anything is being
 * saved at all (the web app's data mode) and whether the third parties behind
 * it are real (the API's). A build set to `live` in front of an API with no
 * Anthropic key is *not* "ต่อระบบจริง" without an asterisk, and pretending
 * otherwise is what made the mock traces so confusing to a tester.
 */
export function ModeLine() {
  const { data: mode } = useProviderMode();
  const stubbed = isMockMode ? [] : (mode?.stubbed ?? []);

  return (
    <>
      <p className="mt-0.5">{dataModeLabel}</p>
      {stubbed.length > 0 ? (
        <p className="mt-0.5">
          ยังจำลองอยู่: {stubbed.map((key) => PROVIDER_LABEL[key] ?? key).join(' · ')}
        </p>
      ) : null}
    </>
  );
}
