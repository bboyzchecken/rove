import type { Metadata, Viewport } from 'next';

import { env } from '@/lib/env';
import '@/styles/globals.css';

import { Providers } from './providers';

export const metadata: Metadata = {
  // Brand name comes from env — DEV_SPEC §15 forbids hardcoding it.
  title: { default: env.brandName, template: `%s · ${env.brandName}` },
  description: 'วางแพลนเที่ยวญี่ปุ่นร่วมกันทั้งกลุ่ม แล้วแชร์ได้',
  metadataBase: new URL(env.appUrl),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Mobile-first: the trip room is used on a phone.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
