import { StatusPage } from '@/components/common/status-page';
import { ButtonLink } from '@/components/ui/button';

/** 404 for every route in the app. */
export const metadata = { title: 'ไม่เจอหน้านี้' };

export default function NotFound() {
  return (
    <StatusPage
      image="/brand/status/status-404.webp"
      code="404"
      title="ไม่เจอหน้านี้"
      hint="ลิงก์อาจพิมพ์ผิด หรือทริปนี้ถูกลบ/เปลี่ยนเป็นส่วนตัวไปแล้ว ถ้าเพื่อนส่งลิงก์มาให้ ลองขอลิงก์ใหม่อีกที"
      // "กลับหน้าแรก" lives in the header on every one of these screens, so the
      // buttons here are for going somewhere useful instead.
      actions={
        <>
          <ButtonLink href="/explore" size="lg" block>
            ดูแพลนที่คนอื่นทำไว้
          </ButtonLink>
          <ButtonLink href="/home" variant="outline" size="lg" block>
            ไปหน้าสรุปของฉัน
          </ButtonLink>
        </>
      }
    />
  );
}
