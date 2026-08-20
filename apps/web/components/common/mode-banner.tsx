'use client';

import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';

import { dataModeLabel, isMockMode, resetMockData } from '@/lib/data';

/**
 * The UAT strip.
 *
 * Mock mode is indistinguishable from the real thing by design — which is
 * exactly why it has to say so. This is the only component in the app allowed
 * to read the data mode; everything else asks the repository.
 *
 * In live mode it renders nothing at all.
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
