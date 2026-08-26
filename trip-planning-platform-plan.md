# แผนสร้าง Platform "วางแพลนเที่ยวร่วมกัน + ต่อยอดสู่การจอง"

> เอกสารฉบับนี้เขียนจากการถอด "สิ่งที่คุณทำมือด้วย AI" ในไฟล์ `index.html` (Japan Winter Trip 2026 – 2 Plans Comparison) ออกมาเป็นระบบที่ใครก็ทำซ้ำได้ เน้น **Product/Feature ก่อน** ส่วน Business Model วางโครงไว้ให้ต่อยอด

---

## 0. สรุปย่อ (อ่าน 2 นาที)

**ปัญหาที่แก้:** คนจองตั๋วได้แล้วแต่ "ไม่รู้จะเริ่มแพลนตรงไหน" โดยเฉพาะทริปกลุ่มที่มีทั้งคนเคยไป/ไม่เคยไป ความต้องการต่างกัน และไม่มีที่กลางให้ทุกคนดูแพลนพร้อมกัน

**สิ่งที่คุณทำมือแล้วได้ผล (และต้องกลายเป็นฟีเจอร์):**

| สิ่งที่ทำมือใน index.html | กลายเป็นฟีเจอร์อะไร |
|---|---|
| ระบุ flight NH808/NH807 + วันที่ 4–10 ธ.ค. | **Trip Frame** – กรอบทริป (วัน/เวลาบิน/สนามบิน) เป็นจุดตั้งต้น |
| Wishlist ของแต่ละคน (เนอร์ส-แคท อยาก Disney, เช็คอยาก Road trip, คอมอยากพิพิธภัณฑ์) | **Member Wishlist & Preferences** – ทุกคนใส่ความต้องการเอง แล้ว AI จับคู่ลงแพลน |
| ทำ 2 แผนเทียบกัน (Asakusa vs Yokohama) พร้อมตารางเกณฑ์ | **Plan Variants & Compare** – แตกแพลนเป็นหลายเวอร์ชันแล้วเทียบข้างกัน |
| ตารางงบแยกหมวด แปลง JPY→THB เฉลี่ยต่อคน | **Budget Engine** – คิดงบอัตโนมัติจากรายการในแพลน |
| Timeline รายวันรายชั่วโมง | **Itinerary Timeline** – ตารางเวลาแบบลาก-วาง |
| "เหตุผลที่ตัด Imperial Palace / ย้าย Takeshita มาบ่าย" | **AI Rationale Log** – AI อธิบายว่าทำไมจัดแบบนี้ (สร้างความเชื่อใจให้กลุ่ม) |
| Packing list, อากาศ, ใบขับขี่สากล, ETC card | **Practical Info Blocks** – ข้อมูลเตรียมตัวที่ผูกกับปลายทาง/ฤดู |
| ส่ง HTML ให้ทุกคนดูร่วมกัน | **Share / Publish** – ลิงก์เดียวดูได้ทุกคน + เปิด public เป็นคอมมู |

**Core loop ของ platform:** เริ่มจากอะไรก็ได้ (วัน / เมือง / งบ) → สร้างห้องทริป → ทุกคนใส่ wishlist → AI ร่างแพลน (หลายเวอร์ชัน) → กลุ่มแก้/โหวต/คอมเมนต์ร่วมกัน → ได้แพลนสุดท้ายพร้อมงบ → **กดจองผ่านลิงก์ affiliate ในแพลน** → เปิดเป็น public ให้คนอื่นเอาไป "clone" ตาม

**รายได้:** ผู้ใช้ฟรี 100% รายได้จาก affiliate ของรายการที่จองผ่านแพลน (โรงแรม / ตั๋วสถานที่ / รถเช่า / eSIM / ประกัน / ทัวร์) แล้วค่อยขยายไป creator tools, B2B agent, premium

---

## 1. Product Vision & หลักคิด

### 1.1 One-liner
> "Google Docs สำหรับแพลนเที่ยว ที่มี AI เป็นเพื่อนร่วมทริป และเปิดให้คนอื่นเที่ยวตามได้"

### 1.2 หลักการออกแบบ (Design Principles)
1. **เริ่มได้จากทุกมุม** – ไม่บังคับให้รู้ทุกอย่างก่อน (วัน/เมือง/งบ/แพลนคนอื่น อันไหนก็เริ่มได้)
2. **ทุกคนในทริปมีเสียง** – wishlist ต่อคน ไม่ใช่คนเดียวจัดให้ทั้งกลุ่ม
3. **AI ร่าง คนตัดสิน** – AI เสนอทางเลือกและเหตุผล กลุ่มโหวต/แก้ ไม่ใช่ AI ตัดสินแทน
4. **แพลน = สิ่งที่มีชีวิต** – แก้ได้ตลอด แตกเวอร์ชันได้ เทียบได้ งบขยับตาม
5. **แพลนสวยและแชร์ได้ทันที** – แชร์ 1 ลิงก์ ดูบนมือถือได้ ไม่ต้องสมัคร (เหมือน index.html ที่ทำ)
6. **จองในที่เดียวกับที่แพลน** – รายการในแพลนคือปุ่มจองในตัว (นี่คือจุดที่ affiliate ทำงาน)

### 1.3 อะไรที่ "ไม่ทำ" ในระยะแรก
- ไม่ทำระบบจอง/ชำระเงินเอง (ส่งต่อ partner ผ่าน affiliate)
- ไม่ทำแอปมือถือ native (ทำ web ที่ responsive + PWA)
- ไม่ทำทุกประเทศ – เริ่มญี่ปุ่นก่อน (คุณมีข้อมูล ตลาดคนไทยใหญ่ที่สุด อินฟลูฯ ของคุณสายนี้)

---

## 2. ผู้ใช้ (Personas) และ Job-to-be-done

