# รายการที่ต้องปรับ (จาก UAT รอบล่าสุด)

- **สถานะ:** แก้แล้วทั้ง 6 ข้อ — 26 ส.ค. 2569
- **ต้นตอร่วม:** สวิตช์ชื่อ `MOCK_MODE` ตัวเดียวกินความหมายสองอย่าง (ข้อมูลปลอม / third party ปลอม) และ `'/admin'` ใน `GUARDED` ของ proxy กินทั้ง `/admin/*` ซึ่งเป็นรากของข้อ 2, 3 และ 6

---

## 1. หน้า login ไม่มีปุ่มกลับหน้าแรก ✅

`/login` และ `/admin/login` อยู่นอกกลุ่ม `(app)` จึงไม่มี header ของ `AppShell` — โลโก้ที่แสดงเป็น `<RoveLogo>` เปล่า ๆ ไม่ใช่ลิงก์ ทั้งสองหน้าไม่มีทางออกกลับ `/` เลย

**แก้:**
- [components/auth/back-home.tsx](apps/web/components/auth/back-home.tsx) — ลิงก์ "← กลับหน้าแรก" ใช้ร่วมกันทั้งสองหน้า
- โลโก้บนทั้งสองหน้าเป็น `<Link href="/">` แล้ว · `/admin/login` เดิมไม่มีโลโก้เลย ตอนนี้มี
- ปุ่ม OAuth ที่ซ้ำกันสองหน้าถูกดึงออกเป็น [components/auth/oauth-buttons.tsx](apps/web/components/auth/oauth-buttons.tsx)

## 2. `/admin/login` เข้าไม่ได้ ถูกบังคับให้ล็อกอินแบบ user ✅

**ต้นตอ:** [proxy.ts](apps/web/proxy.ts) — `GUARDED` มี `'/admin'` และ `isGuarded()` จับทั้ง `/admin` และ `/admin/*` → live mode เตะคนที่ยังไม่มี cookie ไป `/login?next=/admin/login` ประตูแอดมินจึงไม่มีวันโผล่

**ต้นตอชั้นสอง:** ประตูนั้นเปิดได้เฉพาะเมื่อ API รันด้วย `MOCK_MODE=true` — พอปิด stub ก็ไม่มีทางเข้าเลย และใน `.env` ตอนนั้นสะกดเป็น `MOCK_MODE=flase` ซึ่ง viper อ่านเป็น false ประตูจึงหายไปเงียบ ๆ

**แก้:**
- `proxy.ts` มีลิสต์ `OPEN` สำหรับประตูที่อยู่ใต้ prefix ที่ถูก guard — `/admin/login` อยู่ในนั้น
- [components/auth/admin-login-screen.tsx](apps/web/components/auth/admin-login-screen.tsx) เป็นประตูจริง: **OAuth ชุดเดียวกับผู้ใช้ทั่วไป** สิทธิ์ admin มาจาก `ADMIN_EMAILS` ฝั่ง API (`findOrCreateUser`) ไม่ใช่ credential คนละชุด
- dev-login เป็นของแถมบนหน้านั้น ไม่ใช่เหตุผลที่หน้านั้นมีอยู่ — ปิด `DEV_LOGIN` แล้วประตูยังทำงาน
- `POST /api/v1/auth/demo` ย้ายไปขึ้นกับ `DEV_LOGIN` ของตัวเอง ไม่ผูกกับ stub อีก ([auth.handler.go](apps/api/pkg/handlers/api/auth.handler.go))

## 3. ทริปตัวอย่างต้องดูได้ใน guest mode (view-only) ✅

**ต้นตอ:** ปุ่ม "ดูทริปตัวอย่าง" ชี้ `/t/demo` ซึ่ง (ก) `'/t'` อยู่ใน `GUARDED` → เตะไป `/login` และ (ข) live mode ไม่เคยมีทริป id `demo` ใน MySQL เลย — id นั้นมีแค่ใน seed ฝั่ง browser

