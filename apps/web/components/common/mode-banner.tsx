'use client';

import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';

import { dataModeLabel, isMockMode, resetMockData } from '@/lib/data';

/**
 * The UAT strip.
 *
 * Mock mode is indistinguishable from the real thing by design — which is
 * exactly why it has to say so. This file is the only place in the app allowed
 * to read the data mode; everything else asks the repository.
 *
 * In live mode the banner renders nothing at all — a strip across every screen
 * saying "this is the real thing" is noise. `ModeLine` below is the quiet
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
    <div className="bg-sun/55 text-espresso flex items-center justify-center gap-3 px-4 py-1.5 text-[11px]">
      <span className="flex items-center gap-1.5 font-semibold">
        <FlaskConical className="size-3.5" /> {dataModeLabel}
      </span>
      <span className="text-espresso/70 hidden sm:inline">
        ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น · AI เข้าสู่ระบบ และการชำระเงินเป็นการจำลอง
      </span>
      <button
        onClick={reset}
        disabled={resetting}
        className="hover:bg-espresso/10 ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold sm:ml-0"
      >
        <RotateCcw className="size-3" /> {resetting ? 'กำลังรีเซ็ต…' : 'รีเซ็ตข้อมูลทดลอง'}
      </button>
    </div>
  );
}

/**
 * The mode, stated once, in the profile footer.
 *
 * Live mode is silent everywhere else by design, which is exactly how someone
 * ends up unsure which mode they are looking at — so the screen that answers
 * "who am I" answers "and which data is this" too.
 */
export function ModeLine() {
  return <p className="mt-0.5">{dataModeLabel}</p>;
}
