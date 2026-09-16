# Dev Spec — Feedback #4 (ฟอร์ม · หน้าแพลน · วงจรทริป · รายได้และแต้ม)

- **ที่มา:** ข้อความ Feedback 12 ข้อ (15 ก.ย. 2569)
- **ขอบเขต:** `apps/web` + `apps/api` (มี migration) + Google Maps Platform (ต้องมี key ใหม่) + ผู้ให้บริการภายนอก (SMS OTP) · ข้อ 11–12 ต้องคุยนักบัญชีและที่ปรึกษากฎหมายด้วย
- **Branch:** `uat-doodle` → แตก `feedback-4/phase-*` ต่อเฟส
- **สถานะ:** **แผนอย่างเดียว ยังไม่แตะโค้ด** · ทุกข้อใน §0 เป็นคำตอบของพี่จากการถามวันที่ 15 ก.ย. 2569 ไม่ได้เดาเอง · ตรรกะว่าแต้มกับรายได้เกิดจากอะไรและใครได้ **ยกไปคิดต่อใน session อื่น** โดยใช้ [feedback-4-points-vs-income.pdf](feedback-4-points-vs-income.pdf)
- **ต้นตอร่วม (3 เรื่อง):**
  1. **ไม่มีกฎกลาง** — ฟอร์มเริ่ม–จบ 4 ฟอร์มจัดการวันจบไม่เหมือนกันเลย · modal 24 จุดใช้ `Sheet` ตัวเดียว แต่ตัวมันเลื่อนทั้งก้อน · การพิมพ์มี 2 ทาง (mock / live) และไม่มีทางไหนมีกฎกันตัดหน้า
  2. **ทริปมีสถานะในโค้ด แต่หน้าจอไม่เปลี่ยนตาม** — API มี `draft/planning/final/done` ส่วนเว็บมี `ready/ongoing` แต่ไม่มีโค้ดไหนสร้าง `ongoing` · เช็คลิสต์โชว์ทุกสถานะ และเอาขั้นระหว่างทริปมานับ %
  3. **เงินกับแต้มไม่มีสายหลักฐาน** — ไม่มี soft delete เลย ([base.go:13](../apps/api/pkg/models/base.go#L13)) · แถวแต้มเก็บแค่ `trip_id` กับโน้ต · กด "จองแล้ว" เองก็ได้แต้มและรายได้ และติ๊กออกแล้วติ๊กใหม่ก็ได้ซ้ำ

---

## 0. การตัดสินใจที่ล็อกแล้ว (อย่ารื้อ)

| # | ข้อ | สรุป | คำพูดต้นทาง |
|---|---|---|---|
| D-1 | 1 | **กฎเดียวทุกฟอร์มที่มีเริ่ม–จบ** (สร้างทริป · แก้กรอบทริป · ที่พัก · เวลาเริ่ม/จบของรายการในแพลน · ลำดับวันของเที่ยวบิน) ตัวเลือกวันหรือเวลาจบที่อยู่ก่อนเริ่มจะกดไม่ได้และแสดงเป็นสีจาง | "ต้องการให้ ux ของ user เข้าใจว่าเลือกวันจบย้อนหลังไม่ได้ … ทำให้เหมือนกันทั้งระบบถ้ามี form start - end" |
| D-2 | 1 | ถ้าแก้วันหรือเวลาเริ่มจนเลยวันจบ **ให้เลื่อนวันจบตาม โดยคงระยะเท่าเดิม** แล้วขึ้นข้อความสั้นๆ ว่าเลื่อนให้แล้ว | คำตอบ "เลื่อนวันจบตาม" |
| D-3 | 2 | **ลบช่อง "มีอีเมลตั๋วอยู่แล้ว? วางมาเลย" ออกทั้งหมด** ทั้งเว็บ, API `POST /ai/parse-ticket` และเทส | "เป็น free form มาก … ลบออกเลย" |
| D-4 | 3 | พิมพ์หรือบันทึก PDF: **1 วันเริ่มหน้าใหม่** ถ้าวันไหนยาวให้ขึ้นหน้าถัดไปแบบอ่านรู้เรื่อง **ห้ามตัดกลางบรรทัดหรือกลางการ์ด** | "ที่อยากแก้จริงๆคือมันตัดกึ่งกลางตัวหนังสือมาเลย" |
| D-5 | 4 | แผนที่ Google จริง **ปักหมุดจริง + วาดเส้นทางด้วย Google directions + ปุ่มเปิด Google Maps** ⚠ ดู X-0 | "หมุดจริง + วาดเส้นโดยใช้ google map diretions api + ปุ่มเปิด google map" |
| D-6 | 5 | ลากย้ายแล้ว **คำนวณเวลาและวิธีเดินทางใหม่ด้วย Google directions** ⚠ ดู X-0 | "google direction api" |
| D-7 | 5 | ลากแล้ว **ไม่เลื่อนเวลาเริ่ม** ถ้าไปไม่ทันให้ขึ้นเตือนที่รายการ (ใช้ระบบเตือนที่มีอยู่) | คำตอบ "ไม่เลื่อน แค่เตือน" |
| D-8 | 6 | **ทุก modal บน desktop** หัวและท้ายอยู่กับที่ เลื่อนเฉพาะเนื้อหาตรงกลาง · **มือถือห้ามเปลี่ยน** | "drawer sheet version mobile ที่ทำมาโอเคแล้วไม่ต้องแก้ไขอะไร" |
| D-9 | 7 | คนที่ถูกเลือกใน "หารกับใครบ้าง" ใช้ **พื้นเข้มทึบแบบเดียวกับ "ใครจ่าย"** ส่วนคนที่ไม่ถูกเลือกเป็นพื้นเทาอ่อน **ไม่ทำให้จาง** | preview ที่เลือก |
| D-10 | 8 | การ์ดที่อยากไป: ถ้าอยู่ในแพลนแล้วให้แสดง **"อยู่ในแพลน · วัน N · HH:MM →"** กดแล้วไปแท็บแพลน วันนั้น พร้อมไฮไลต์รายการ · ถ้ายังไม่อยู่ให้มีปุ่ม **"+ ใส่ลงแพลน"** เปิดหน้าต่างเพิ่มรายการที่กรอกชื่อไว้ให้แล้ว ผู้ใช้เลือกวันเอง | "บางอันขึ้นอยู่ในแพลนแล้ว แต่อยู่ในแพลนยังไง ไม่รู้" |
| D-11 | 9 | % นับเฉพาะขั้นก่อนเดินทาง · ทริปจะเป็น "พร้อมเดินทาง" เมื่อ **หัวห้องกด "พร้อมไปแล้ว"** (ระบบชวนกดเมื่อขั้นก่อนไปครบ) · การกดคือ**ล็อคแพลน** ถ้าจะแก้ต้องปลดล็อคก่อน | คำตอบ "หัวห้องกด พร้อมไปแล้ว" |
| D-12 | 9 | ห้องที่พร้อมแล้วแสดง **การ์ดนับถอยหลัง + โหมดอ่าน** และยุบเช็คลิสต์ไว้ | "นับถอยหลัง และ view mode" |
| D-13 | 9 | ช่วงวันเดินทาง **เปิดทริปแล้วเข้าโหมดวันเดินทาง (`/t/:id/now`) ทันที** และมีปุ่ม "ดูทั้งห้อง" | คำตอบ "เปิดทริปแล้วเข้าโหมดวันเดินทางเลย" |
| D-14 | 9 | **ทุกคนเห็นหน้าจอเหมือนกัน** ต่างกันแค่ปุ่มตามสิทธิ์: หัวห้องมี พร้อมไปแล้ว / ปลดล็อค / จบทริป · viewer ไม่มีปุ่มแก้ | คำตอบ "ทุกคนเห็นเหมือนกัน" |
| D-15 | 10 | **ทริปไม่จบเอง** หลังวันกลับระบบจะถาม แล้ว**หัวห้องเป็นคนกดยืนยันจบ** · การจบทริปไม่ลบข้อมูลใดๆ | "ระบบถาม หัวห้องกดยืนยัน เพราะในอนาคตเราจะมีให้รีวิวด้วย" |
| D-16 | 10 | กรณีตกเครื่อง: **ไม่ทำหน้าใหม่** ทริปที่หัวห้องยังไม่กดจบยังเป็น "กำลังเที่ยว" และเปิดดูข้อมูลได้ครบ (ต้องมีเน็ต) | คำตอบ "ไม่เพิ่มหน้าใหม่" |
| D-17 | 12 | ทุกขั้นของสายหลักฐานเก็บ **ใคร–อะไร–เมื่อไหร่–เท่าไหร่ + ชื่อ ณ ตอนนั้น** (id ของขั้นก่อนหน้า + snapshot) ไม่ต้องเก็บสำเนาแพลนทั้งก้อน และไม่ต้องเก็บข้อมูลดิบจากภายนอก | คำตอบข้อ "เก็บแค่ไหน" |
| D-18 | 12 | **ห้ามลบของที่ผูกกับแต้มหรือเงิน** ปุ่มลบจะกลายเป็น "เก็บเข้าคลัง" | คำตอบข้อ "ตอนลบ" |
| D-19 | 12 | กันการแก้หลักฐาน **ที่ระดับโค้ดแอป**: ledger เขียนเพิ่มได้อย่างเดียว ถ้าผิดให้เขียนแถวกลับรายการ | คำตอบข้อ "กันแก้" |
| D-20 | 12 | **แอดมินคนเดียวแก้ยอดได้** แต่ต้องกรอกเหตุผล อ้างอิงรายการต้นทาง และระบบบันทึกว่าใครทำ | คำตอบข้อ "แก้ยอด" |
| D-21 | 11 | **ปิดยอดวันอังคารเว้นอังคาร (ทุก 14 วัน)** แอดมินเลื่อนรอบให้เร็วขึ้นได้ (เช่นช่วงวันหยุด) แต่เลื่อนช้าลงไม่ได้ · **โอนภายใน 3 วันทำการ** · ยอดที่นับเข้ารอบคือยอดที่พาร์ตเนอร์จ่ายเราแล้วเท่านั้น · ไม่ถึงขั้นต่ำ ฿300 ให้ทบไปรอบหน้า | "ปิดยอดเป็นรอบๆ … ยึดวันอังคาร" + คำตอบเรื่อง 14 วัน |
| D-22 | 11 | ต้อง**ยืนยันตัวตนก่อนเปิดรับรายได้**: ชื่อ-นามสกุลจริงที่ตรงกับบัญชีธนาคาร · เบอร์โทร (ยืนยัน OTP) · อีเมล · เลขบัตรประชาชน (บุคคลธรรมดา) หรือเลขผู้เสียภาษี (นิติบุคคล) · รูปบัตรประชาชน (ปิดศาสนา/กรุ๊ปเลือดได้) · เซลฟี่คู่บัตร · บัญชีธนาคารหรือพร้อมเพย์ที่ชื่อตรงกับผู้สมัคร | คำตอบข้อ KYC |
| D-23 | 11 | เซลฟี่คู่บัตร **ให้แอดมินตรวจเองก่อน** และออกแบบข้อมูลให้สลับไปใช้ผู้ให้บริการ e-KYC ได้ทีหลัง | คำตอบ "เริ่มแอดมินตรวจ แล้วค่อยเปลี่ยน" |
| D-24 | 11 | การกด **"จองแล้ว" เองไม่ให้อะไรเลย** ทั้งแต้ม รายได้ และเครดิตคืน Trip Pass ต้องมีพาร์ตเนอร์ยืนยันเท่านั้น | คำตอบ "ไม่ให้อะไร ต้องมีพาร์ตเนอร์ยืนยัน" + "ใช้กฎเดียวกัน" |
| D-25 | 12 | **ใครได้แต้ม ใครได้เงิน จากเหตุไหน** ยังไม่ตัดสินในรอบนี้ ให้ไปคิดต่อใน session อื่นพร้อม PDF | "แยก logic … ออกมาเป็น PDF เพื่อนำไปคิดใน session อื่น" |
| D-26 | 9 | ขั้น "ตรวจดู" ที่ไม่มีทางกดครบ 100% เอง **มีปุ่ม "เรียบร้อยแล้ว"** ให้กดข้าม (เก็บเป็น override แบบเดียวกับ "ข้าม" ที่มีอยู่แล้ว) — ตอบ O-1 | คำตอบ 16 ก.ย. 2569 "เพิ่มปุ่ม 'เรียบร้อยแล้ว'" |
| D-27 | 9 | ทริปที่ถึงวันเดินทางแล้วแต่หัวห้องยังไม่กด "พร้อมไปแล้ว" **ยังไม่เข้าโหมด ongoing** ต้องกดพร้อมก่อนเท่านั้น — ตอบ O-2 | คำตอบ 16 ก.ย. 2569 "ต้องกดพร้อมก่อนเท่านั้น" |
| D-28 | 10 | ทริปเก่าที่เลยวันกลับมานานแล้วไม่มีใครกดจบ **ปิดอัตโนมัติถ้าเกินกำหนด** (ใช้ตัวเลข 30 วันตามตัวอย่างในเอกสารนี้ ยังไม่ได้ถามพี่ว่าจำนวนวันที่แน่นอน — ปรับได้ทีหลังถ้าไม่ตรงใจ) — ตอบ O-3 | คำตอบ 16 ก.ย. 2569 "ปิดอัตโนมัติถ้าเกินกำหนด" |
| D-29 | 11–12 | รอบนี้ทำ **เฟส 4 + เฟส 5 ทั้งหมด** โดยใช้ตัวแทนชั่วคราว: OTP เป็น stub · KYC ให้แอดมินตรวจเอง · ช่องภาษีหัก ณ ที่จ่ายเว้นว่างไว้รอนักบัญชี (O-8) | คำตอบ 16 ก.ย. 2569 "เฟส 4 + 5 ทั้งหมด (ใช้ตัวแทนชั่วคราว)" |
| D-30 | 11–12 | **ใช้กติกาตาม [business-plan.md §3.1](business-plan.md)**: ตัด 480 แต้มของครีเอเตอร์ตอนมีคนจอง · ส่วนแบ่งครีเอเตอร์ s% แอดมินตั้งได้ เริ่ม 15% · เครดิตคืน Trip Pass = min(ยอด Pass, ค่าคอม − AI − gateway − ส่วนแบ่งครีเอเตอร์) · เครดิตคืนผู้จอง = α% × ที่เหลือหลังเครดิตคืน แอดมินตั้งได้ เริ่ม 8% | คำตอบ "ใช้กติกาใหม่เลย" + "เอาตาม business plan" |
| D-31 | 12 | ตั้งค่าทริปมีปุ่ม **"เก็บเข้าคลัง"** · หน้า **คลังอยู่ในหน้าโปรไฟล์** กดกู้คืนได้ | คำตอบ "มีปุ่ม + หน้าคลังให้กู้คืน" + "ในหน้าโปรไฟล์" |
| D-32 | 12 | ทุกทริปเข้าคลังก่อน · ในคลัง **ลบถาวรได้เฉพาะทริปที่ไม่เคยทำให้เกิดแต้มหรือเงิน** | คำตอบ "เข้าคลัง + ลบจริงจากคลังได้" |
| D-33 | 12 | ทริปสาธารณะที่เก็บเข้าคลัง **ปิดสาธารณะอัตโนมัติ** · คนที่คัดลอกไปแล้วยังใช้สำเนาของตัวเองได้ · กู้คืนแล้วไม่เปิดสาธารณะให้เอง | คำตอบ "ปิดสาธารณะอัตโนมัติ" |
| D-34 | 12 | ทริปในคลัง **ไม่นับโควตาทริปฟรี** — ตอบ O-5 | คำตอบ "ไม่นับ" |
| D-35 | 11 | รายได้ของครีเอเตอร์ที่ยังไม่ยืนยันตัวตน **เก็บรอไว้ 180 วันนับจากวันที่รายได้ก้อนนั้นเกิด** เตือนก่อนหมด 14 วัน ถ้ายังไม่ยืนยันตัวตนรายได้ก้อนนั้นหมดอายุ — ตอบ O-6 | คำตอบ "เก็บรอมีวันหมดอายุ" + "180 วัน" |
| D-36 | 12 | การจองที่ถูกยกเลิก **หลังโอนเงินไปแล้ว** ขึ้นธงในหน้าแอดมิน แอดมินตัดสินทีละเคสผ่านการแก้ยอด (D-20) — ตอบ O-7 | คำตอบ "แอดมินตัดสินทีละเคส" |
| D-37 | 11 | ทางเข้า "เปิดรับรายได้" **อยู่ในโปรไฟล์ตลอด** ให้ความรู้สึกแบบยืนยันผู้ขายใน marketplace · ผ่านแล้วได้ป้าย **"ยืนยันตัวตนแล้ว"** แสดงที่ โปรไฟล์ตัวเอง · หน้าครีเอเตอร์ /u/ · หน้าทริปสาธารณะ /p/ · การ์ดใน explore | คำตอบ "ทุกคนเห็นในโปรไฟล์ … เป็น badge ติดโปรไฟล์" + ที่แสดงป้าย + ชื่อป้าย |
| D-38 | 11 | รูปบัตรประชาชน: **ผู้ใช้ปิดศาสนา/กรุ๊ปเลือดเองก่อนถ่าย** มีภาพตัวอย่าง + คำแนะนำ ระบบไม่แก้รูป | คำตอบ "ผู้ใช้ปิดเองก่อนถ่าย" |
| D-39 | 11 | KYC ไม่ผ่าน: แอดมินระบุขั้นที่ไม่ผ่านพร้อมเหตุผล **ผู้ใช้แก้เฉพาะขั้นนั้นแล้วส่งใหม่ ไม่จำกัดครั้ง** | คำตอบ "แก้เฉพาะขั้นที่ไม่ผ่าน" |
| D-40 | 11 | รอบปิดยอดยังไม่มีจนกว่า **แอดมินเลือกวันอังคารตั้งต้นเองในหน้าแอดมิน** | คำตอบ "แอดมินตั้งเองตอนเปิดระบบ" |
| D-41 | 12 | การจองที่ผูกกับการยืนยันของพาร์ตเนอร์ ปุ่มลบกลายเป็น "เก็บเข้าคลัง" · กดแล้ว **ซ่อนจากรายการ มีลิงก์ "เก็บเข้าคลัง (N)" ท้ายหน้าให้เปิดดู/กู้คืน** | คำตอบ "ซ่อน + ลิงก์ดูที่เก็บไว้" |
| D-42 | 11 | แจ้งเตือนเรื่องเงิน (ผล KYC · โอนเงินแล้ว · รายได้ใกล้หมดอายุ) **ขึ้นกล่องแจ้งเตือนในแอปอย่างเดียว** | คำตอบ "กล่องแจ้งเตือนในแอปอย่างเดียว" |

### ⚠ X-0 — ต้องทดสอบก่อนเริ่มเฟส 2 (ผลกระทบต่อ D-5 / D-6)

API เส้นทางของ Google (**Directions API** ถูกย้ายเป็น Legacy ตั้งแต่ มี.ค. 2025 ตัวที่ใช้แทนคือ **Routes API**) **ไม่มีเส้นทางรถไฟในญี่ปุ่น** ([กระทู้ ก.ค. 2026](https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267): ตอบกลับมาแค่ DRIVING/WALKING/BICYCLING) แต่แอป Google Maps บนมือถือยังมีเส้นทางรถไฟ
→ ทริปญี่ปุ่นซึ่งเป็นตลาดหลัก จะวาดเส้นในแอปได้เฉพาะช่วงที่เดินหรือนั่งรถ ส่วนช่วงที่นั่งรถไฟต้องใช้ fallback ตาม O-4
**งาน:** สร้าง Google Cloud project + billing + key 2 ตัว (browser key จำกัด referrer, server key จำกัด IP) แล้วยิง `computeRoutes` แบบ `TRANSIT` จาก Ueno ไป Shibuya 1 ครั้งเพื่อยืนยัน ก่อนเขียนโค้ดเฟส 2

---

## 1. สรุป Impact ทั้ง 12 ข้อ

| ข้อ | F | แตะ | Migration | ต้องทำโค้ดซ้ำแยก device? | ขนาด* | ความเสี่ยงหลัก |
|---|---|---|---|---|---|---|
| 1 | F1 | web 6 ไฟล์ + `TimeField` ใหม่ + helper · API 3 handler | ไม่มี | ไม่ต้อง | M · 2–3 วัน | ข้อมูลเก่าที่วันจบอยู่ก่อนวันเริ่ม · รายการที่ข้ามเที่ยงคืนใส่เวลาจบไม่ได้ |
| 2 | F2 | web 1 flow + repo 3 ชั้น + e2e · API handler/pipeline/tests | ไม่มี | ไม่ต้อง | S · 0.5–1 วัน | ต่ำ |
| 3 | F3 | route พิมพ์ใหม่ใน web + CSS สำหรับพิมพ์ · ปุ่มในแพลน · (เลือกได้) Go export | ไม่มี | ไม่ต้อง (แต่ต้องทดสอบ Safari iOS แยก) | M · 1.5–2 วัน | เบราว์เซอร์แต่ละตัวทำตาม `break-inside` ไม่เท่ากัน |
| 4 | F4 | web แผนที่ + ค้นหาสถานที่ · API proxy Places/Routes + cache · AI pipeline | `plan_items` +พิกัด/place | ไม่ต้อง | L · 4–6 วัน | ⚠ X-0 · ค่าใช้จ่าย Google · เงื่อนไขการเก็บพิกัดจาก Google (O-11) |
| 5 | F5 | API move/add/delete/undo → คำนวณเส้นทางใหม่ · SSE · web แสดง "ประมาณ" | `plan_items.travel_source` | ไม่ต้อง | M–L · 3–4 วัน | ต้องทำ F4 ก่อน · latency ตอนลาก |
| 6 | F6 | `Sheet` ไฟล์เดียว → มีผลกับ 24 จุด | ไม่มี | **ไม่ต้อง** — ใช้ class `sm:` ในคอมโพเนนต์เดียว | S–M · 1 วัน | modal บางตัวส่ง `className` หรือใส่ปุ่มไว้ใน children เอง |
| 7 | F7 | `expense-board.tsx` จุดเดียว | ไม่มี | ไม่ต้อง | XS · ≤0.5 วัน | ต่ำ |
| 8 | F8 | การ์ดที่อยากไป + deep link ในแพลน + `ItemSheet` รับค่าตั้งต้น | ไม่มี | ไม่ต้อง | M · 1.5–2 วัน | ถ้าแพลนล็อคอยู่ (D-11) ต้องปิดปุ่ม |
| 9 | F9 | trip-progress · overview · header · plan-board (โหมดอ่าน) · redirect เข้า Trip Mode · API สถานะกลาง | ไม่มี (ใช้ `status` เดิม) | ไม่ต้อง | L · 4–5 วัน | ตอนแพลนล็อค UI ต้องซ่อนปุ่มแก้ทุกจุด ไม่งั้นผู้ใช้เจอ 409 |
| 10 | F10 | การ์ดถามจบทริป · เงื่อนไขรีวิว · รายการทริปที่ผ่านมาบนหน้าแรก · จบแล้วเปิดกลับได้ | อาจต้องปิดทริปเก่า (O-3) | ไม่ต้อง | M · 2–3 วัน | ทริปเก่าที่ไม่มีใครกดจบจะค้างอยู่ |
| 12 | F12 | ตาราง `value_sources` · คอลัมน์ ledger · archive แทน delete · หน้าไล่ที่มาของแอดมิน · audit log | **หลายตาราง + backfill** | ไม่ต้อง | L–XL · 6–9 วัน | backfill ของเก่าได้ไม่ครบ (ที่ลบไปแล้วเอาคืนไม่ได้) |
| 11 | F11 | KYC · บัญชีรับเงิน · รอบปิดยอด · หน้าคิวแอดมิน · OTP · storage เข้ารหัส | **หลายตาราง** | ไม่ต้อง | XL · 8–12 วัน + ผู้ให้บริการ | PDPA · ภาษี · ผู้ให้บริการ SMS |

\*ประมาณการคนเดียว รวมทั้ง mock repo และ live repo (ทุกหน้าจอใหม่ต้องทำ 2 ชั้น — [phase-5-admin.md §4.5](phase-5-admin.md))

**ตอบคำถามเรื่องข้อ 6:** ไม่ต้องเขียนโค้ดซ้ำแยก device เพราะ modal ทั้งแอปผ่าน [sheet.tsx](../apps/web/components/ui/sheet.tsx) ตัวเดียว ซึ่งเป็น bottom sheet บนมือถือและการ์ดกลางจอตั้งแต่ `sm` ขึ้นไปอยู่แล้ว การแก้ desktop จึงใส่ class `sm:` ในไฟล์นี้ได้เลยโดยมือถือไม่เปลี่ยน ที่ต้องเผื่อเวลาไว้คือไล่เช็คทั้ง 24 จุด ไม่ใช่การเขียนโค้ดสองชุด

---

## 2. เฟส 1 — ของเล็กและของกลาง (ทำก่อน)

### F7 ปุ่มหารกับใครบ้าง (D-9) — XS
**ต้นตอ:** [expense-board.tsx:315-318](../apps/web/components/expense/expense-board.tsx#L315) ใช้ `on ? 'bg-primary/12 text-primary' : 'bg-surface text-muted opacity-60'` ในขณะที่ "ใครจ่าย" [:289](../apps/web/components/expense/expense-board.tsx#L289) ใช้ `bg-ink text-bg` ฟอร์มเดียวกันจึงมีสีของสถานะ "เลือกแล้ว" สองแบบ และแบบสีส้มจางดูเหมือนปุ่มที่ยังไม่ได้กด
**แก้:** `on ? 'bg-ink text-bg' : 'bg-surface text-muted'` (เอา `opacity-60` ออก) · เพิ่ม `aria-pressed`
**Impact:** 1 ไฟล์ ไม่แตะ API · ไล่ดู chip เลือกหลายคนที่อื่นให้ภาษาเดียวกัน (`poll-board`, `FilterChip` ใน [wishlist-board.tsx:282](../apps/web/components/wishlist/wishlist-board.tsx#L282))

### F2 ลบช่องวางอีเมลตั๋ว (D-3) — S
**ต้นตอ:** JSX อยู่ในไฟล์เดียว [new-trip-flow.tsx:510-545](../apps/web/components/trip/new-trip-flow.tsx#L510) แสดงเฉพาะตอนติ๊ก "จองไฟลท์แล้ว" · live เรียก `POST /ai/parse-ticket` (Anthropic `ModelFast` ถ้า error จะใช้ heuristic) · mock ใช้ regex
**ลบ — web:**
- `new-trip-flow.tsx`: `SAMPLE_TICKET` [:114-117], state `ticket/pasting/parsing/ticketNote` [:145-148], `readTicket` [:228-263], JSX [:510-545], import `ClipboardPaste` (เช็คว่า `Textarea`/`fieldClass` ยังมีที่ใช้อยู่ไหม)
- แก้คำใบ้ขั้นแรก [:78](../apps/web/components/trip/new-trip-flow.tsx#L78) "มีตั๋วในมือ — วางข้อความจากอีเมลตั๋วได้เลย"
- `parseTicket` ใน [repo.ts:169](../apps/web/lib/data/repo.ts#L169) · [mock/repo.ts:944-996](../apps/web/lib/data/mock/repo.ts#L944) · [live/repo.ts:297-299](../apps/web/lib/data/live/repo.ts#L297) · `ParsedTicket` [types.ts:895](../apps/web/lib/data/types.ts#L895) · `ParsedTicketDto` [dto.ts:881](../apps/web/lib/data/live/dto.ts#L881) · `toParsedTicket` [mappers.ts:1239](../apps/web/lib/data/live/mappers.ts#L1239)
- e2e [trip-flow.spec.ts:57-68](../apps/web/e2e/trip-flow.spec.ts#L57)
- **คงไว้:** ค่า `'ticket'` ใน `route_built.source` ([analytics.ts:23](../apps/web/lib/analytics.ts#L23) เก็บ union ไว้ให้ข้อมูลเก่ายังอ่านได้) · `?from=ticket` [:875](../apps/web/components/trip/new-trip-flow.tsx#L875) (ลิงก์เก่า)

**ลบ — API:** route + handler [ai.handler.go:43, 469-505](../apps/api/pkg/handlers/api/ai.handler.go#L469) · DTO 2 ตัว [dto.go:949-962](../apps/api/pkg/handlers/api/dto.go#L949) · `ParseTicket` + `ticketSystem` [pipeline.go:33, 714-746](../apps/api/pkg/services/ai/pipeline.go#L714) · `services/ai/ticket.go` + `ticket_test.go` · `ParsedTicket` [schemas.go:77-78](../apps/api/pkg/services/ai/schemas.go#L77) · stub [wiring.go:199](../apps/api/pkg/testsupport/wiring.go#L199) · `AIKindTicket` [aijob.go:17](../apps/api/pkg/models/aijob.go#L17) (ตอนนี้ไม่มีใครใช้อยู่แล้ว) · บรรทัดใน `prompts/README.md`
**สิ่งที่ยังกรอกเองได้:** `RouteBuilder` ในขั้นเดียวกัน และ [route-card.tsx:188](../apps/web/components/trip/route-card.tsx#L188) ในห้องทริป
**Impact:** ไม่มีหน้าอื่นเรียก endpoint นี้ · หมายเหตุใน `feedback-2-fix-list.md` บรรทัด 83, 228 ให้เขียนว่า "ถูกทับด้วย D-3 ของ Feedback #4"

### F6 Modal หัว/ท้ายอยู่กับที่บน desktop (D-8) — S–M
**ต้นตอ:** [sheet.tsx:69-97](../apps/web/components/ui/sheet.tsx#L69) กล่องทั้งใบเป็น `overflow-y-auto` ส่วนหัว [:78-92] และ footer [:96] อยู่ใน scroll container เดียวกัน พอเลื่อนลงหัวจึงหายไปด้วย และปุ่มบันทึกอยู่ท้ายสุดของเนื้อหา
**แก้:** ใส่ class ที่มีผลเฉพาะ `sm:` ในไฟล์เดียว
- กล่อง: `sm:flex sm:flex-col sm:overflow-hidden sm:p-0` (มือถือยังเป็น `overflow-y-auto p-5` เหมือนเดิม)
- หัว: `sm:shrink-0 sm:px-5 sm:pt-5 sm:pb-3 sm:border-b` (มีเส้นเฉพาะตอนเนื้อหาเลื่อน ถ้าทำได้)
- เนื้อหา: ห่อ `children` ด้วย `<div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:px-5">`
- footer: `sm:shrink-0 sm:border-t sm:px-5 sm:py-4 sm:mt-0`

**Impact — ผู้ใช้ `Sheet` ทั้ง 24 จุด ต้องเปิดดูทีละตัวที่ 1280px:**
`billing/trip-limit-sheet` · `booking/agent-handoff` · `budget/budget-screen` · `collab/inbox-bell` · `collab/poll-board` · `document/documents-screen` · `editor/item-sheet` · `editor/plan-board` (ประวัติ) · `expense/expense-board` · `photo/photo-book-sheet` · `photo/photos-screen` · `prep/prep-screen` · `profile/dream-list` · `profile/points-redeem` · `profile/profile-edit-sheet` · `public/adapt-dialog` · `public/country-filter` · `trip/invite-dialog` · `trip/route-card` · `trip/share-dialog` · `trip/trip-cover-sheet` · `trip/trip-frame-dialog` · `wishlist/trip-profile-card` · `wishlist/wishlist-board`
- จุดเสี่ยง: ตัวที่ส่ง `className` มาเปลี่ยนความกว้าง/padding · ตัวที่ใส่ปุ่มบันทึกไว้ใน `children` แทน `footer` (ปุ่มจะไม่ติดท้าย → ย้ายไปใส่ `footer`) · ตัวที่มี sticky ของตัวเองข้างใน
- `ItemSheet` มีช่องคอมเมนต์ต่อท้าย [item-sheet.tsx:260-264](../apps/web/components/editor/item-sheet.tsx#L260) ซึ่งยาวได้ไม่จำกัด ส่วนนี้คือจุดที่ผู้ทดสอบเจอ และต้องอยู่ในส่วนที่เลื่อน
- **มือถือ:** เปิด DevTools 375px เทียบก่อน/หลังทุกตัว ต้องเหมือนเดิมทุกพิกเซล

### F1 กฎเริ่ม–จบกลาง (D-1, D-2) — M
**ต้นตอ (ทุกฟอร์มไม่เหมือนกัน):**

| ฟอร์ม | วันจบก่อนเริ่มกดได้ไหม | แก้เริ่มจนเลยจบ |
|---|---|---|
| วันทริปใน [new-trip-flow.tsx:558-571](../apps/web/components/trip/new-trip-flow.tsx#L558) | กดไม่ได้ (`min`) | วันจบกลายเป็นเริ่ม **+4 วัน** [:563] |
| ที่พัก [:647-666](../apps/web/components/trip/new-trip-flow.tsx#L647) | กดไม่ได้ | **ล้าง**วันเช็คเอาต์ [:652-657] |
| แก้กรอบทริป [trip-frame-dialog.tsx:122-130](../apps/web/components/trip/trip-frame-dialog.tsx#L122) | กดไม่ได้เฉพาะตอนเลือก | **ไม่ทำอะไร** ส่งวันจบที่อยู่ก่อนวันเริ่มขึ้น API ไปเลย [:50-65] |
| เวลารายการ [item-sheet.tsx:206-225](../apps/web/components/editor/item-sheet.tsx#L206) | **กดได้** (native `type="time"` ไม่มี `min`) | ไม่ทำอะไร |
| ขาเที่ยวบิน [route-builder.tsx:220-260](../apps/web/components/trip/route-builder.tsx#L220) | **กดได้** ขาแต่ละขาไม่ผูกกัน | `buildRoute` เรียงใหม่ให้เงียบๆ |
| API | **ไม่มีที่ไหนเช็คเลย** — [trip.handler.go:173-182, 396-409](../apps/api/pkg/handlers/api/trip.handler.go#L173) · booking · item · flight | — |

และ `DateField` ไม่ตรวจค่าที่ parent ส่งเข้ามาใหม่ [date-field.tsx:62-67](../apps/web/components/ui/date-field.tsx#L62)

**แก้:**
- `lib/date-range.ts` (ใหม่) ฟังก์ชันเดียวที่ทุกฟอร์มเรียกใช้: `nextRange(prev, patch)` → ถ้าเริ่มเลยจบให้เลื่อนจบโดยคงระยะ (วันหรือนาที) และคืน `{ start, end, shifted }` เพื่อให้ฟอร์มแสดงข้อความ "เลื่อนวันกลับตามให้แล้ว (5 วัน 4 คืนเท่าเดิม)"
- `components/ui/time-field.tsx` (ใหม่): ช่องเวลาแบบเดียวกับ `DateField` มีรายการเวลาทีละ 15 นาที และช่วงก่อน `min` เป็นสีจางกดไม่ได้ · **ต้องทำใหม่** เพราะ `<input type="time" min>` ในเบราว์เซอร์ส่วนใหญ่ไม่ทำให้ตัวเลือกจาง แค่ทำให้ฟอร์มไม่ผ่าน validation → ไม่ตรงกับ D-1
- ใช้ใน: วันทริป + ที่พัก (new-trip) · trip-frame-dialog · item-sheet (เริ่ม/จบ) · route-builder (วันออกของขาถัดไป ≥ วันถึงของขาก่อน)
- ถ้าเลื่อนวันทริปจนที่พักที่กรอกไว้หลุดช่วง: **ไม่เลื่อนที่พักให้** (เป็นของที่จองแล้ว) แต่ขึ้นเตือนที่แถวนั้น
- API: `end >= start` ใน create/update ของ trip, booking (check-in/out) และ item (ถ้ามี end) ส่ง 400 พร้อมข้อความไทย · **เที่ยวบินไม่บังคับเวลา** เพราะเวลาถึงเป็นเวลาท้องถิ่น ข้ามโซนเวลาแล้วอาจดูเร็วกว่าเวลาออกได้ ([flight.go:41-44](../apps/api/pkg/models/flight.go#L41)) ให้บังคับแค่ลำดับวันของขา

**Impact:** web 6 ไฟล์ + 2 ไฟล์ใหม่ + vitest ของ helper · API 3 handler + go test · ไม่มี migration
- ข้อมูลเก่าใน DB ที่วันจบอยู่ก่อนวันเริ่มยังอยู่ (validation ทำตอนเขียนเท่านั้น) → ตอนเปิดฟอร์มแก้ helper จะเลื่อนให้เอง
- รายการที่ข้ามเที่ยงคืน (อิซากายะ 22:00–01:00) ใส่เวลาจบไม่ได้ → ให้เว้นว่างไว้ (ช่องจบไม่บังคับอยู่แล้ว)

### D-24 ปิดรูกด "จองแล้ว" เอง (ย้ายมาทำเฟส 1 เพราะเงินรั่วอยู่ตอนนี้) — S
**ต้นตอ:** [booking.handler.go:146, 186-190](../apps/api/pkg/handlers/api/booking.handler.go#L186) ถ้าเปลี่ยนจากยังไม่จองเป็น "จองแล้ว" จะเรียก `awardBookingPoints` (480 แต้ม + รายได้ประมาณการให้เจ้าของแพลน [:422-446]) และ `refundTripPass` · ติ๊กออกแล้วติ๊กใหม่ `wasBooked` จะเป็น false อีกรอบ แต้มกับรายได้จึงออกซ้ำ (earning ที่ `click_id` เป็น NULL ไม่ติด unique index) — *ได้จากการอ่านโค้ด ยังไม่ได้รันทดสอบ*
**แก้:** ทางกดเองเหลือแค่เปลี่ยนสถานะการจอง + `BookedBy` + badge บนรายการ · เอา `awardBookingPoints` กับ `refundTripPass` ออกจากทางนี้ ให้เหลือแค่ใน webhook [:287](../apps/api/pkg/handlers/api/booking.handler.go#L287) · ลบ `awardBookingPoints` ทิ้ง · ข้อความในหน้าจอที่สัญญาว่าจองแล้วได้แต้มหรือได้เงินคืน ต้องเปลี่ยนเป็น "เมื่อพาร์ตเนอร์ยืนยันการจอง"
**Impact:** go test ของทาง manual (ถ้ามี) ต้องกลับด้าน · mock repo ต้องทำตาม · **กระทบคำสัญญา Trip Pass** ([decision-log.md](decision-log.md) "คืนเต็มจำนวนเมื่อทริปนั้นเกิดการจองผ่าน ROVE") → วันนี้ยังไม่มี affiliate จริง (D0.6) แปลว่า**ช่วงนี้จะไม่มีใครได้เงินคืนเลย** ต้องแก้ข้อความบนหน้าราคาให้ตรง

---

## 3. เฟส 2 — หน้าแพลน (หลัง X-0)

### F3 พิมพ์/บันทึก PDF ไม่ตัดกลางตัวหนังสือ (D-4) — M
**ต้นตอ:**
- UAT (mock) ปุ่ม "พิมพ์/บันทึก" เรียก `window.print()` ของหน้าแอปทั้งหน้า [plan-board.tsx:350-356](../apps/web/components/editor/plan-board.tsx#L350) และ**ทั้งแอปไม่มี CSS สำหรับพิมพ์เลย** (มี `print:` แค่ใน `receipt-view`) → ผู้ทดสอบจึงเห็น nav ปุ่ม และการ์ดถูกหั่นกลางบรรทัด
- live เปิด HTML จาก [export.handler.go:144-198](../apps/api/pkg/handlers/api/export.handler.go#L144) ซึ่งไม่มี `break-*` เลย และ `.foot{position:fixed;bottom:0}` ตอนพิมพ์ [:168] **ทับบรรทัดท้ายของทุกหน้า**

**แก้:**
- **หน้าพิมพ์หน้าเดียวใน web** `app/(print)/t/[tripId]/print/page.tsx` (ไม่มี AppShell) ดึงข้อมูลผ่าน repo จึงใช้ได้ทั้ง mock และ live → ปุ่มเปิดแท็บใหม่แล้วสั่ง `window.print()` เมื่อโหลดเสร็จ · ตัดทาง mock/live ที่แยกกันอยู่ออก
- CSS: `@page { size: A4; margin: 14mm }` · ทุกวัน `break-before: page` (ยกเว้นวันแรก) · หัววัน `break-after: avoid` · แต่ละรายการ `break-inside: avoid` · `orphans: 3; widows: 3` · ไม่มี `position: fixed`
- วันที่ยาวเกินหน้า: ทำเป็น `<table>` ที่มี `<thead>` "วัน 2 · โตเกียว (ต่อ)" เพราะ Chrome/Safari พิมพ์ `thead` ซ้ำทุกหน้า ผู้อ่านจึงรู้ว่าหน้านี้เป็นของวันไหน
- Go `format=html`: ใส่กฎชุดเดียวกัน (เผื่อมีคนถือลิงก์เก่า) หรือให้ redirect ไปหน้าพิมพ์ใน web
**Impact:** route ใหม่ + ปุ่ม 1 จุด · ต้องทดสอบ Chrome desktop, Safari macOS, **Safari iOS (แชร์ → พิมพ์)** เพราะ iOS ทำตาม `break-inside` ไม่ครบ · e2e: Playwright `page.pdf()` กับวันที่มี 14 รายการ แล้วดูผลด้วยตา
**นอกขอบเขตแต่ปัญหาเดียวกัน:** Photo Book ([photo.handler.go:195](../apps/api/pkg/handlers/api/photo.handler.go#L195)) ก็พิมพ์ผ่านเบราว์เซอร์ ควรตรวจกฎเดียวกันในรอบถัดไป

### F4 แผนที่จริง (D-5) — L · ต้องผ่าน X-0 ก่อน
**ต้นตอ:** [route-map.tsx](../apps/web/components/editor/route-map.tsx) เป็น SVG วางจุดตาม hash ของ id (คอมเมนต์เขียนไว้ว่ารอ key ของ W5.9) · `plan_items` **ไม่มีพิกัด** มีแค่ `poi_id` [plan.go:55-80](../apps/api/pkg/models/plan.go#L55) ที่ไปหา `pois.lat/lng/google_place_id` [poi.go:19-21](../apps/api/pkg/models/poi.go#L19) · ช่องค้นหาใน `ItemSheet` ค้นจากตาราง POI ที่ seed ไว้เท่านั้น [item-sheet.tsx:81](../apps/web/components/editor/item-sheet.tsx#L81) รายการที่พิมพ์เองจึงไม่มีตำแหน่ง · key ใน [.env.example:95, 145](../.env.example#L95) ยังว่าง · [places.go](../apps/api/pkg/services/places/places.go) ใช้ Places และ Distance Matrix รุ่น Legacy

**แก้:**
- **Migration** `plan_items` + `google_place_id`, `lat`, `lng`, `place_cached_at` · backfill จาก `pois`
- **API proxy** (ไม่เปิด server key ให้เบราว์เซอร์): `GET /places/autocomplete` (Places API New) · `GET /places/:placeId` · `POST /routes/legs` (Routes API `computeRoutes` ทีละคู่ ขอ `polyline` + `duration` + `distance`) · cache ใน Redis แบบเดียวกับ `cachedRoute` ([places.go:283](../apps/api/pkg/services/places/places.go#L283))
- `ItemSheet`: ค้นหาด้วย autocomplete (POI ที่ seed ไว้ยังอยู่บนสุด) → เก็บ place id และพิกัด
- AI pipeline: รายการที่ AI ได้มาจาก `lookup_poi` ให้เขียนพิกัดลงรายการด้วย
- **แผนที่** (Maps JavaScript API): หมุดมีเลขลำดับตามวัน · เส้นช่วงเดิน/รถจาก polyline · **ช่วงรถไฟในญี่ปุ่นที่ Google ไม่ให้ (X-0)** → เส้นประตรง + ป้าย "รถไฟ ~N นาที (ประมาณ)" (O-4)
- **ปุ่ม "นำทาง" ต่อช่วง** → `https://www.google.com/maps/dir/?api=1&origin=place_id:…&destination=place_id:…&travelmode=transit` (ลิงก์ Maps URLs ไม่ต้องใช้ key ไม่เสียเงิน และแอปมือถือมีเส้นทางรถไฟญี่ปุ่น) · ใช้ปุ่มต่อช่วงแทนปุ่มทั้งวัน เพราะ Maps URLs จำกัดจำนวนจุดแวะ
- mock mode / ไม่มี key: ใช้ SVG เดิมเป็น fallback · **UAT ต้องมี browser key** ไม่งั้นผู้ทดสอบจะไม่เห็นแผนที่จริง

**Impact:**
- ค่าใช้จ่าย (ราคาหลังหมดโควตาฟรีรายเดือน): Dynamic Maps ฟรี 10,000 แล้ว $7/1,000 · Autocomplete ฟรี 10,000 แล้ว $2.83/1,000 · Place Details Essentials ฟรี 10,000 แล้ว $5/1,000 · Compute Routes Essentials ฟรี 10,000 แล้ว $5/1,000 ([ราคา](https://developers.google.com/maps/billing-and-pricing/pricing)) → ตั้ง budget alert + ต้องมี cache
- ถ้า deploy ตั้ง CSP ไว้ที่ CDN ต้องเพิ่มโดเมน `maps.googleapis.com`, `maps.gstatic.com` (ไม่พบ CSP ใน `next.config.ts` / `proxy.ts`)
- **O-11:** เงื่อนไขของ Google ให้เก็บ `place_id` ได้ถาวร แต่พิกัดที่ได้จาก Google มีข้อจำกัดเรื่องระยะเวลาเก็บ → ต้องตรวจเงื่อนไขล่าสุดก่อนออกแบบ `place_cached_at`
- `Places API` / `Distance Matrix` Legacy ใน `places.go` ควรย้ายไป API ตัวใหม่พร้อมกัน

### F5 ลากแล้วคำนวณเส้นทางใหม่ (D-6, D-7) — M–L · ต้องทำ F4 ก่อน
**ต้นตอ:** `MoveItem` เปลี่ยนแค่ `sort_order` [plan.store.go:172-196](../apps/api/pkg/store/plan/plan.store.go#L172) · `travel_minutes/mode/line` เก็บที่รายการในความหมาย "จากรายการนี้ไปรายการถัดไป" [plan.go:67-69](../apps/api/pkg/models/plan.go#L67) → หลังลาก ค่านี้กลายเป็นของคู่ที่ไม่ได้อยู่ติดกันแล้ว · `revalidate` ใช้ค่าเก่ามาเตือน [plan.handler.go:69-100](../apps/api/pkg/handlers/api/plan.handler.go#L69) · หน้าจอแสดง `TravelHop` จากค่าเดิม [plan-board.tsx:312, 563-574](../apps/web/components/editor/plan-board.tsx#L563)

**แก้:**
- หลัง move / add / delete / ย้ายวัน / undo ให้ API คำนวณ**เฉพาะคู่ที่เปลี่ยน** (ไม่เกิน 3 คู่: ก่อน→ตัวที่ย้าย, ตัวที่ย้าย→ถัดไป, คู่ที่ปิดช่องในที่เดิม)
- เลือกวิธีเดินทาง: ถ้าคู่เดิมยังอยู่ติดกันให้ใช้ค่าเดิมของ AI · คู่ใหม่ ถ้า ≤ ~1.2 กม. ใช้เดิน (Routes) ถ้าไกลกว่านั้นใช้รถไฟ → ในญี่ปุ่น API ไม่ให้ จึงใช้ `estimate()` ที่มีอยู่แล้ว [places.go:210-228](../apps/api/pkg/services/places/places.go#L210) และติดป้าย "ประมาณ"
- Migration: `plan_items.travel_source` (`ai` | `google` | `estimate` | `unknown`)
- **ไม่แตะเวลาเริ่ม (D-7)** · `ValidatePlan` เตือนเรื่องเวลาเดินทางไม่พอหรือไปถึงนอกเวลาเปิดอยู่แล้ว [validate.go:62](../apps/api/pkg/domain/validate.go#L62) คำเตือนจึงขึ้นบนการ์ดเอง
- Latency: ตอบ move ทันที (optimistic ตามเดิม) → คำนวณเบื้องหลัง → ส่ง `plan_updated` ผ่าน SSE ที่มีอยู่ ([lib/sse.ts](../apps/web/lib/sse.ts)) · ระหว่างรอ hop ขึ้น "กำลังคำนวณ…"
- รายการที่ไม่มีพิกัด: hop ขึ้น "ใส่สถานที่เพื่อคำนวณเวลาเดินทาง" ซึ่งกดแล้วเปิด `ItemSheet`
- Undo [plan.handler.go:128](../apps/api/pkg/handlers/api/plan.handler.go#L128) snapshot แค่ตัวรายการ → ต้องคำนวณคู่ข้างเคียงใหม่หลัง undo ด้วย
- mock repo: ใช้ haversine กับพิกัดใน seed เพื่อให้ UAT เห็นพฤติกรรมจริง

**Impact:** store + 5 handler + migration · go test ของคู่ที่ต้องคำนวณใหม่ · web เปลี่ยนแค่ `TravelHop` · ตัวเลือกแพลน (compare/adopt) ไม่กระทบ

### F8 การ์ดที่อยากไปบอกว่าอยู่ตรงไหนของแพลน (D-10) — M
**ต้นตอ:** [wishlist-board.tsx:134-145](../apps/web/components/wishlist/wishlist-board.tsx#L134) สถานะเป็นตัวหนังสือล้วน · "· ดูในแพลน" เป็น `<span>` ที่กดไม่ได้ · ระบบรู้ `item.itemId` อยู่แล้ว ([helpers.go:241-244](../apps/api/pkg/handlers/api/helpers.go#L241), [wishlist.go:37-38](../apps/api/pkg/models/wishlist.go#L37)) แต่ไม่ได้แปลงเป็นวันและเวลา · ถ้ายังไม่อยู่ในแพลนก็ไม่มีปุ่มให้ทำอะไรต่อ ปุ่มเพิ่มมีอยู่ปุ่มเดียวที่ท้ายรายการ [:171-173]
**แก้:**
- ใช้ `usePlanDays` (อยู่ใน cache แล้ว) แปลง `itemId` เป็น `วัน N · HH:MM` → ลิงก์ `/t/:id/plan?day=<dayId>&item=<itemId>`
- `plan-board`: อ่าน search params เพื่อเลือกวัน เลื่อนไปที่รายการ และไฮไลต์ `ring` 2 วินาที
- ยังไม่อยู่: ปุ่ม "+ ใส่ลงแพลน" → `ItemSheet` รับ prop ใหม่ `initial` (title, poiId, type `poi`) และมีตัวเลือกวัน · ถ้ายังไม่มีแพลนเลย ปุ่มเปลี่ยนเป็น "ให้ AI ร่างแพลน" · viewer ไม่เห็นปุ่ม · **แพลนล็อค (D-11)** ให้ปิดปุ่มพร้อมบอกว่า "ปลดล็อคแพลนก่อน"
- create item เรียก `recomputeCoverage` อยู่แล้ว [item.handler.go:104](../apps/api/pkg/handlers/api/item.handler.go#L104) พอกลับมาที่แท็บ การ์ดจึงเปลี่ยนเป็น ✓ ได้เลย (ต้อง invalidate query `wishlist` หลังเพิ่ม) · mock repo ต้องทำแบบเดียวกัน
**Impact:** 2 คอมโพเนนต์ + prop ใหม่ใน `ItemSheet` · ไม่มี migration · **ไม่รวม** จุดสมาชิกในหน้าภาพรวม ([trip-overview.tsx:282](../apps/web/components/trip/trip-overview.tsx#L282)) เพราะพี่บอกว่าผู้ทดสอบหมายถึงการ์ดในแท็บที่อยากไป

---

## 4. เฟส 3 — วงจรทริป

### ของกลาง: สถานะเดียวที่ทั้ง web และ API ใช้ (F9 + F10)
วันนี้มีสถานะอยู่แล้ว แต่ไม่มีโค้ดไหนใช้ครบ: API `draft/planning/final/done` [trip.go:19-22](../apps/api/pkg/models/trip.go#L19) · web แปลง `final→ready` [mappers.ts:165](../apps/web/lib/data/live/mappers.ts#L165) และมี `ongoing` ในชนิดข้อมูล [model.ts:20](../apps/web/lib/data/model.ts#L20) แต่ไม่มีใครสร้าง · "ทริปจบ" ยังนิยามต่างกันสามแบบ: รีวิวนับจากสถานะ `done` หรือวันกลับที่ผ่านไปแล้ว [review.handler.go:169-178](../apps/api/pkg/handlers/api/review.handler.go#L169) · หน้าแรกนับจากวันที่ [user.handler.go:31](../apps/api/pkg/handlers/api/user.handler.go#L31) · โควตาทริปฟรีนับจาก `status<>done` [trip.store.go:283-292](../apps/api/pkg/store/trip/trip.store.go#L283)

**เพิ่ม `domain.TripPhase(trip, today)`** ที่เดียว คืนค่า `planning` | `ready` | `ongoing` | `awaiting_end` | `done` แล้วส่งใน trip DTO

| phase | เงื่อนไข |
|---|---|
| planning | status ≠ final/done และยังไม่ถึงวันเดินทาง |
| ready | status = final (หัวห้องกดพร้อมไปแล้ว) และยังไม่ถึงวันเดินทาง |
| ongoing | ไม่ใช่ done และวันนี้อยู่ระหว่างวันออกกับวันกลับ (O-2: ถ้ายังไม่กดพร้อมจะนับด้วยไหม) |
| awaiting_end | ไม่ใช่ done และเลยวันกลับแล้ว |
| done | status = done (หัวห้องกดยืนยันแล้ว) |

"วันนี้" ใช้ปฏิทินของเครื่องผู้ใช้ (ไทยกับญี่ปุ่นห่างกัน 2 ชม. ช่วงใกล้เที่ยงคืนอาจคลาดได้ ถือว่ารับได้)

### F9 พร้อมเดินทาง · กำลังเที่ยว (D-11 – D-14) — L
**ต้นตอ 67%:** [trip-progress.ts:68-81](../apps/web/lib/trip-progress.ts#L68) มี 12 ขั้น (รวมที่พัก) และ `progressSummary` นับทุกขั้น [:187-196] · ขั้น `expense` สูงสุดได้แค่ `check` **ไม่มีทางเป็น done** [:149-150] · ขั้น `photos` เป็นของระหว่างทริป · ขั้น `dates` ค้างที่ `check` ถ้าไม่ได้ล็อควันผ่านปฏิทินวันว่าง [:116-121] · ขั้น `plan` ค้างที่ `check` ถ้า coverage ไม่ถึง 100% [:135-137] → 8/12 = **67% · เหลือ 4** ตรงกับที่ผู้ทดสอบเห็น · เช็คลิสต์ render ทุกสถานะ [trip-overview.tsx:82-88](../apps/web/components/trip/trip-overview.tsx#L82)

**แก้:**
- `progressSummary` นับเฉพาะ phase `plan` + `book` · ขั้น `during` (ค่าใช้จ่าย, รูป) ย้ายไปอยู่กลุ่ม "ระหว่างทริป" ที่ไม่มี %
- **O-1:** ขั้นที่เป็น "ตรวจดู" ไม่มีปุ่มยืนยัน % จึงยังไม่ถึง 100 ได้ → เสนอเพิ่มปุ่ม "เรียบร้อยแล้ว" (เก็บเป็น override แบบเดียวกับ "ข้าม" ใน `trip_step_overrides`) · **ต้องให้พี่ยืนยันก่อนทำ**
- **ปุ่ม "พร้อมไปแล้ว" (หัวห้อง):** ใช้ `POST /trips/:id/plan/freeze` ที่มีอยู่ [variant.handler.go:38-39](../apps/api/pkg/handlers/api/variant.handler.go#L38) (owner อยู่แล้ว) · ถ้าขั้นก่อนไปครบระบบจะชวนกดบนสุดของภาพรวม · ข้อความบนปุ่มล็อคเดิมใน [compare-screen.tsx:73-79](../apps/web/components/editor/compare-screen.tsx#L73) เปลี่ยนให้เป็นคำเดียวกัน
- **ห้อง ready (D-12):** บนสุดเป็นการ์ดนับถอยหลัง (อีก N วัน · เที่ยวบินแรก · ที่พัก) + "เช็คลิสต์ก่อนไป ✓ ครบ [ดู]" แบบยุบ · **แท็บแพลนเป็นโหมดอ่าน**: ซ่อนที่จับลาก ปุ่มเพิ่ม ปุ่มร่าง AI และปุ่ม undo · หัวห้องมี "ปลดล็อคเพื่อแก้"
  - ⚠ `PlanUnfrozen` ส่ง 409 ให้ item/undo/apply/adopt → **ทุกปุ่มที่แก้แพลนต้องอ่าน `frozen`**: `plan-board`, `item-sheet`, `ai-generate-dialog`, ปุ่มใส่ลงแพลนของ F8, `compare-screen` · ส่วนการจอง ค่าใช้จ่าย เอกสาร และรูปยังแก้ได้ตามปกติ
- **ongoing (D-13):** ถ้าเข้า `/t/[tripId]` ในช่วง ongoing ให้ redirect ไป `/t/[tripId]/now` · Trip Mode มีปุ่ม "ดูทั้งห้อง" → `/t/:id?room=1` (จำใน sessionStorage ว่าเลือกดูห้องแล้ว ไม่งั้นจะเด้งวนกลับ) · การ์ดบนหน้าแรกลิงก์เข้า `/now` · ปุ่มเดิมบนหัวห้อง [trip-header.tsx:66-69, 137-143](../apps/web/components/trip/trip-header.tsx#L137) เปลี่ยนมาใช้ phase
- ป้ายสถานะ [trip-header.tsx:32-37](../apps/web/components/trip/trip-header.tsx#L32): กำลังวางแพลน · พร้อมเดินทาง · กำลังเที่ยว · รอยืนยันจบทริป · จบทริปแล้ว
- **D-14:** ไม่มีหน้าจอแยกตามบทบาท มีแค่เงื่อนไขซ่อนปุ่มตาม `role`
**Impact:** web ~8 ไฟล์ + API phase ใน DTO · mock repo (`frozen` [mock/repo.ts:1521, 1638-1649](../apps/web/lib/data/mock/repo.ts#L1521)) · vitest ของ `progressSummary` / `TripPhase` · ตัวสลับ variant แท็บ A/B/C ของ Feedback #2 ต้องใช้ได้ทั้งสามแบบ

### F10 จบทริป (D-15, D-16) — M
**ต้นตอ:** ไม่มีอะไรทำให้จบเอง · `done` เกิดได้ทางเดียวคือ `PATCH status` จากปุ่ม "ปิดทริปนี้" ในหน้าชนลิมิต [trip-limit-sheet.tsx:39, 73-79](../apps/web/components/billing/trip-limit-sheet.tsx#L73) · หน้าแรกส่งทริปที่เลยวันกลับไป `/recap` ตามวันที่ [home-screen.tsx:187](../apps/web/components/home/home-screen.tsx#L187)
**แก้:**
- phase `awaiting_end` (วันถัดจากวันกลับ): ทั้ง Trip Mode และห้องขึ้นการ์ด **"กลับถึงบ้านแล้วใช่ไหม?"** · หัวห้องเห็น [จบทริป] [ยังไม่กลับ — เลื่อนวันกลับ] (เปิด `TripFrameDialog` และใช้กฎ D-2) · สมาชิกเห็น "รอหัวห้องยืนยันจบทริป"
- ตกเครื่อง (D-16): ถ้าหัวห้องไม่กด ทริปยังเปิดครบทุกแท็บ · Trip Mode ยังเก็บแพลนรายวันไว้ดูออฟไลน์ตามเดิม ([trip-now.tsx:38-52](../apps/web/components/trip/trip-now.tsx#L38))
- กดจบ → `status=done` → ห้องกลายเป็นบันทึกทริป (อ่านอย่างเดียว) · หน้าแรกย้ายไป "ทริปที่ผ่านมา" **ตาม phase ไม่ใช่ตามวันที่** · หัวห้องมีปุ่ม "เปิดทริปอีกครั้ง" ในบันทึกทริป (เผื่อกดผิด)
- รีวิว: `tripIsOver` เปลี่ยนเป็นดู `done` อย่างเดียว (ตรงกับเหตุผลของพี่ว่าการจบทริปจะผูกกับรีวิว) · mock `tripIsOver` [mock/repo.ts:277](../apps/web/lib/data/mock/repo.ts#L277) ต้องทำตาม
- แจ้งเตือน: รอบนี้ให้การ์ดขึ้นตอนเปิดแอป · push ไป LINE ต้องมี scheduler ซึ่งยังไม่มี (ทำทีหลัง)
**Impact:**
- **O-3:** ทริปที่เลยวันกลับไปแล้วแต่ยังไม่ `done` จะเข้า `awaiting_end` ทันทีที่ขึ้นระบบ · รีวิวของทริปพวกนี้จะปิดจนกว่าหัวห้องจะกดจบ
- โควตาทริปฟรีนับ `status<>done` เหมือนเดิม → ทริปที่ยังไม่กดจบกินโควตา ซึ่งไปทางเดียวกับหน้าชนลิมิตที่มีปุ่มปิดทริปอยู่แล้ว

---

## 5. เฟส 4 — สายหลักฐานของแต้มและรายได้ (F12 · ต้องเสร็จก่อนเฟส 5)

### ของจริงวันนี้ — จุดที่สายหลักฐานขาด
| # | จุด | ที่ไหน |
|---|---|---|
| 1 | ลบทริปคือลบแถว `trips` แถวเดียว ไม่มี FK ไม่มี soft delete ลูกๆ ที่อ้าง `trip_id` จึงชี้ไปหาของที่ไม่มีอยู่ | [trip.store.go:54-56](../apps/api/pkg/store/trip/trip.store.go#L54) · [trip.handler.go:440-445](../apps/api/pkg/handlers/api/trip.handler.go#L440) · [base.go:13](../apps/api/pkg/models/base.go#L13) |
| 2 | ลบการจองคือลบแถวจริง | [booking.handler.go:196](../apps/api/pkg/handlers/api/booking.handler.go#L196) |
| 3 | `user_points` มี `user_id, delta, reason, note, trip_id` เท่านั้น ไม่มี booking/click/ผู้ทำ/ต้นทาง | [points.go:27-35](../apps/api/pkg/models/points.go#L27) |
| 4 | `trip_id` ในแถวแต้มหมายถึงคนละอย่างตามเหตุ: clone = ทริปต้นทาง · booking = ทริปของคนที่คัดลอก · referral = ทริปที่ถูกชวน | [trip.handler.go:538-542](../apps/api/pkg/handlers/api/trip.handler.go#L538) · [booking.handler.go:325-330](../apps/api/pkg/handlers/api/booking.handler.go#L325) · [member.handler.go:143-147](../apps/api/pkg/handlers/api/member.handler.go#L143) |
| 5 | `creator_earnings` เกิดเป็น `pending` แต่**ไม่มีโค้ดไหนเปลี่ยนเป็น `payable`** รายงานจ่ายเงินจึงว่างตลอด | [reward.handler.go:343](../apps/api/pkg/handlers/api/reward.handler.go#L343) · [reward.store.go:121-151](../apps/api/pkg/store/reward/reward.store.go#L121) |
| 6 | webhook ยกเลิกการจอง "รับรู้แต่ไม่ทำอะไร" ไม่มีการเรียกแต้มหรือเงินคืน | [booking.handler.go:300-303](../apps/api/pkg/handlers/api/booking.handler.go#L300) |
| 7 | สถานะรายได้ถูก UPDATE ทับ (pending→paid) ไม่มีประวัติว่าใครเปลี่ยน | [reward.store.go:149-151](../apps/api/pkg/store/reward/reward.store.go#L149) |
| 8 | ไม่มี audit log ฝั่งแอดมิน (แผนใน phase-5 A26.1 ยังไม่ทำ) | [phase-5-admin.md](phase-5-admin.md) |

### แก้ (D-17 – D-20)
1. **ตาราง `value_sources`** (เขียนเพิ่มได้อย่างเดียว) หนึ่งแถวต่อเหตุการณ์จริงหนึ่งครั้งที่อาจทำให้เกิดแต้มหรือเงิน
   `id · kind` (`publish` · `clone` · `booking_click` · `partner_confirmed` · `partner_cancelled` · `partner_paid` · `referral_join` · `trip_pass_purchase` · `admin_adjustment` · `legacy`) `· parent_id` (ขั้นก่อนหน้า) `· actor_user_id · subject_type · subject_id · snapshot JSON · occurred_at · created_at`
   **snapshot (D-17)** = ใคร (id + ชื่อที่แสดง ณ ตอนนั้น) · อะไร (ชื่อทริป/แพลน, พาร์ตเนอร์, tracking id) · เท่าไหร่ (ยอดจอง, ค่าคอม, %) · เมื่อไหร่ → ต่อให้ต้นทางถูกเก็บเข้าคลังหรือเปลี่ยนชื่อ ก็ยังอ่านออก
   ตัวอย่างสาย: `partner_confirmed` → parent `booking_click` → parent `clone` (snapshot: แพลน A ชื่อ "โตเกียว 5 วัน" ของ @a)
2. **ledger ชี้กลับหาต้นทาง:** `user_points` + `source_id` (บังคับสำหรับแถวใหม่), `reverses_id`, `actor_id` · `creator_earnings` + `source_id`, `reverses_id` · สถานะรายได้ย้ายไปเก็บที่ `earning_events` (pending → payable → in_payout → paid → reversed พร้อมผู้ทำและเหตุผล) คอลัมน์ `status` เดิมยังอัปเดตใน transaction เดียวกันเพื่อให้ query เร็ว แต่แถว event คือหลักฐาน
3. **เขียนเพิ่มอย่างเดียวในระดับโค้ด (D-19):** interface ของ store `PointsStore` / `EarningStore` / `ValueSourceStore` มีแค่ `Insert` · เปลี่ยนสถานะได้ผ่านเมธอดเดียวที่เขียน event ด้วย · **go test ที่อ่าน AST** จะ fail ถ้ามี `.Delete(` / `.Save(` / `.Updates(` กับ model ของ ledger นอกเมธอดที่อนุญาต
4. **ห้ามลบของที่ผูกกับเงิน (D-18):** `trips.archived_at/archived_by` · `DELETE /trips/:id` ถ้ามี `value_sources` อ้างถึง (ไม่ว่าเป็นต้นทางหรือปลายทาง) ให้ตอบ 409 `{ archivable: true }` → เว็บเปิดกล่อง "ทริปนี้เคยทำให้เกิดแต้มหรือรายได้ ลบไม่ได้ เก็บเข้าคลังแทน" · การจองที่ผูกกับ click/confirmation ก็ใช้กฎเดียวกัน · เลิกเปิดสาธารณะได้ แต่ลบไม่ได้ · ของที่ไม่ผูกเงิน (รายการในแพลน ที่อยากไป ค่าใช้จ่าย) ยังลบได้ตามเดิม
5. **หน้าไล่ที่มาของแอดมิน:** `GET /admin/trace/:type/:id` ไล่ขึ้นไปถึงต้นทาง และลงไปหาทุกอย่างที่เกิดจากมัน · หน้า `/admin/trace` ค้นได้จาก ผู้ใช้ / แถวแต้ม / รายได้ / การจอง / tracking id · แสดงเป็น timeline ของ snapshot พร้อมป้าย "เก็บเข้าคลังแล้ว" / "ข้อมูลก่อนมีระบบหลักฐาน"
6. **แอดมินแก้ยอด (D-20):** `POST /admin/ledger/adjust` → สร้าง `value_sources(kind=admin_adjustment, parent=รายการที่แก้)` + แถวกลับรายการ · บังคับกรอกเหตุผล · ตาราง `admin_audit_logs` (actor, action, target, before/after, ip, at) ขึ้นพร้อมกัน
7. **ยกเลิกการจอง:** webhook `cancelled` → แถวติดลบของแต้มและรายได้ ที่มี parent เป็น confirmation เดิม · ถ้าโอนไปแล้ว → O-7
8. **backfill:** สร้าง `value_sources(kind=legacy)` ให้แถวแต้มและรายได้ที่มีอยู่ ดึง snapshot จาก `note` และชื่อทริป (ถ้าทริปยังอยู่) · หน้า trace ต้องบอกตรงๆ ว่าข้อมูลเก่าไม่ครบ ของที่ลบไปแล้วเอาคืนไม่ได้

**Impact:** migration 4–5 ตาราง/คอลัมน์ + backfill · handler ทุกจุดที่ให้แต้มหรือรายได้ (publish, clone ×2 ทาง, referral, webhook) · หน้า `/points` และการ์ดรายได้ของผู้ใช้อ่านได้เหมือนเดิม (เพิ่มแค่ "มาจากไหน") · หน้าแอดมินใหม่ 2 หน้า · go test: สายตั้งแต่ clone → click → confirm ต้องไล่จากแถวแต้มถึง snapshot ของแพลนต้นทางได้ · ลบแล้วต้องได้ 409 · archive แล้ว trace ยังเจอ

---

## 6. เฟส 5 — ถอนรายได้ · ยืนยันตัวตน · กันโกง (F11)

**ต้นตอ:** `GET|POST /admin/payouts` คิดยอดรายเดือน [payout.handler.go:20-22, 58](../apps/api/pkg/handlers/api/payout.handler.go#L58) · `payouts` ไม่มีบัญชีรับเงิน ไม่มีเลขอ้างอิงการโอน ไม่มี KYC [partner.go:95](../apps/api/pkg/models/partner.go#L95) · หน้าแอดมินจ่ายเงินยังไม่มี (phase-5 W27.4) · รายได้ไม่เคยเป็น `payable` (§5 ข้อ 5)

**แก้:**
- **วงจรรายได้:** `pending` (พาร์ตเนอร์ยืนยันการจอง) → `payable` (แอดมินกระทบยอดกับใบแจ้งยอดของพาร์ตเนอร์ แล้วบันทึก `value_sources(kind=partner_paid)` พร้อมเลขใบแจ้งยอด) → `in_payout` (ถูกนับเข้ารอบ) → `paid` (โอนแล้ว) | `reversed`
- **รอบปิดยอด (D-21):** ตาราง `payout_cycles(id, cutoff_date, original_cutoff, moved_by, moved_reason, due_date, status)` · สร้างรอบอัตโนมัติทุกวันอังคารเว้นอังคาร จากวันตั้งต้นที่ตั้งค่าได้ · แอดมินเลื่อน `cutoff_date` ได้**เฉพาะให้เร็วขึ้น** (ต้องกรอกเหตุผล) · `due_date` = cutoff + 3 วันทำการ (จันทร์–ศุกร์) · หน้าแอดมินแสดงรอบที่เลย due · ยอดต่ำกว่า ฿300 ([revenue.go](../apps/api/pkg/domain/revenue.go) `MinimumPayoutTHB`) ทบไปรอบหน้า
- **payout:** เพิ่ม `cycle_id`, snapshot บัญชีรับเงิน ณ วันโอน (ธนาคาร, เลขบัญชี 4 ตัวท้าย, ชื่อ), `transfer_ref`, ไฟล์สลิป, `paid_by` · แจ้งครีเอเตอร์ (notification kind ใหม่ `payout_paid`) · สำรอง `wht_percent` / `wht_amount` ไว้ **แต่ยังไม่ตั้งอัตรา** (O-8)
- **KYC (D-22, D-23):**
  - `creator_verifications`: `status` (draft · submitted · approved · rejected · revoked) · `legal_type` (individual · juristic) · ชื่อจริง · เลขบัตร/เลขผู้เสียภาษี (**เข้ารหัส + hash unique** เพื่อกัน 1 คนเปิดหลายบัญชี) · เบอร์โทร + `phone_verified_at` · อีเมล + `email_verified_at` · รูปบัตร (ปิดศาสนา/กรุ๊ปเลือด) · เซลฟี่คู่บัตร · `provider` (`manual` วันนี้ / ผู้ให้บริการ e-KYC ทีหลัง) · `provider_ref` · ผู้ตรวจ · เหตุผลที่ไม่ผ่าน
  - `payout_accounts`: bank | promptpay · เลขบัญชีเข้ารหัส + 4 ตัวท้าย · ชื่อบัญชี · แอดมินยืนยันว่าชื่อตรง · เปลี่ยนบัญชีต้องให้แอดมินยืนยันใหม่
  - flow ผู้ใช้ "เปิดรับรายได้" 4 ขั้น: ข้อมูลพื้นฐาน + OTP → เลขบัตร/ผู้เสียภาษี → รูปบัตร + เซลฟี่ → บัญชีรับเงิน
  - หน้าแอดมิน: คิว KYC เทียบบัตรกับเซลฟี่และชื่อบัตรกับชื่อบัญชี แล้วอนุมัติหรือไม่ผ่านพร้อมเหตุผล (เขียน audit)
- **กันโกง:** D-24 (เฟส 1) · เลขบัตรหนึ่งใบต่อหนึ่งบัญชีครีเอเตอร์ · บัญชีธนาคารเดียวกันถูกใช้หลาย user → ติดธงให้ตรวจ · ถอนได้เฉพาะเงินที่พาร์ตเนอร์จ่ายเราแล้ว (เท่ากับมี hold ในตัว) · ครีเอเตอร์กับผู้จองเป็นคนเดียวกัน → อยู่ใน PDF
- **หน้าผู้ใช้:** การ์ดรายได้เดิมเพิ่ม "รอบถัดไป อ. 29 ก.ย. · โอนภายใน 2 ต.ค." + ประวัติการโอนพร้อมเลขอ้างอิงและสลิป

**Impact:**
- ผู้ให้บริการใหม่: **SMS OTP** (มีค่าใช้จ่ายต่อข้อความ) · ภายหลังผู้ให้บริการ e-KYC
- **PDPA:** รูปบัตรและเซลฟี่ต้องอยู่ใน bucket แยกที่เข้ารหัส · signed URL อายุสั้น · เฉพาะแอดมินที่มีสิทธิ์ (ต้องตัดสิน D5.7 เรื่องระดับแอดมินก่อน) · ระยะเวลาเก็บ (O-9) · ต้องถามที่ปรึกษากฎหมาย (D5.6, D24.1 ที่ค้างอยู่)
- บัญชี/ภาษี: หัก ณ ที่จ่าย, ใบ 50 ทวิ, การรับรู้รายได้ (D6.9) → นักบัญชี
- ผู้ใช้ที่ login ด้วย LINE อาจไม่มีอีเมล → ต้องมี flow ยืนยันอีเมล

---

## 7. ลำดับงาน

| เฟส | งาน | ขึ้นกับ | ประมาณ |
|---|---|---|---|
| X-0 | Google project + key + ทดสอบรถไฟญี่ปุ่น · ตรวจเงื่อนไขการเก็บพิกัด | — | 0.5 วัน |
| 1 | F7 · F2 · F6 · F1 · D-24 | — | 4–6 วัน |
| 2 | F3 · F4 · F5 · F8 | X-0 (F4, F5) · F4 → F5 | 10–14 วัน |
| 3 | TripPhase · F9 · F10 | — (ทำคู่กับเฟส 2 ได้) | 6–8 วัน |
| 4 | F12 | — | 6–9 วัน |
| 5 | F11 | **เฟส 4** · ผลคุยกฎหมาย/บัญชี · session แยกเรื่องแต้ม/รายได้ (D-25) | 8–12 วัน |

เฟส 1–3 ส่ง UAT รอบถัดไปได้ · เฟส 4–5 เป็นงานหลังบ้านที่ผู้ทดสอบไม่เห็นในรอบนี้ ยกเว้นหน้าเปิดรับรายได้

---

## 8. คำถามที่ยังค้าง (เกิดจากคำตอบรอบนี้ — อย่าเดาแทน)

| # | คำถาม | กระทบ |
|---|---|---|
| ~~O-1~~ | ~~ขั้นที่เป็น "ตรวจดู" ควรมีปุ่ม "เรียบร้อยแล้ว" ไหม~~ → **ตอบแล้ว ดู D-26** (16 ก.ย. 2569) | F9 |
| ~~O-2~~ | ~~ทริปถึงวันเดินทางแล้วแต่ยังไม่กดพร้อม ควรเข้าโหมดวันเดินทางไหม~~ → **ตอบแล้ว ดู D-27** (16 ก.ย. 2569) | F9 |
| ~~O-3~~ | ~~ทริปเก่าเลยวันกลับไปนานแล้ว ให้ปิดอัตโนมัติไหม~~ → **ตอบแล้ว ดู D-28** (16 ก.ย. 2569 — จำนวนวันที่แน่นอนยังไม่ยืนยัน ใช้ 30 วันเป็นค่าเริ่มต้น) | F10 |
| O-4 | ช่วงรถไฟในญี่ปุ่นที่ Google ไม่ให้เส้นทาง: ใช้เส้นประ + "ประมาณ N นาที" + ปุ่มนำทางใน Google Maps ได้ไหม (ยืนยันหลัง X-0) | F4, F5 |
| ~~O-5~~ | ~~ทริปที่เก็บเข้าคลังกินโควตาฟรีไหม~~ → **ตอบแล้ว ดู D-34** (16 ก.ย. 2569) | F12 |
| ~~O-6~~ | ~~รายได้ของครีเอเตอร์ที่ยังไม่ยืนยันตัวตน~~ → **ตอบแล้ว ดู D-35** (16 ก.ย. 2569) | F11 |
| ~~O-7~~ | ~~ยกเลิกหลังโอนเงินแล้ว~~ → **ตอบแล้ว ดู D-36** (16 ก.ย. 2569) | F12 |
| O-8 | ภาษีหัก ณ ที่จ่าย / ใบ 50 ทวิ ของครีเอเตอร์บุคคลธรรมดา | F11 · นักบัญชี |
| O-9 | รูปบัตรและเซลฟี่เก็บนานแค่ไหน ใครเห็นได้บ้าง (ผูกกับ D5.6, D5.7) | F11 · กฎหมาย |
| O-10 | ผู้ใช้ขอลบบัญชีตาม PDPA ขัดกับ D-18 → ลบข้อมูลที่ระบุตัวตนแต่เก็บ snapshot ทางการเงินไว้ได้ไหม | F12 · กฎหมาย |
| O-11 | เงื่อนไข Google เรื่องระยะเวลาเก็บพิกัดที่ได้จาก Places (place_id เก็บถาวรได้) | F4 |

---

## 9. สิ่งที่เจอระหว่างไล่โค้ด (ไม่อยู่ใน 12 ข้อ แต่กระทบ)

- รายได้ครีเอเตอร์ไม่เคยเป็น `payable` → ต่อให้มีพาร์ตเนอร์จริง รายงานจ่ายเงินก็ว่าง (แก้ใน F11)
- webhook ไม่ทำอะไรกับการยกเลิก (แก้ใน F12 ข้อ 7)
- ติ๊ก "จองแล้ว" ออกแล้วติ๊กใหม่ได้แต้มและรายได้ซ้ำ (แก้ใน D-24)
- `.foot{position:fixed}` ในหน้าพิมพ์ของ API ทับบรรทัดท้ายของทุกหน้า (แก้ใน F3)
- `DateField` ไม่ตรวจค่าที่ parent ส่งเข้ามาใหม่ · ขาเที่ยวบินถูกเรียงใหม่แบบเงียบๆ (แก้ใน F1)
- Places / Directions / Distance Matrix ที่ใช้ใน `places.go` เป็น Legacy ของ Google แล้ว (แก้ใน F4)
- Photo Book พิมพ์ผ่านเบราว์เซอร์และอาจเจอปัญหาตัดหน้าแบบเดียวกับ F3 (รอบถัดไป)

---

## 10. แผน dev เฟส 4–5 (16 ก.ย. 2569 · หลังถาม 5 รอบ)

**Branch:** `feedback-4/phase-4` แตกจาก `feedback-4/phase-2` (`0f84937`) → `feedback-4/phase-5` แตกจาก phase-4
**ตัดสินเชิงเทคนิคเอง (ไม่ใช่ UX — ถ้าไม่ตรงใจแก้ได้):** ข้อที่ขึ้นต้น ⚙

### เฟส 4 — สายหลักฐาน (F12)

**4.1 ledger แกนกลาง (API)**
- `value_sources` (เขียนเพิ่มอย่างเดียว) ตาม §5 ข้อ 1 · kind เพิ่ม ⚙ `redeem` · `trip_pass_refund` · `booker_credit` · `earning_expired` เพื่อให้ทุกแถวแต้ม/เงิน/เครดิตมีต้นทาง
- `user_points` + `source_id` · `reverses_id` · `actor_id` · `creator_earnings` + `source_id` · `reverses_id` · `needs_review` · สถานะขยายเป็น `pending · payable · in_payout · paid · reversed · expired`
- `earning_events(earning_id, from, to, actor_id, reason, ref)` — ทุกการเปลี่ยนสถานะเขียน event ใน transaction เดียวกัน
- ⚙ `LedgerStore.Record(ctx, entry)` เขียน value_source + แถวแต้ม + แถวรายได้ใน transaction เดียว (วันนี้ทุกจุดเป็น `_ = s.points.Add(...)` แยกกัน ถ้าพังกลางทางจะได้หลักฐานครึ่งเดียว)
- store ของ ledger มีแค่ `Insert` / `Transition` · go test อ่าน AST ของ `pkg/store/**` fail ถ้าเจอ `.Delete(` `.Save(` `.Updates(` `.Update(` กับ model ledger นอกเมธอดที่อนุญาต

**4.2 กติกาใหม่ (D-30)**
- ตาราง `app_settings(key, value, updated_by)` · `creator_share_percent=15` · `booker_credit_percent=8` · แก้ได้จากหน้าแอดมิน (เขียน audit)
- `domain.SplitCommission` ตามสูตร §3.1: ⚙ AI = ฿6 ถ้าทริปมี Pass / ฿2 ถ้าไม่มี · gateway = 4% ของยอด Pass เฉพาะทริปที่ซื้อ Pass (ยังเป็นตัวเลขสมมติ A20.8) · เครดิตคืน Pass ครั้งเดียวต่อทริปเหมือนเดิม · ⚙ เครดิตคืนผู้จองออกเป็นโค้ดส่วนลดให้**คนที่กดลิงก์จอง** ถ้าต่ำกว่า ฿1 ไม่ออก
- ลบ `PointsPerBooking` · แต้มจากเปิดสาธารณะ/คัดลอก/ชวนเพื่อนคงเดิม

**4.3 webhook พาร์ตเนอร์**
- ⚙ `booking_clicks.booking_id` (ใหม่) เพื่อให้รู้ว่าคลิกมาจากการจองไหน · value_source `booking_click` เขียน**ตอนพาร์ตเนอร์ยืนยัน** (ไม่ใช่ทุกคลิก) → การจองที่แค่กดลิงก์ยังลบได้
- `confirmed` → `booking_click`(parent = `clone` ของทริปนั้นถ้ามี) → `partner_confirmed` → รายได้ครีเอเตอร์ + เครดิตคืน Pass + เครดิตคืนผู้จอง ชี้ `source_id` มาที่ `partner_confirmed`
- `cancelled` → `partner_cancelled` · รายได้ที่ยังไม่โอน → `reversed` · โอนแล้ว → `needs_review` ขึ้นธง (D-36) · โค้ดเครดิตที่ยังไม่ถูกใช้ → ⚙ `discount_codes.voided_at` · ถูกใช้แล้ว → ขึ้นธงเหมือนกัน

**4.4 เก็บเข้าคลังแทนลบ (D-18, D-31–D-34, D-41)**
- `trips.archived_at/archived_by` · `POST /trips/:id/archive` · `POST /trips/:id/restore` (เจ้าของ) · `DELETE /trips/:id` ได้เฉพาะทริปในคลังที่ไม่มี value_source อ้างถึง ไม่งั้น 409 `{archivable:true}`
- archive → ปิดสาธารณะ · หายจากรายการทริป/หน้าแรก/explore/โควตา · `GET /me/archive` คืนรายการพร้อม `can_delete` · ⚙ สมาชิกคนอื่นก็ไม่เห็นทริปนั้นจนกว่าเจ้าของกู้คืน
- `bookings.archived_at/archived_by` · DELETE การจองที่มี click ยืนยันแล้ว → 409 `{archivable:true}` · `POST .../archive` · `POST .../restore` · list ซ่อนที่เก็บไว้ ส่ง `archived_count`

**4.5 แอดมิน**
- `GET /admin/trace?type=&id=` (user · points · earning · booking · tracking id · trip) คืน timeline ขึ้นหาต้นทางและลงหาลูก
- `POST /admin/ledger/adjust` (เหตุผล + อ้างอิง) → `admin_adjustment` + แถวกลับรายการ
- `admin_audit_logs(actor, action, target_type, target_id, before, after, ip, at)` · เขียนจากทุก action แอดมินที่แตะเงิน/สิทธิ์
- `GET/PUT /admin/settings/economy`
- ⚙ แอดมินยังมีระดับเดียว (`role=admin`) จนกว่าจะตัด D5.7

**4.6 backfill** — migration สร้าง `value_sources(kind=legacy)` ให้ทุกแถวแต้ม/รายได้เดิม snapshot จาก `note` + ชื่อทริป (ถ้ายังอยู่)

**4.7 web (mock + live)**
- ตั้งค่าทริป: ปุ่ม "เก็บเข้าคลัง" (เจ้าของ) · โปรไฟล์: "คลังทริป" กู้คืน / ลบถาวร (เฉพาะ `can_delete`)
- หน้าการจอง: ปุ่มลบ → "เก็บเข้าคลัง" เมื่อผูกเงิน · ลิงก์ "เก็บเข้าคลัง (N)"
- ประวัติแต้ม: บอก "มาจากไหน" จาก snapshot
- แอดมิน: `/admin/trace` · `/admin/economy` (s, α)

### เฟส 5 — ถอนรายได้ · ยืนยันตัวตน (F11)

**5.1 วงจรรายได้** `pending` → `payable` (แอดมินกระทบยอดกับใบแจ้งยอดพาร์ตเนอร์ `POST /admin/earnings/reconcile` → value_source `partner_paid` + เลขใบแจ้งยอด) → `in_payout` → `paid` | `reversed` | `expired`

**5.2 รอบปิดยอด (D-21, D-40)**
- `payout_cycles` ตาม §6 · ไม่มีรอบจนแอดมินตั้งวันอังคารตั้งต้น · ⚙ ไม่มี scheduler: สร้างรอบถัดไปตอนเปิดหน้าแอดมิน/หน้ารายได้ (แบบเดียวกับ D-28)
- ปิดรอบ → ครีเอเตอร์ที่ยืนยันตัวตนแล้ว + ยอด payable ≥ ฿300 ได้ `payouts` (snapshot บัญชี) · รายได้ → `in_payout` · ต่ำกว่าขั้นต่ำหรือยังไม่ยืนยันตัวตน ทบรอบหน้า
- บันทึกโอน: `transfer_ref` + สลิป + `paid_by` → รายได้ `paid` · แจ้ง `payout_paid` ในแอป (D-42) · `wht_percent/wht_amount` ว่าง (O-8)

**5.3 ยืนยันตัวตน (D-22, D-23, D-37–D-39)**
- `creator_verifications` + `payout_accounts` ตาม §6 · ⚙ เลขบัตร/ผู้เสียภาษี/เลขบัญชีเข้ารหัส AES-GCM ด้วย `KYC_ENCRYPTION_KEY` + HMAC hash สำหรับ unique · รูปบัตร/เซลฟี่/สลิปอยู่ bucket `kyc` แยก · แอดมินเปิดดูผ่าน URL อายุ ⚙ 10 นาที
- ⚙ OTP: interface `sms.Service` · ตัว stub ไม่ส่งจริง ตอบรหัสกลับมาใน response เฉพาะ non-production · อีเมล: ถ้า login Google ถือว่ายืนยันแล้ว ไม่งั้นส่งรหัสผ่าน email service ที่มีอยู่
- flow 4 ขั้นใน `/me/verify` · บันทึกร่างทีละขั้น · ส่งตรวจ → คิวแอดมิน `/admin/kyc` เทียบบัตร/เซลฟี่/ชื่อบัญชี → อนุมัติ หรือไม่ผ่านพร้อมเลือกขั้นและเหตุผล → ผู้ใช้แก้เฉพาะขั้นนั้น
- ผ่าน → `users.verified_at` → ป้าย "ยืนยันตัวตนแล้ว" ใน DTO ของ me · creator · public trip · explore card
- ⚙ เปลี่ยนบัญชีรับเงิน: ป้ายยังอยู่ (ตัวตนไม่เปลี่ยน) แต่บัญชีใหม่ต้องให้แอดมินยืนยันก่อนเข้ารอบ

**5.4 เก็บรอ 180 วัน (D-35)** — รายได้ของคนที่ยังไม่ยืนยันตัวตนไม่เข้ารอบ · อายุเกิน 180 วัน → `expired` + value_source `earning_expired` · เหลือ ≤ 14 วัน → แจ้งเตือนในแอปครั้งเดียว · ⚙ ทำตอนเปิดหน้ารายได้/หน้าแอดมินรอบจ่าย (ไม่มี scheduler)

**5.5 กันโกง** — hash เลขบัตรซ้ำกับบัญชีอื่น → ส่งตรวจไม่ได้ · บัญชีธนาคารเดียวกันหลาย user → ธงในคิวแอดมิน · ถอนได้เฉพาะ `payable` (พาร์ตเนอร์จ่ายเราแล้ว)

**5.6 web** — โปรไฟล์: การ์ด "เปิดรับรายได้"/ป้าย · `/me/verify` 4 ขั้น (ภาพตัวอย่างปิดบัตร D-38) · การ์ดรายได้: รอบถัดไป · โอนภายใน · ประวัติโอน + เลขอ้างอิง + สลิป · รายได้ที่รอยืนยันตัวตน + วันหมดอายุ · ป้ายใน /u/ /p/ explore · แอดมิน `/admin/kyc` · `/admin/payouts` (รอบ · กระทบยอด · บันทึกโอน · ธง)

### ยังค้าง (ใช้ค่าชั่วคราว ต้องกลับมาตัดสิน)
O-8 อัตราหัก ณ ที่จ่าย · O-9 ระยะเก็บรูปบัตร (ยังไม่ลบอัตโนมัติ) · O-10 PDPA ลบบัญชี · D5.7 ระดับแอดมิน · ผู้ให้บริการ SMS จริง · ตัวเลข gateway 4% (A20.8)

### สิ่งที่ทำต่างจากแผน / เจอระหว่างทำ (16 ก.ย. 2569)
- **เจอรูเดิม:** กดเปิดสาธารณะ → ปิด → เปิดใหม่ ได้แต้ม 500 ซ้ำทุกครั้ง (เพราะปิดสาธารณะล้าง slug) → แก้ให้ได้เฉพาะครั้งแรกที่เคยเปิด (`published_at`)
- ⚙ ประวัติแต้ม "มาจากไหน": ไม่ต้องเพิ่ม — ทริปที่ผูกแต้มลบไม่ได้แล้ว ชื่อทริปจึงอ่านได้เสมอ snapshot ดูได้ในหน้า trace ของแอดมิน
- ⚙ ยกเลิกการจองที่ **เคยได้เครดิตคืน Trip Pass**: โค้ดเครดิตที่ยังไม่ใช้ถูก void แต่ Pass ยังนับว่าคืนแล้ว (การจองครั้งถัดไปของทริปเดียวกันจะไม่ได้เครดิตคืนอีก) — ถ้าต้องการให้คืนใหม่ได้ต้องตัดสินเพิ่ม
- ⚙ รายงานจ่ายเงินแบบรายเดือนเดิม (`GET/POST /admin/payouts?month=`) ถูกแทนที่ด้วยรอบปิดยอดทั้งหมด
- ⚙ แอดมินเห็นเลขบัญชีเต็มเฉพาะรายการโอนที่ยังค้างจ่าย · การเปิดดูคำขอ KYC ทุกครั้งเขียน audit `kyc.view`
- env ใหม่: `KYC_ENCRYPTION_KEY` (บังคับใน production) · `R2_KYC_BUCKET`
