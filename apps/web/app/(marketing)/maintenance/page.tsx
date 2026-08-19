import { StatusPage } from '@/components/common/status-page';
import { ButtonLink } from '@/components/ui/button';

/**
 * The 503 page, as a real route so Caddy can serve it during a deploy or an
 * outage without Next having to be up (§8.1 — one instance, so a restart is a
 * visible gap). `app/error.tsx` shows the same screen when the API stops
 * answering while the site itself is fine.
 */
export const metadata = {
  title: 'ปิดปรับปรุงชั่วคราว',
  robots: { index: false },
};

// Nothing here reads a request or the API — keep it in the static export so it
// can be served from disk.
export const dynamic = 'force-static';

export default function MaintenancePage() {
  return (
    <StatusPage
      image="/brand/status/status-maintenance.webp"
      code="503"
      tone="sun"
      title="ปิดปรับปรุงแป๊บนึง"
      hint="กำลังอัปเดตระบบอยู่ ปกติใช้เวลาไม่เกิน 15 นาที — ทริป แพลน และรายจ่ายที่บันทึกไว้ยังอยู่ครบทุกอย่าง ไม่ต้องกรอกใหม่"
      actions={
        <ButtonLink href="/" size="lg" block>
          ลองเข้าใหม่อีกครั้ง
        </ButtonLink>
      }
      detail="ถ้าเกิน 30 นาทีแล้วยังเข้าไม่ได้ ทักมาที่ hello@rove.app แล้วบอกเวลาที่เจอปัญหาได้เลย"
    />
  );
}