| Persona | สถานการณ์ | ต้องการ | ปัญหาตอนนี้ |
|---|---|---|---|
| **Trip Organizer** (คุณ) | จองตั๋วแล้ว ต้องแพลนให้ 4 คน | เครื่องมือรวมความต้องการทุกคน สรุปเป็นแพลน+งบ | ทำมือใน AI chat แล้วส่ง HTML ไปมา แก้ยาก |
| **Group Member – เคยไปแล้ว** | มีที่อยากไปเจาะจง (Slam Dunk, Road trip) | ใส่ความต้องการแล้วเห็นว่า "ได้ลง" | ต้องพูดในกลุ่ม LINE แล้วหาย |
| **Group Member – มือใหม่** | ไม่รู้อะไรเลย อยากเก็บแลนด์มาร์ค | เห็นภาพรวม + งบต่อคน + เตรียมตัวยังไง | กลัวถามเยอะ ตามคนอื่น |
| **Follower ของอินฟลูฯ** | เห็นคลิป อยากไปตาม | ขอแพลน+งบเป๊ะๆ เอาไปใช้ได้เลย | ต้องถาม DM ทีละคน |
| **Travel Creator / Influencer** | ถูกถามแพลนซ้ำๆ | ปล่อยแพลนที่ตอบเองครั้งเดียว + ได้รายได้เมื่อคนจองตาม | ไม่มี format ที่แชร์แล้วสวยและจองต่อได้ |
| **(อนาคต) Travel Agent** | รับแพลนกลุ่มไปจัดต่อ | รับ lead ที่แพลนชัดแล้ว | ลูกค้ามาแบบไม่ชัด ต้องคุยนาน |

---

## 3. User Journey หลัก (End-to-end)

```
[Entry]  วันที่ว่าง / เมืองที่อยาก / งบ / เห็นแพลนคนอื่น
   │
   ▼
[1] สร้าง Trip Room  ─ ใส่ Trip Frame (วันไป-กลับ, สนามบิน/เที่ยวบินถ้ามี, จำนวนคน)
   │
   ▼
[2] ชวนสมาชิก  ─ ลิงก์เชิญ → แต่ละคนใส่ Wishlist + ข้อจำกัด (เดินได้แค่ไหน, งบ, แพ้อาหาร, เคยไปยัง)
   │
   ▼
[3] AI Draft  ─ AI อ่าน Frame + Wishlist ทั้งหมด → ร่าง 1–3 Plan Variants + Budget + เหตุผล
   │
   ▼
[4] Co-edit  ─ Timeline ลาก-วาง / เพิ่ม-ตัดสถานที่ / คอมเมนต์ / โหวต / ถาม AI ต่อ ("ย้าย Harajuku มาบ่ายให้หน่อย")
   │
   ▼
[5] Decide  ─ โหวตเลือก Variant → Freeze เป็น Final Plan (ยังแก้ได้แต่มี version)
   │
   ▼
[6] Book  ─ รายการในแพลนขึ้นปุ่ม "จอง" (โรงแรม/ตั๋ว/รถเช่า/eSIM/ประกัน) → ออกไป partner พร้อม tracking → กลับมาติ๊ก "จองแล้ว"
   │
   ▼
[7] Go & Share  ─ โหมดดูระหว่างเที่ยว (offline-ish, วันนี้เที่ยวไหน) → จบทริปเปิด Public + ใส่งบจริง/รีวิว
   │
   ▼
[8] Community  ─ คนอื่นค้นเจอ → Clone แพลนไปเป็นทริปตัวเอง (กลับไปข้อ 1)
```

---

## 4. รายละเอียดฟีเจอร์ (Feature Spec) แยกเป็น Module

แต่ละ module ระบุ **จุดประสงค์ / ฟังก์ชันย่อย / เกณฑ์ว่าเสร็จ (Acceptance) / อยู่ Phase ไหน**

### M1. Entry Points – "เริ่มจากอะไรก็ได้"
**จุดประสงค์:** ลดกำแพงตอนเริ่ม ให้เข้ามาได้จากข้อมูลชิ้นเดียวที่มี

| ทางเข้า | ผู้ใช้กรอก | ระบบทำอะไร |
|---|---|---|
| **เริ่มจากวัน** | วันไป-กลับ (หรือ "ประมาณช่วง ธ.ค.") | แนะนำเมือง/ฤดูที่เหมาะ + แพลน public ที่ตรงช่วงเวลานั้น |
| **เริ่มจากเมือง** | ปลายทาง (Tokyo, Osaka, Hokkaido…) | แนะนำจำนวนวันที่เหมาะ + แพลน public ยอดนิยมของเมืองนั้น |
| **เริ่มจากงบ** | งบต่อคน + จำนวนคน | แสดงเมือง/รูปแบบทริปที่อยู่ในงบ + แพลน public ที่งบใกล้เคียง |
| **เริ่มจากแพลนคนอื่น** | กด Clone จาก public plan | สร้าง Trip Room ที่มีแพลนต้นแบบให้แก้ต่อ |
| **เริ่มจากตั๋วที่จองแล้ว** (เคสคุณ) | วางเที่ยวบิน / paste ข้อความยืนยันตั๋ว | AI ดึงวัน-สนามบิน-เวลาถึง ออกมาเป็น Trip Frame อัตโนมัติ |

- **Acceptance:** จากทุกทางเข้า ภายใน 3 คลิกต้องได้ Trip Room ที่มี Trip Frame อย่างน้อยครึ่งเดียว
- **Phase:** MVP ทำ "เริ่มจากวัน + เมือง + จากตั๋ว" ก่อน / "เริ่มจากงบ + clone" ตามมาใน V1

### M2. Trip Room (พื้นที่กลางของทริป)
**จุดประสงค์:** ทุกอย่างของทริปอยู่ที่เดียว มี URL เดียว

