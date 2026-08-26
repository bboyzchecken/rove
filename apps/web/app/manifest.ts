import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

/**
 * The web app manifest (W10.6).
 *
 * Trip Mode is the reason this exists: a screen you want on the home row and
 * open with no browser chrome while walking to a station. Installing is what
 * makes the service worker worth having, and `start_url` points at the trip
 * list rather than the marketing page because an installed app is not a
 * brochure.
 *
 * The name and the colours come from tokens, never hardcoded (§15).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: env.brandName,
    short_name: env.brandName,
    description: 'วางแพลนทริปร่วมกันทั้งกลุ่ม แล้วพกแพลนติดตัวไปเที่ยว',
    start_url: '/trips',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    lang: 'th',
    icons: [
      // Rendered from the one brand mark rather than committed as assets —
      // see app/pwa-icon/[size]/route.tsx.
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
