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
      actions={
        <>
          <ButtonLink href="/home" size="lg" block>
            กลับหน้าแรก
          </ButtonLink>
          <ButtonLink href="/" variant="outline" size="lg" block>
            ดูว่า ROVE ทำอะไรได้บ้าง
          </ButtonLink>
        </>
      }
    />
  );
}