- Trip Frame: ชื่อทริป, วันไป-กลับ, เที่ยวบิน (ขาไป-กลับ, เวลาถึง/ออก), สนามบิน, จำนวนคน, สกุลเงินหลัก
- Member list + บทบาท (Owner / Editor / Viewer)
- Tabs: **Overview | Wishlist | Plans | Budget | Prep | Bookings | Discussion**
- Activity feed: ใครแก้อะไร เมื่อไหร่ (สำคัญมากในงานกลุ่ม)
- **Acceptance:** สมาชิกเปิดลิงก์แล้วเห็นสถานะล่าสุดโดยไม่ต้องรีเฟรช (realtime)
- **Phase:** MVP

### M3. Member Wishlist & Constraints (หัวใจของ "ทุกคนมีเสียง")
**จุดประสงค์:** เก็บความต้องการเป็นรายคน โครงสร้างชัด เพื่อให้ AI ใช้ได้และกลุ่มเห็นว่า "ของฉันได้ลงแพลนไหม"

แต่ละคนกรอก (ทำเป็นฟอร์มสั้น + ให้พิมพ์อิสระได้):
- **Must-do** (ต้องได้) / **Nice-to-have** (ถ้าได้ก็ดี) / **Avoid** (ไม่เอา)
- เคยไปประเทศ/เมืองนี้ไหม (มือใหม่ → AI จะดันแลนด์มาร์คให้)
- Pace: ชิลล์ / กลาง / อัด
- ข้อจำกัด: เดินไหว/ไม่ไหว, มีเด็ก/ผู้สูงอายุ, แพ้อาหาร, ตื่นเช้าได้ไหม, ขับรถได้ไหม (มี IDP ไหม)
- งบที่รับได้ต่อคน (ช่วง)
- Vibe/แท็ก: กิน / ช้อป / ธรรมชาติ / อนิเมะ / ศิลปะ / สวนสนุก / ออนเซ็น / คาเฟ่ ฯลฯ

ฟีเจอร์เสริม:
- **Wishlist Coverage Board** – ตารางเหมือนใน index.html: "เนอร์ส & แคท: อยาก Disney 2 วัน → ✅ Day 1-2" ระบบเช็คอัตโนมัติว่า item ไหนถูกใส่ลงแพลนแล้ว/ยัง (นี่คือ feature เด่นที่คู่แข่งไม่มี)
- **Conflict Detector** – ถ้า must-do ชนกัน (คนหนึ่งอยากอัด อีกคนอยากชิลล์) AI ชี้ให้เห็นก่อนร่าง
- **Acceptance:** ทุก must-do ต้องมีสถานะ ✅ ลงแล้ว / ⚠️ ลงบางส่วน / ❌ ยังไม่ลง พร้อมเหตุผล
- **Phase:** MVP (ฟอร์ม + coverage board) / Conflict detector ใน V1

### M4. AI Planner (ตัวร่างแพลน)
**จุดประสงค์:** ทำสิ่งที่คุณทำมือใน chat ให้เป็นระบบ ทำซ้ำได้ อธิบายได้ ไม่มั่ว

**Input ที่ AI ได้รับทุกครั้ง:** Trip Frame + Wishlist ทุกคน + Constraint + Plan ปัจจุบัน (ถ้ามี) + ฐานข้อมูลสถานที่ (POI DB) + กฎเมือง (เวลาเปิด-ปิด, โซนที่อยู่ใกล้กัน, เวลาเดินทางระหว่างโซน)

**Output ที่ AI ต้องส่งกลับ (structured JSON ไม่ใช่ข้อความลอย):**
1. Plan Variants 1–3 แบบ (ต่างกันที่ "จุดตัดสินใจหลัก" เช่น base hotel, ขับรถ vs รถไฟ, ชิลล์ vs อัด)
2. Day-by-day timeline: เวลา / สถานที่ (อ้างอิง POI id) / โน้ต / เวลาเดินทางโดยประมาณ / วิธีไป
3. Budget estimate รายหมวด (จาก item ในแพลน)
4. **Rationale log** – "ทำไมตัด X", "ทำไมย้าย Y ไปบ่าย" (สิ่งที่คุณเขียนในหัวข้อ ⚠️ เหตุผลการปรับเปลี่ยน)
5. Wishlist coverage mapping – must-do ของใครอยู่วันไหน
6. Open questions – อะไรที่ AI ไม่แน่ใจต้องให้กลุ่มตอบ (เช่น "รับรถเช่าที่โตเกียวหรือโยโกฮาม่า?")

**การโต้ตอบหลังร่าง (Refinement chat ที่ผูกกับแพลน):**
- คำสั่งแบบ "ย้าย Takeshita มาบ่าย" / "ตัด Imperial Palace เพราะเดินเยอะ" / "หาโรงแรมห้องกว้างขึ้นใน Yokohama งบเท่าเดิม" → AI แก้เฉพาะจุดและอัปเดต rationale + budget
- ทุกการแก้โดย AI ต้องแสดง diff (ก่อน/หลัง) ให้กดยอมรับ/ปฏิเสธ

**กติกากันมั่ว (Guardrails):**
- สถานที่ทุกแห่งต้องอ้างอิงจาก POI DB หรือถูกติดป้าย "ยังไม่ยืนยัน" ให้ผู้ใช้เช็ค
- ราคาที่ AI ใส่ = "ประมาณการ" ติดป้ายเสมอ พร้อม range และแหล่งที่มา (จาก partner API ถ้าเชื่อมแล้ว)
- เวลาเปิด-ปิด / วันหยุด ดึงจากข้อมูล ไม่ให้ AI เดา
- **Acceptance:** ร่างแพลน 7 วันภายใน < 60 วิ, ทุก POI มี id หรือป้าย unverified, มี rationale อย่างน้อยเมื่อมีการตัด/ย้าย must-do
- **Phase:** MVP (ร่าง 1 variant + refine) / Multi-variant + conflict + auto-budget-from-partner ใน V1