**แก้:** ใช้หน้า public read-only ที่มีอยู่แล้ว
- ปุ่มชี้ `/p/japan-autumn-8d` — slug เดียวเก็บไว้ที่ [lib/demo-trip.ts](apps/web/lib/demo-trip.ts)
- live: seed ทริปเดียวกันลง MySQL — [apps/api/data/demo-trip.json](apps/api/data/demo-trip.json) + [seeder_trip.go](apps/api/seeder_trip.go) (8 วัน 39 รายการ นักเดินทาง 4 คน) · id ทุกตัวเป็น UUID v5 จากชื่อคงที่ → `go run . seed` เป็น upsert รันซ้ำได้
- mock: ทริป demo ถูก publish ด้วย slug เดียวกัน ([lib/data/mock/db.ts](apps/web/lib/data/mock/db.ts)) → URL เดียวตอบได้ทั้งสองโหมด
- ผลพลอยได้: explore feed ใน live ไม่ว่างเปล่าอีกต่อไป

**ตามมาด้วย:** กฎ "คนแรกที่ล็อกอินได้เป็น admin" เปลี่ยนจาก "ตาราง users ว่าง" เป็น "ยังไม่มีใครเป็น admin" (`users.CountAdmins`) ไม่งั้นนักเดินทางที่ seed ไว้จะแย่งสิทธิ์นั้นไปตั้งแต่ก่อนมีคนจริงมาสมัคร

## 4. ปุ่มเปลี่ยนภาษาต้องอยู่บน navbar ด้านบน ✅

**แก้:** เพิ่ม `LocaleSwitchCompact` (ปุ่มคู่ TH/EN) ใน [locale-switch.tsx](apps/web/components/common/locale-switch.tsx) แล้ววางไว้บน header ของทุก surface:
- [app-shell.tsx](apps/web/components/common/app-shell.tsx) — ทุกหน้าที่ล็อกอินแล้ว
- [หน้า landing](apps/web/app/(marketing)/page.tsx) และ `/login` — สองหน้านี้อยู่นอก `AppShell` และเป็นที่ที่คนเลือกภาษาก่อนจะมีบัญชีให้ตั้งค่าด้วยซ้ำ
- ตัวเต็มพร้อมคำเตือน "ตอนนี้แปลแล้วเฉพาะเมนูและป้ายกำกับ" ยังอยู่ใน profile menu เหมือนเดิม

**ยังค้าง:** `messages/th.json` / `en.json` มีแค่ 4 namespace และมีไฟล์เดียวที่เรียก `useTranslations` — กดสลับแล้วจะเห็นเปลี่ยนน้อยมากจนกว่าจะเดิน [docs/i18n-plan.md](docs/i18n-plan.md) ต่อ

## 5. เอาคำว่า "ต้นแบบสำหรับนำเสนอ · ข้อมูลในหน้าจอเป็นตัวอย่าง" ออก ✅

ลบจาก footer ของ [หน้า landing](apps/web/app/(marketing)/page.tsx) แทนด้วยบรรทัดลิขสิทธิ์ปกติ (ชื่อแบรนด์อ่านจาก env ตาม §15)

**ตั้งใจไม่ลบ:** ป้าย "ฉบับร่างสำหรับต้นแบบ" บนหน้า `/terms` และ `/privacy` ([legal-shell.tsx](apps/web/components/common/legal-shell.tsx)) — นั่นเป็นคำเตือนทางกฎหมายจริง เอกสารยังไม่ผ่านที่ปรึกษากฎหมายและยังมีช่องว่างรอเติมเมื่อจดทะเบียนนิติบุคคล การเอาออกคือความเสี่ยง ไม่ใช่การทำให้ UAT สมจริง

## 6. แยกให้ชัดว่า mock mode เปิดหรือปิด ✅

**ต้นตอ:** สวิตช์สองตัวที่ตั้งไม่ตรงกันและความหมายก็คนละเรื่อง — ผู้ใช้เห็น UI ที่บอกว่า "ต่อระบบจริง" แต่ AI/OAuth/payment ยังเป็นของปลอม

**แก้ — แยกเป็น 3 สวิตช์อิสระ** (ดูหัวไฟล์ `.env.example`):

