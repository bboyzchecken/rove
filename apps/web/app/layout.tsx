import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Inter, Space_Grotesk } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

import { env } from '@/lib/env';
import '@/styles/globals.css';

import { Providers } from './providers';

/* Typography (ROVE_BRAND_SPEC §3). Three faces, each with one job:
 *
 *   display  Space Grotesk — a tight grotesk for headlines only. The spec asks
 *            for General Sans / Cabinet Grotesk / Satoshi, which are Fontshare
 *            fonts and cannot be self-hosted through next/font/google; Space
 *            Grotesk is the closest thing Google serves — same tight, slightly
 *            odd grotesk, and it survives -0.03em tracking at hero size.
 *   body     Inter at 400/500, per §3's "same family, or Inter".
 *   thai     IBM Plex Sans Thai. Almost all of the product's copy is Thai, so
 *            this is the face most readers actually see. It has to be loaded
 *            explicitly — left to fall back, Thai lands on a system serif and
 *            the page stops being the brand mid-sentence (§8).
 *
 * Only the weights the spec allows are downloaded. 600/800 are gone on
 * purpose: §3 caps a screen at two weights, and a weight you cannot load is a
 * weight nobody reaches for by accident. */
/* Named `--font-grotesk`, NOT `--font-display`: Tailwind's theme also defines
 * `--font-display` (from `--brand-font-display`), and when both existed the
 * next/font one won for any plain `font-family: var(--font-display)` in CSS —
 * which silently dropped the Thai face off the end of the display stack and
 * put every Thai headline on a system fallback. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
  display: 'swap',
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  // Brand name comes from env — DEV_SPEC §15 forbids hardcoding it.
  title: { default: env.brandName, template: `%s · ${env.brandName}` },
  description: 'วางแพลนทริปร่วมกันทั้งกลุ่ม ไปได้ทุกที่ในโลก แล้วแชร์ได้',
  metadataBase: new URL(env.appUrl),
  openGraph: { images: ['/brand/og-default.png'] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Mobile-first: the trip room is used on a phone.
  maximumScale: 5,
  // Cream, not white — the browser chrome should meet the page, not frame it.
  themeColor: '#FFFCF1',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // W0.6 — next-intl. The provider inherits locale + messages from
  // i18n/request.ts; client components reach them via useTranslations.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexThai.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
