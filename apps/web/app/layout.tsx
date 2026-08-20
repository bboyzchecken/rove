import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Noto_Sans_Thai, Prompt } from 'next/font/google';

import { env } from '@/lib/env';
import '@/styles/globals.css';

import { Providers } from './providers';

/* Typography per DEV_SPEC §15. next/font self-hosts them, so there is no
 * render-blocking request to Google and no layout shift when they land. */
const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-prompt',
  display: 'swap',
});

const notoThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-noto-thai',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  // Brand name comes from env — DEV_SPEC §15 forbids hardcoding it.
  title: { default: env.brandName, template: `%s · ${env.brandName}` },
  description: 'วางแพลนเที่ยวญี่ปุ่นร่วมกันทั้งกลุ่ม แล้วแชร์ได้',
  metadataBase: new URL(env.appUrl),
  icons: { icon: '/brand/mark.svg', apple: '/brand/mark.svg' },
  openGraph: {
    type: 'website',
    siteName: env.brandName,
    locale: 'th_TH',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Mobile-first: the trip room is used on a phone. Zoom stays available —
  // locking it out fails WCAG 1.4.4.
  maximumScale: 5,
  themeColor: '#F0EDE6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} ${notoThai.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
