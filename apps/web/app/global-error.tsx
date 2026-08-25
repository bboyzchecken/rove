'use client';

import '@/styles/globals.css';

/**
 * Last resort: the root layout itself threw, so there is no shell to render
 * into — this component supplies its own <html>. Deliberately plain, with no
 * imports beyond the stylesheet, because whatever broke may be one of them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body className="min-h-dvh antialiased">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-espresso text-2xl font-extrabold tracking-tight">แอปโหลดไม่ขึ้น</h1>
          <p className="text-muted text-sm leading-relaxed">
            เกิดข้อผิดพลาดตั้งแต่ตอนเริ่มโหลดหน้า ลองรีเฟรชอีกครั้ง
            ถ้ายังไม่ได้ให้ปิดแท็บแล้วเปิดใหม่
          </p>
          <button
            onClick={reset}
            className="bg-primary text-primary-fg h-11 rounded-full px-6 text-sm font-semibold"
          >
            ลองใหม่
          </button>
          {error.digest ? (
            <p className="text-muted/70 text-[11px]">รหัสข้อผิดพลาด {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