| สวิตช์ | ตอบคำถาม | ความหมาย |
|---|---|---|
| `NEXT_PUBLIC_DATA_MODE` | ข้อมูลอยู่ที่ไหน | `mock` = localStorage เท่านั้น **ไม่ save จริง** · `live` = ลง MySQL ทุกครั้ง |
| `STUB_PROVIDERS` (เดิม `MOCK_MODE`) | third party จริงไหม | **ไม่ใช่ mock database** — เขียน MySQL จริงเสมอ แค่ Anthropic/Google/FX/weather/storage/e-mail เป็นตัวแทน |
| `DEV_LOGIN` | มีประตู `/auth/demo` ไหม | เดิมถูก imply โดย `MOCK_MODE` ซึ่งแปลว่าปิด stub = ล็อกประตูเข้าระบบไปด้วย |

**และทำให้ระบบพูดความจริงได้:**
- `GET /api/v1/meta/mode` ([mode.handler.go](apps/api/pkg/handlers/api/mode.handler.go)) — public เพราะคำตอบคือรายการของสิ่งที่ **ไม่ได้** เกิดขึ้นจริง · รายงานทั้งกรณี `STUB_PROVIDERS=true` และกรณี key หาย (จากข้างนอกคือเรื่องเดียวกัน)
- [features/meta/queries.ts](apps/web/features/meta/queries.ts) — `useIsStubbed('ai')` ฯลฯ · component ถามอันนี้ ไม่ถาม env
- ป้ายที่เคยขึ้นว่า "โหมดทดลอง: …" ตอนนี้พูดตามความจริงและขึ้นใน live ด้วย — [ai-generate-dialog](apps/web/components/editor/ai-generate-dialog.tsx) "ตอนนี้ใช้ร่างตัวอย่าง ยังไม่ได้เรียกโมเดลจริง" · [invite-dialog](apps/web/components/trip/invite-dialog.tsx) "ยังไม่ส่งแจ้งเตือนเข้า LINE — ส่งลิงก์เอง"
- footer ของ profile ([mode-banner.tsx](apps/web/components/common/mode-banner.tsx)) บอกสองบรรทัด: โหมดข้อมูล + "ยังจำลองอยู่: AI · ค้นหาสถานที่ · …"
- ป้ายในหน้า admin เปลี่ยนจาก "โหมดทดลอง" (กำกวม) เป็น "จำลอง N บริการ"
- แถบ UAT ด้านบนขึ้นเฉพาะ mock mode เหมือนเดิม และพูดสิ่งเดียวที่มันรู้: "ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ได้บันทึกลงเซิร์ฟเวอร์"

**ร่องรอย mock ในโค้ดที่หายไปด้วย:** โฟลเดอร์ `lib/mock/` ถูกแยกตามความจริง — `lib/catalog/characters.ts` (ข้อมูลจริง ใช้ทั้งสองโหมด), `lib/data/model.ts` (โดเมนโมเดล ใช้ทุก render), `lib/data/mock/seed/` (seed เดโม ที่เดียวที่ mock จริง ๆ) · `lib/mock/index.ts` ถูกลบเพราะฟังก์ชันคำนวณในนั้นตายไปแล้วตั้งแต่ `lib/data/domain.ts` มา

---

## ที่ยังเหลือ

1. **`STUB_PROVIDERS=true` ยังอยู่** — ปิดไม่ได้จนกว่าจะมี key จริง (Anthropic, Google Maps, R2, FX, LINE) เพราะทางเลือกตอนนี้ไม่ใช่ "ของจริง" แต่คือ "พัง" · ปิดทีละ provider ได้เมื่อ key มาถึง `/meta/mode` จะรายงานให้เองว่าเหลือตัวไหน
2. **`DEV_LOGIN=true` ยังอยู่** — ปิดไม่ได้จนกว่าจะมี `GOOGLE_OAUTH_CLIENT_ID` / `LINE_LOGIN_CHANNEL_ID` เพราะไม่งั้นไม่มีใครล็อกอินได้เลย · ปิดเมื่อไหร่ `/admin/login` ยังทำงานต่อบน OAuth ปกติ
3. **i18n** — ดูข้อ 4