### M5. Itinerary Editor (Timeline)
**จุดประสงค์:** ให้กลุ่มแก้เองได้โดยไม่ต้องผ่าน AI ทุกครั้ง

- มุมมอง: **Timeline รายวัน** (เหมือน index.html) / **แผนที่** (pin ตามวัน เห็นว่าเส้นทางย้อนไปมาไหม) / **List**
- ลาก-วางสถานที่ระหว่างช่วงเวลา/วัน, ปรับเวลา, ใส่โน้ตส่วนตัว/กลุ่ม
- เพิ่มสถานที่: ค้นจาก POI DB / วาง Google Maps link / พิมพ์ชื่อแล้ว AI จับคู่
- Item type: สถานที่ / ร้านอาหาร / ที่พัก / การเดินทาง (บัส, รถไฟ, รถเช่า) / เที่ยวบิน / อิสระ
- ตัวช่วยอัตโนมัติ: เตือนถ้าร้านปิดเวลานั้น, เตือนถ้าเดินทางไม่ทัน, คำนวณเวลาเดินทางระหว่างจุด
- Undo/History + Version snapshot ("Plan v3 – หลังโหวตวันที่ 20 ก.ย.")
- **Acceptance:** ลาก item ข้ามวันแล้ว budget/coverage/แผนที่ อัปเดตทันที
- **Phase:** MVP (timeline + list + เพิ่ม/ลบ/ลาก) / แผนที่ + auto-warning ใน V1

### M6. Plan Variants & Compare (จุดเด่นจาก index.html)
**จุดประสงค์:** เทียบ 2–3 แผนข้างกันแล้วโหวต

- Fork แพลนจากจุดใดก็ได้ ("Day 1-2 เหมือนกัน แตกต่างตั้งแต่ Day 3")
- หน้า Compare: ตารางเกณฑ์ (ราคา, ขนาดห้อง, เวลาเดินทางรวม, wishlist coverage, จำนวนจุดที่ได้ไป) + timeline คู่ขนาน + ให้ AI สรุป "ข้อดี-ข้อเสีย" ต่อแผน
- โหวต: 1 คน 1 เสียง / ให้เหตุผลได้ / ปิดโหวตแล้ว freeze
- **Acceptance:** สร้าง variant ใน 1 คลิก, compare อ่านได้บนมือถือ
- **Phase:** V1 (MVP มีแค่แพลนเดียว + version history)

### M7. Budget Engine
**จุดประสงค์:** งบขยับตามแพลนอัตโนมัติ ทุกคนเห็น "คนละเท่าไหร่"

- ทุก item มี cost (ต่อคน / ต่อกลุ่ม / ต่อคืน / ต่อคัน) + สกุลเงิน + สถานะ (ประมาณการ / ราคาจริง / จ่ายแล้ว)
- หมวดอัตโนมัติ: ตั๋วเครื่องบิน / ที่พัก / เดินทางในพื้นที่ / ตั๋วเข้าชม / อาหาร / ช้อป / อื่นๆ
- อัตราแลกเปลี่ยน: ตั้งค่าเอง หรือ auto-fetch (ติดป้ายวันที่ดึง)
- สรุป: รวมทั้งทริป / ต่อคน / ต่อวัน / เทียบระหว่าง variant / เทียบกับงบที่ตั้งไว้ (over/under)
- ระบบ "จ่ายล่วงหน้าแล้ว" (เช่น Disney package 95,000 ฿ ที่ซื้อแล้ว) แยกจากงบที่ยังต้องเตรียม
- (V2) หารค่าใช้จ่ายจริงหลังทริป / export CSV
- **Acceptance:** เพิ่ม/ลบ item แล้วตารางงบอัปเดตทันที, แสดง JPY+THB คู่กัน
- **Phase:** MVP (ประมาณการ + สรุปต่อคน) / เทียบ variant ใน V1 / หารจริงใน V2

### M8. Practical Info & Prep Blocks
**จุดประสงค์:** สิ่งที่คุณใส่ในแท็บ "การเตรียมตัว" และ "แผนขับรถ" ให้เป็นบล็อกอัตโนมัติ

- **Weather block** – ช่วงอุณหภูมิของเมือง+ช่วงวันเดินทาง (จากข้อมูลย้อนหลัง/พยากรณ์)
- **Packing list** – generate จากอากาศ + กิจกรรม (ออนเซ็น → ยูกาตะไม่ต้องเอาไป, ขับรถ → IDP) แชร์ให้ติ๊กร่วมกันได้
- **Rule blocks** – ผูกกับ item ในแพลน: เช่ารถ → บล็อกใบขับขี่สากล/ETC/ยางหน้าหนาว, ไป Disney → บล็อก Happy Entry/DPA, ต่างเมือง → บัตรรถไฟที่ควรซื้อ
- **Docs checklist** – พาสปอร์ต, Visit Japan Web, ประกัน, eSIM (ทุกอันเป็นจุดที่ใส่ affiliate ได้อย่างเป็นธรรมชาติ)
- **Acceptance:** เพิ่ม "รถเช่า" ลงแพลน แล้วบล็อกกฎขับรถโผล่เองในแท็บ Prep
- **Phase:** MVP (weather + packing แบบง่าย + checklist) / rule blocks ที่ผูก item ใน V1

### M9. Collaboration Layer
**จุดประสงค์:** ทำให้ "ดูร่วมกัน" กลายเป็น "ทำร่วมกัน"

