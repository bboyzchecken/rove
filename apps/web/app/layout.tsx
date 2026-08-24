import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Thai } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

import { env } from '@/lib/env';
import '@/styles/globals.css';

import { Providers } from './providers';

/* DEV_SPEC §15 Typography — Inter for the whole product. Inter ships no Thai
 * glyphs, so Thai falls through to Noto Sans Thai, which is matched to it on
 * x-height and weight. Both are wired to CSS vars so brand.css stays the one
 * place that names a family. */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-thai',
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
  themeColor: '#FFFFFF',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // W0.6 — next-intl. The provider inherits locale + messages from
  // i18n/request.ts; client components reach them via useTranslations.
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} ${notoSansThai.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