- Realtime presence (ใครเปิดอยู่), คอมเมนต์ที่ item/วัน/แพลน, mention, emoji react
- โหวตย่อย ("ร้านปูร้าน A หรือ B?") ที่ item
- มอบหมายงาน ("เช็คจองรถเช่า" → เช็ค) + สถานะ
- แจ้งเตือน: LINE Notify / อีเมล / push (คนไทยใช้ LINE เป็นหลัก → ทำ LINE ก่อน)
- โหมด Viewer แบบไม่ต้องสมัคร (เหมือนเปิด HTML) แต่จะคอมเมนต์ต้องล็อกอิน (ทำ Login ด้วย LINE / Google)
- **Phase:** MVP (คอมเมนต์ + viewer link + LINE login) / presence, assign, notify ใน V1

### M10. Share, Export & Public Plans
**จุดประสงค์:** แพลนสวยแชร์ได้ในคลิกเดียว และเป็นประตูสู่คอมมู

- Share link แบบ private (ใครมีลิงก์ดูได้) / เฉพาะสมาชิก / **public**
- หน้า public: สวยแบบ index.html (hero, ภาพรวม, timeline, งบ, prep) + ปุ่ม **"ใช้แพลนนี้ (Clone)"** + ปุ่มจองแต่ละ item + โปรไฟล์ผู้สร้าง
- ตัวเลือกตอนเปิด public: ซ่อนชื่อสมาชิก / ซ่อนงบส่วนตัว / แสดงงบเป็นช่วง
- Export: PDF / HTML แบบ offline (เหมือนไฟล์ที่คุณส่ง) / เพิ่มลง Google Calendar / ภาพสรุป 1 หน้าไว้ลง IG Story
- **Trip Mode** (ระหว่างเที่ยว): มือถือเปิดแล้วเห็น "ตอนนี้/ต่อไป", กด nav ไป Google Maps, ทำงานได้เมื่อเน็ตแย่ (cache)
- **Phase:** MVP (share link + export HTML/PDF) / public page + clone ใน V1 / trip mode + calendar + IG image ใน V2

### M11. Discovery & Matching (ฝั่งคอมมู)
**จุดประสงค์:** เอา public plan ที่มีอยู่มาตอบคำถาม "แพลนเป็นไง งบเท่าไหร่" ให้ follower

- ค้น/กรอง public plan ตาม: เมือง / จำนวนวัน / เดือน / งบต่อคน / vibe tag / จำนวนคน (คู่, ครอบครัว, กลุ่มเพื่อน) / creator
- **Match Score** – ผู้ใช้กรอกวัน+งบ+vibe → ระบบจัดอันดับ public plan ที่ใกล้เคียง (แก้โจทย์ "เริ่มจากอะไรก็ได้แล้ว match แพลนที่มี")
- Clone แล้ว AI **ปรับให้เข้ากับทริปใหม่อัตโนมัติ** (วันต่างกัน / คนต่างกัน / งบต่างกัน → AI ปรับแล้วโชว์ diff)
- Creator profile: แพลนทั้งหมด, ยอด clone, ยอดผู้ติดตาม
- Social proof: "มีคน clone แพลนนี้ 320 ครั้ง", รีวิวหลังไปจริง, งบจริงที่คนอื่นใช้
- **Phase:** V1 (ค้น+กรอง+clone) / match score + auto-adapt + reviews ใน V2

### M12. Booking & Affiliate Layer (จุดสร้างรายได้)
**จุดประสงค์:** เปลี่ยน item ในแพลนเป็นการจองที่ track ได้ว่ามาจากเรา

- แต่ละ item type มี "ปุ่มจอง" ที่ map ไป partner ที่เหมาะ:
  - ที่พัก → Agoda / Booking.com / Trip.com / Rakuten Travel / Jalan (ญี่ปุ่นเฉพาะ)
  - ตั๋วสถานที่, ทัวร์, บัตรรถไฟ, Disney → Klook / KKday / GetYourGuide
  - รถเช่า → Rentalcars / ToCoo! / Klook car rental
  - eSIM → Airalo / Klook eSIM
  - ประกันเดินทาง → partner ประกันไทย
  - เที่ยวบิน → Skyscanner / Kiwi / Trip.com (commission ต่ำ ทำทีหลัง)
- กลไก: สร้าง deep link ต่อ item พร้อม tracking id (sub-id = plan_id + item_id + user_id) → เมื่อจองสำเร็จ partner ส่ง postback/รายงานกลับ → บันทึกใน Bookings tab
- ผู้ใช้กด "จองแล้ว" ด้วยตัวเองได้ (แม้ไม่ผ่านเรา) เพื่อให้แพลนสมบูรณ์ ไม่บังคับ
- **Price hint** – ถ้า partner มี API ราคา ให้แสดง "จาก ¥xx,xxx/คืน" ในแพลน (เพิ่ม conversion)
- **Creator attribution** – ถ้าคนจองจากแพลนที่ clone มา ให้เก็บว่าแพลนต้นทางเป็นของใคร (ปูทางส่วนแบ่ง creator ในอนาคต)
- **Phase:** MVP มี "ปุ่มจอง" แค่ 2 หมวดที่ commission ดีและสมัครง่าย (ที่พัก + กิจกรรม/ตั๋ว) / ขยายทุกหมวด + price API + creator attribution ใน V1–V2

### M13. Admin / Content Ops
- POI DB management (เพิ่ม/แก้สถานที่, เวลาเปิด, โซน, แท็ก, ลิงก์จอง)
- Template plans ที่ทีมทำเอง (seed content ก่อนมี UGC)
- Moderation ของ public plan
- Dashboard: แพลนที่สร้าง / share / clone / คลิกจอง / จองสำเร็จ / รายได้
- **Phase:** ทำแบบง่ายที่สุดใน MVP (spreadsheet + Airtable ก็ได้)

---

## 5. Data Model (คร่าว ๆ แต่ครบพอเริ่ม)

```
User            id, name, avatar, line_id/google_id, is_creator, follower_count
Trip            id, title, destination(s), start_date, end_date, party_size, currency_home, currency_dest, fx_rate, visibility(private/link/public), owner_id, source_trip_id (ถ้า clone), status(draft/planning/final/done)
TripMember      trip_id, user_id, role(owner/editor/viewer), joined_at
Wishlist        id, trip_id, member_id, type(must/nice/avoid), text, tags[], poi_id?, status(covered/partial/uncovered), covered_by_item_ids[]
MemberProfile   trip_id, member_id, visited_before, pace, walk_level, budget_min, budget_max, can_drive, has_idp, dietary[], notes
Plan (Variant)  id, trip_id, name, parent_plan_id?, is_final, version, created_by(ai/user), summary, pros[], cons[]
Day             id, plan_id, date, title, theme
Item            id, day_id, order, start_time, end_time, type(place/food/stay/transport/flight/free), poi_id?, title, notes, travel_mode, travel_minutes,
                cost_amount, cost_currency, cost_basis(per_person/per_group/per_night), cost_status(estimate/actual/paid),
                booking_partner?, booking_url?, booking_status(none/clicked/booked)
POI             id, name(th/en/ja), city, area/zone, lat, lng, category, tags[], open_hours, closed_days, avg_visit_minutes, avg_cost, tips, partner_links{}
Rationale       id, plan_id, item_id?, wishlist_id?, text, created_by(ai/user), created_at
Vote            id, plan_id or item_id, member_id, choice, reason
Comment         id, trip_id, target(item/day/plan), member_id, text, created_at
PrepBlock       id, trip_id, type(weather/packing/rule/docs), trigger_item_type?, content, checklist[]
Booking         id, trip_id, item_id, user_id, partner, tracking_id, clicked_at, confirmed_at?, amount?, commission?
Clone           id, source_trip_id, new_trip_id, user_id, created_at
```

---

## 6. AI Pipeline – ทำงานอย่างไรจริง ๆ (บทเรียนจากที่คุณทำมือ)

สิ่งที่คุณทำใน chat คือ "ค่อย ๆ ใส่ข้อมูลทีละคน แล้วให้ AI ทำแพลนใหม่" – platform ต้องเลียนแบบแต่ทำให้ **มีโครงสร้าง**

**ขั้นที่ 1 – Normalize input**
Wishlist ที่พิมพ์อิสระ ("อยากไปจุดตัดรถไฟ Slam Dunk") → AI แปลงเป็น structured: `{poi: Kamakura-koko-mae crossing, must: true, tag: anime}` และจับคู่กับ POI DB

**ขั้นที่ 2 – Cluster & Frame**
จัด POI ตามโซน (Tokyo East / West / Bay / Yokohama-Kamakura / Fuji) + วันที่ตายตัว (Disney 2 วัน, Fuji ต้องต่อเนื่องกับวันบิน) → ได้ "โครง" ก่อน

**ขั้นที่ 3 – Generate variants**
เลือก 1 "จุดตัดสินใจหลัก" (เช่น base hotel) แตกเป็น 2–3 ทาง → gen timeline ต่อ variant โดยใช้กฎเมือง (เวลาเปิด, เวลาเดินทาง)

**ขั้นที่ 4 – Validate**
เช็คโปรแกรมแบบไม่ใช้ AI: ร้านปิดวันนั้นไหม, เดินทางเกินจริงไหม, must-do ครบไหม → ถ้าไม่ผ่านส่งกลับให้ AI แก้พร้อมบอกจุด

**ขั้นที่ 5 – Explain**
gen rationale เฉพาะจุดที่มีการตัด/ย้าย/เลือก (อย่าให้พูดยาว) + open questions

**ขั้นที่ 6 – Refine loop**
คำสั่งแก้เฉพาะจุด → AI แก้เฉพาะ item ที่เกี่ยว → validate ซ้ำ → แสดง diff

**หลักสำคัญ:** AI ไม่ควรถือ "ความจริง" (เวลาเปิด ราคา พิกัด) เอง — ต้องดึงจาก POI DB / partner API เสมอ ส่วน AI ทำหน้าที่ "จัดลำดับ + อธิบาย + ต่อรองความต้องการ" ซึ่งเป็นสิ่งที่มันเก่งจริง

---

## 7. Roadmap แบบไม่ข้ามขั้น

### Phase 0 – Validate (2–3 สัปดาห์) ยังไม่เขียนโค้ดจริง
- เอา index.html ที่ทำ + อีก 3–5 ทริปของ follower มาทำ "แบบ manual" ด้วย AI ให้ครบ flow (wishlist → plan → budget → share) เพื่อดูว่าคนต้องการอะไรจริง
- ทำ Figma/mockup หน้า Trip Room + Public Plan
- สมัคร affiliate program 3–4 เจ้าไว้ก่อน (ใช้เวลาอนุมัติ)
- Seed POI DB ญี่ปุ่นโซน Tokyo/Yokohama/Fuji/Osaka/Kyoto ~300–500 จุด (ทำเป็นสเปรดชีตก่อน)
- **สำเร็จเมื่อ:** มี ≥ 5 กลุ่มบอกว่าอยากใช้ต่อ และรู้ว่า feature ไหนที่คนใช้จริง

### Phase 1 – MVP (8–12 สัปดาห์)
เป้าหมายเดียว: **"กลุ่มเพื่อนสร้างทริปญี่ปุ่นร่วมกันจนได้แพลน+งบ แล้วแชร์ได้"**
- M1 (วัน/เมือง/จากตั๋ว), M2, M3 (ฟอร์ม + coverage), M4 (1 variant + refine), M5 (timeline+list), M7 (ประมาณการ+ต่อคน), M8 (weather+packing+checklist), M9 (คอมเมนต์+viewer+LINE login), M10 (share link + export), M12 (ปุ่มจอง ที่พัก+กิจกรรม), M13 แบบง่าย
- ประเทศ: ญี่ปุ่นเท่านั้น
- **สำเร็จเมื่อ:** ≥ 50 ทริปถูกสร้าง, ≥ 30% มีสมาชิก ≥ 2 คนร่วมแก้, มีคลิกจอง

### Phase 2 – V1 "แพลนดีขึ้น + เปิดคอมมู" (8–12 สัปดาห์)
- M6 Variants & Compare + โหวต
- M4 multi-variant + conflict detector
- M5 แผนที่ + auto-warning
- M8 rule blocks
- M9 presence/assign/notify
- M10 public page + clone
- M11 ค้น/กรอง/clone
- M12 ขยาย partner + price hint
- ปล่อยแพลนของอินฟลูฯ ในทีมเป็น public ชุดแรก (seed content) → นี่คือ launch จริงต่อ follower
- **สำเร็จเมื่อ:** clone rate ของ public plan, การจองที่ track ได้ต่อเดือน, ผู้ใช้กลับมาสร้างทริปที่ 2

### Phase 3 – V2 "ขยาย" (ต่อเนื่อง)
- M11 match score + auto-adapt + รีวิวงบจริง
- M10 trip mode + calendar + IG image
- M7 หารค่าใช้จ่ายจริง
- M12 creator attribution + ส่วนแบ่ง
- ประเทศที่ 2–3 (เกาหลี ไต้หวัน) + ภาษาอังกฤษ
- Creator tools / B2B agent handoff

---

## 8. Tech Stack แนะนำ (เลือกให้เร็วและถูก)

| ส่วน | ตัวเลือกแนะนำ | เหตุผล |
|---|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui | เร็ว, SEO ได้ (หน้า public plan ต้องติด Google), responsive |
| Realtime/Collab | Supabase Realtime หรือ Liveblocks/Yjs | คอมเมนต์+ presence + co-edit |
| Backend/DB | Supabase (Postgres + Auth + Storage) | Auth LINE/Google, RLS แชร์แบบ private/link/public ง่าย |
| AI | Claude API (structured JSON output) + tool use ดึง POI/ราคา | ควบคุม format ได้, ให้ AI ใช้ tool แทนเดา |
| Maps/Places | Google Maps Platform (Places, Distance Matrix, Static maps) | ข้อมูลเวลาเปิด/พิกัด/เวลาเดินทาง |
| Weather | Open-Meteo (ฟรี) | historical + forecast |
| FX | exchangerate.host / Open Exchange Rates | อัตราแลกเปลี่ยน |
| Export | Puppeteer/Playwright → PDF/HTML, html2canvas → ภาพ IG | เหมือนไฟล์ index.html ที่ทำ |
| Notify | LINE Messaging API / LINE Login | คนไทยใช้ LINE |
| Affiliate tracking | sub-id ใน deep link + ตาราง Booking + รับ postback/CSV จาก partner | ต่อทีละเจ้า |
| Analytics | PostHog | funnel: create → invite → plan → share → click-book |

---

## 9. Business Model (โครงคร่าว ๆ – ต่อยอดภายหลัง)

### 9.1 หลักการ
ผู้ใช้ **ฟรีตลอด** เพราะเราไม่ได้ขายเครื่องมือ เราขาย "แพลนที่พร้อมจอง" ให้ partner รายได้ตามผลลัพธ์จริง (performance-based)

### 9.2 แหล่งรายได้ตามลำดับเวลา

**ระยะ 1 – Affiliate (เริ่มทันที)**
- ที่พัก: Agoda Partners / Booking.com Affiliate / Trip.com Affiliate / Rakuten Travel (ผ่าน Rakuten Advertising) / Expedia TAAP
- กิจกรรม-ตั๋ว-บัตรรถไฟ-Disney: Klook Affiliate / KKday Affiliate / GetYourGuide
- รถเช่า: Rentalcars.com Affiliate / ToCoo!
- eSIM: Airalo / Klook / Nomad
- ประกัน: partner ประกันไทยที่มี affiliate (เช่น ผ่าน platform เปรียบเทียบประกัน)
- เที่ยวบิน: Skyscanner/Kiwi/Trip.com (commission ต่ำ ทำเพื่อความครบ)

> อัตรา commission ต่างกันมากตามเจ้าและ tier โดยทั่วไปที่พักและกิจกรรมอยู่ราว **หลัก 2–8% ของยอดจอง**, รถเช่า/eSIM/ประกันมักสูงกว่าเป็นสัดส่วน, ตั๋วเครื่องบินต่ำมาก — **ต้องเช็คตัวเลขจริงตอนสมัครแต่ละโปรแกรม** และหลายเจ้ามี tier ที่สูงขึ้นเมื่อยอดถึงเกณฑ์ ซึ่งเป็นเหตุผลให้ควรรวมยอดจองไปที่ partner หลัก 1–2 เจ้าต่อหมวดก่อน

**ระยะ 2 – Creator economy (V2)**
- creator ที่แพลนถูก clone และเกิดการจอง ได้ส่วนแบ่ง (เช่น 30–50% ของ commission ที่เกิดจากแพลนนั้น) → จูงใจให้อินฟลูฯ ย้ายแพลนมาอยู่บน platform เรา (นี่คือ moat เพราะคุณเริ่มจากมีอินฟลูฯ ในทีมอยู่แล้ว)
- Sponsored placement ในหน้าค้นหา (เมือง/ที่พัก) แบบเปิดเผย

**ระยะ 3 – B2B / Agent handoff (V2+)**
- ปุ่ม "ให้ agent จัดให้" → ส่ง Final Plan เป็น lead ให้ travel agent partner → คิดค่า lead หรือ % ต่อดีล (นี่คือ "แพลนเสร็จค่อยนำไปต่อขายกับ agent" ที่คุณตั้งใจ)
- White-label ให้ agent/บริษัทใช้เครื่องมือแพลนกับลูกค้าตัวเอง

**ระยะ 4 – Premium (ทีหลังมาก ๆ ถ้าจำเป็น)**
- ฟีเจอร์เสริมสำหรับ power user/creator (แบรนด์เอง, analytics ลึก, export ไม่มีโลโก้) — ไม่ควรเก็บเงินกับ flow หลัก

### 9.3 Unit economics แบบหยาบ (ไว้ตั้งสมมติฐาน แล้วค่อยแทนตัวเลขจริง)
```
ทริปญี่ปุ่นกลุ่ม 4 คน 7 วัน ค่าใช้จ่ายไม่รวมตั๋วเครื่องบิน ≈ 150,000–200,000 ฿
ส่วนที่จองออนไลน์ผ่าน partner ได้ (ที่พัก + ตั๋ว/กิจกรรม + รถเช่า + eSIM) ≈ 60–70% ≈ 100,000–140,000 ฿
ถ้าจองผ่านเรา 30% ของส่วนนั้น × commission เฉลี่ย 4% ≈ 1,200–1,700 ฿ ต่อทริป
→ 100 ทริปที่จบด้วยการจองต่อเดือน ≈ 120,000–170,000 ฿/เดือน (ยังไม่รวม creator share)
```
ตัวเลขนี้ไว้ทดสอบสมมติฐาน 3 ตัวที่ต้องวัดจริง: **% ทริปที่ไปถึงขั้นจอง, % การจองที่ผ่านลิงก์เรา, commission เฉลี่ย**

### 9.4 ทำไมถึงชนะได้ (Positioning)
- คู่แข่งสาย AI planner ส่วนใหญ่ = คนเดียวคุยกับ AI แล้วได้แพลนสำเร็จรูป (ไม่ collaborative, ไม่มี wishlist ต่อคน, ไม่มี compare)
- คู่แข่งสาย public itinerary (blog/pantip/TikTok) = ไม่ clone ได้, ไม่ปรับให้ตรงวัน/งบ, ไม่จองต่อได้ในที่เดียว
- คุณมี **distribution ตั้งต้น** (อินฟลูฯ ในทีม + follower ที่ถามแพลนอยู่แล้ว) และ **use case ที่พิสูจน์แล้ว** (index.html)

---

## 10. Metrics ที่ต้องดูตั้งแต่วันแรก
- Activation: % ที่สร้าง Trip Room แล้วมี wishlist ≥ 1 และ AI ร่างแพลนสำเร็จ
- Collaboration: % ทริปที่มีสมาชิก ≥ 2 คนแก้/คอมเมนต์
- Completion: % ทริปที่ freeze Final Plan
- Share: % ทริปที่ถูกแชร์ / เปิด public; ยอด clone ต่อ public plan
- Monetization: click-to-book rate ต่อ item type, booking confirmed, commission ต่อทริป
- Retention: % ผู้ใช้กลับมาสร้างทริปที่ 2 ภายใน 6 เดือน

---

## 11. ความเสี่ยงและวิธีรับมือ
| ความเสี่ยง | รับมือ |
|---|---|
| AI มั่วสถานที่/เวลา/ราคา ทำให้เสียความเชื่อใจ | POI DB + validate ก่อนแสดง + ป้าย "ประมาณการ/ยังไม่ยืนยัน" ชัดเจน |
| คนใช้แพลนแล้วไปจองที่อื่น (leakage) | ปุ่มจองต้องสะดวกกว่าไปหาเอง + price hint + เก็บสถานะจองในแพลน (คุณค่าเพิ่ม) |
| affiliate approve ยาก/commission เปลี่ยน | สมัครหลายเจ้าตั้งแต่ Phase 0, ออกแบบ booking layer ให้สลับ partner ได้ |
| ต้นทุน AI ต่อทริปสูง | cache POI/กฎเมือง, gen เฉพาะส่วนที่แก้, จำกัดจำนวน refine ต่อวันสำหรับ guest |
| ไม่มี content ตอนเปิด (cold start) | seed ด้วยแพลนของทีม/อินฟลูฯ 20–30 แพลนก่อนเปิด public |
| Scope บวม | ยึด roadmap – MVP ตอบโจทย์เดียว: กลุ่มทำแพลน+งบ แล้วแชร์ได้ |
| โปรโมชั่น/ระบบแต้มถูกกวาดด้วยบัญชีม้า (เช่น แจก AI ฟรีให้ N คนแรก, referral loop ปั่นแต้มไม่จำกัด) | **ทำแล้ว:** ทางเข้าเหลือ OAuth อย่างเดียว (LINE/Google) — ประตู dev-login ย้ายออกจาก `/login` ไป `/admin/login` และให้สิทธิ์ admin เสมอ (DEV_SPEC §16) · **ยังไม่ทำ ตั้งใจรอหลัง UAT** เมื่อรูปแบบโปรโมชั่นนิ่งและเห็นพฤติกรรมผู้ใช้จริง: ผูก grant กับ activation แทน signup, cap ต่อ IP/device, velocity cap ของ referral, hold period ก่อนแลกแต้มได้ |

---

## 12. Next Steps 30 / 60 / 90 วัน
**30 วัน:** ทำ manual 5 ทริปกับ follower จริง / mockup / สมัคร affiliate / เริ่ม POI sheet / ตัดสินใจ stack
**60 วัน:** MVP ใช้ได้ภายใน (Trip Room + Wishlist + AI draft + Timeline + Budget + Share) ทดสอบกับกลุ่มปิด 10–20 กลุ่ม
**90 วัน:** เปิด beta ให้ follower ผ่านช่องทางอินฟลูฯ, ปุ่มจอง 2 หมวดทำงานจริงและ track ได้, ตัดสินใจ V1 จาก data
