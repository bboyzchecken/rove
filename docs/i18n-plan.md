# แผนทำสองภาษา (ไทย + อังกฤษ) ฝั่งผู้ใช้

- **สถานะ:** ร่าง — รอเคาะ D1–D3 ก่อนเริ่ม
- **ขอบเขต:** ทุกอย่างที่ผู้ใช้เห็น (web + ข้อความที่ API สร้าง) · ไม่รวมหน้า admin ภายใน, log, ชื่อ event PostHog

---

## 1. ของที่มีอยู่ตอนนี้

ท่อ i18n ต่อไว้แล้วแต่แทบไม่มีใครใช้:

| ของ | สถานะ |
|---|---|
| `next-intl` 4.13.7 + plugin ใน `next.config.ts` | ✅ ต่อแล้ว |
| `i18n/request.ts` | ✅ แต่ hardcode `locale = 'th'` |
| `NextIntlClientProvider` ใน `app/layout.tsx` | ✅ |
| `messages/th.json` | มี 4 namespace / ~26 key |
| ไฟล์ที่เรียก `useTranslations` | **1 ไฟล์** (`components/trip/trip-tabs.tsx`) |
| ฟอนต์ Inter + Noto Sans Thai | ✅ พร้อมอยู่แล้ว |
| `users.locale` (default `'th'`) | มีคอลัมน์ แต่ไม่มีใครอ่าน/เขียน |

**ขนาดงานจริง** (นับบรรทัดที่มีอักษรไทย ไม่รวม comment):

| ที่ | บรรทัด | หมายเหตุ |
|---|---|---|
| `apps/web/components/` + `app/` | ~1,274 | ก้อนหลัก 66+38 ไฟล์ |
| `apps/web/lib/` (ไม่รวม mock/test) | ~138 | `data/domain.ts` 59, `format.ts`, `covers.ts`, `billing.ts`, `story-image.ts` |
| `apps/web/lib/mock/` + `lib/data/mock/` | ~550 | ข้อมูลเดโม ไม่ใช่ UI copy (ดู D3) |
| `apps/api/pkg/` (ไม่รวม `_test.go`) | ~602 | error message 510 บรรทัดอยู่ใน handlers |
| `e2e/` + `lib/__tests__/` | ~160 | selector/fixture ที่จะพังถ้าเปลี่ยน copy |

---

## 2. สิ่งที่ต้องเคาะก่อน (3 ข้อ)

### D1 — URL ของภาษา

| ทางเลือก | ได้ | เสีย |
|---|---|---|
| **A. cookie อย่างเดียว** (`NEXT_LOCALE`) | ไม่ต้องแตะ route เลย, ทำวันเดียวจบ | หน้า public มี URL เดียวต่อ 2 ภาษา → SEO ได้ภาษาเดียว, ลิงก์ที่แชร์ไปบังคับภาษาไม่ได้, ทุกหน้าอ่าน cookie = dynamic ตลอด |
| **B. `[locale]` segment + `localePrefix: 'as-needed'`** | `/t/123` = ไทย, `/en/t/123` = อังกฤษ · hreflang ได้ · ลิงก์แชร์พกภาษาไปด้วย | ต้องย้าย tree ใต้ `app/[locale]/` + เพิ่ม `middleware.ts` + สลับ `next/link`/`next/navigation` เป็น wrapper ของ next-intl (20 + 13 ไฟล์) |

**เสนอ B.** เหตุผลเดียวคือ M11 — explore / `/p/[slug]` / `/u/[handle]` / landing เป็นช่องทางโต และเป็นหน้าที่คนอังกฤษจะเจอก่อนเพื่อน ถ้าเลือก A แล้ววันหลังอยากได้ SEO ก็ต้องมาย้าย tree อยู่ดี แต่ตอนนั้นไฟล์เยอะกว่านี้

รายละเอียดที่ตามมาถ้าเลือก B:
- path ไม่แปล — `/en/t/[id]/plan` ไม่ใช่ `/en/t/[id]/แพลน` (ลด matrix เทสต์และ typedRoutes ปวดหัว)
- `app/api/*` และ `app/pwa-icon/*` อยู่นอก `[locale]`
- `typedRoutes: true` + navigation wrapper ของ next-intl ต้องลองจริงก่อนย้ายทั้งก้อน → ทำ spike ครึ่งวันใน I18N-0

### D2 — ข้อความที่ฝั่ง Go สร้าง

ตอนนี้ API คืนประโยคไทยตรง ๆ (`ErrorResponse{Error string}`) และ domain ก็สร้างประโยคไทยด้วย (`match.go` Reasons, `coverage.go` Note, `adapt.go` Reason, `ai/pipeline.go` step, `zones.go` NameTH)

**เสนอ:** API เลิกเป็นเจ้าของ copy — คืน **code + params** แล้วให้ web แปล
- error: เพิ่มฟิลด์ `code` ใน `ErrorResponse` (คง `error` เป็นข้อความไทยไว้ก่อนเพื่อ backward compat) + helper `request.Fail(c, status, code)` และตาราง code→ข้อความไทยที่เดียว · 510 บรรทัดน่าจะยุบเหลือ ~120–180 code
- domain: `Reasons []string` → `[]Reason{Code, Params}` เหมือนกันทั้ง match/coverage/adapt · AI step ส่ง step code · zone ส่ง `zone_code` ไม่ส่งชื่อ
- ผลพลอยได้: `lib/data/domain.ts` (twin ฝั่ง web, ไทย 59 บรรทัด) ไม่ต้อง hardcode ประโยคซ้ำอีก และเทสต์ทั้งสองฝั่งเทียบ code แทนเทียบประโยค

### D3 — ข้อมูล ไม่ใช่ UI

| ประเภท | ทำยังไง |
|---|---|
| ผู้ใช้พิมพ์เอง (ชื่อทริป, wishlist, คอมเมนต์, โน้ต) | **ไม่แปล** แสดงตามที่พิมพ์ |
| ชื่อ POI / catalog | Phase นี้ **ไม่แปล** — โชว์ชื่อเดิม (ญี่ปุ่นส่วนใหญ่มีอังกฤษอยู่แล้ว) · ถ้าจะทำจริงคือคอลัมน์ `name_en` = งาน Phase 3 (§12 I18N) ไม่ใช่งานนี้ |
| zone name, prep template, character | เป็น copy ของเรา → เข้า messages ตาม D2 |
| mock demo data (~550 บรรทัด) | **เสนอ: ไม่แปล** mock mode เป็นของ dev/เดโม ไม่ใช่ผู้ใช้จริง — ถ้าจะเดโมภาษาอังกฤษค่อยทำทีหลัง |

---

## 3. สถาปัตยกรรมปลายทาง

```
apps/web/
├── middleware.ts                  next-intl (ต่อรอง cookie → Accept-Language → th)
├── i18n/
│   ├── routing.ts                 locales ['th','en'], defaultLocale 'th', localePrefix 'as-needed'
│   ├── navigation.ts              Link / useRouter / redirect / usePathname ที่รู้จัก locale
│   └── request.ts                 โหลด messages ตาม locale (merge หลายไฟล์)
├── messages/
│   ├── th/{common,trip,plan,wishlist,expense,budget,prep,booking,billing,collab,public,profile,auth,errors}.json
│   └── en/…                       โครงเดียวกันเป๊ะ
├── global.d.ts                    Messages = typeof th → key ผิด = compile error
└── app/[locale]/…                 (app) (marketing) p u s login invite ย้ายมาอยู่ใต้นี้
```

**กติกา key:** key เป็นอังกฤษ (ตาม DEV_SPEC §2.1), namespace = ชื่อโฟลเดอร์ feature, ใช้ ICU plural สำหรับจำนวน (`{count, plural, ...}`) ห้ามต่อสตริงเอง

**กันถอยหลัง:**
- eslint `no-restricted-syntax` แบน literal อักษรไทยใน `.tsx` ใต้ `app/` + `components/`
- `scripts/i18n-check.mjs` — เทียบ key set th↔en + compile ICU ทุกข้อความ, ต่อเข้า `pnpm lint` และ CI

---

## 4. ลำดับงาน

> ตั้งชื่อ milestone ตามแบบ DEV_SPEC เพื่อ merge เข้า §11/§12 ได้เลย

- [ ] **I18N-0 ฐาน** (~1.5 วัน) — spike typedRoutes + navigation wrapper → `routing.ts`/`navigation.ts`/`middleware.ts` → ย้าย tree ใต้ `[locale]` → typed messages + `i18n-check` + eslint rule → ตัวสลับภาษาใน `profile-menu` (เขียน cookie + `PATCH /me {locale}`) → **A:** เพิ่ม `locale` ใน `updateMeRequest`
- [ ] **I18N-1 เปลือกแอป** (~0.5 วัน) — `app-shell`, `trip-tabs`, `trip-header`, bottom nav, `status-page`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `mode-banner`, `manifest.ts`
- [ ] **I18N-2 หน้า public/SEO** (~2 วัน) — landing, terms (54), privacy (63), explore, `p/[slug]`, `u/[handle]`, `s/[shareToken]`, login, invite + `generateMetadata` ใส่ `alternates.languages` (hreflang) + OG/manifest ต่อภาษา · **หน้ากลุ่มนี้คือเหตุผลของทั้งโปรเจกต์ ทำก่อน**
- [ ] **I18N-3 ห้องทริปแกนหลัก** (~2.5 วัน) — overview, dates (`date-board` 36, `availability-calendar`), wishlist, editor (`plan-board` 41, `item-sheet`, `ai-generate-dialog` 49, `compare-screen` 31), budget, expense
- [ ] **I18N-4 ที่เหลือฝั่ง web** (~2 วัน) — prep (31), bookings, discussion/poll/inbox, photos, documents, `now`, recap, review, profile/dream, billing/receipt · admin **ข้าม** (ภายใน)
- [ ] **I18N-5 error code ฝั่ง API** (~2 วัน) — `ErrorResponse.code` + `request.Fail` + ตาราง code → `messages/*/errors.json` · ไล่ตามลำดับที่ผู้ใช้เจอบ่อย: auth → trip → item → expense → booking → billing → ai
- [ ] **I18N-6 domain reason code** (~2 วัน) — `match.go`, `coverage.go`, `adapt.go`, `ai/pipeline.go` step, `prep.store.go` template, `zones.go` + twin `lib/data/domain.ts` + แก้เทสต์ทั้งสองฝั่งให้เทียบ code
- [ ] **I18N-7 format + AI** (~1 วัน) — `format.ts` รับ locale (พ.ศ. เฉพาะ th, `en-GB` + ค.ศ. สำหรับ en), `formatDuration` → ICU, `formatMoney` ตาม locale + `home_currency` · prompt ของ AI ส่ง locale ไปด้วยเพื่อให้เหตุผลรายวันออกเป็นภาษานั้น (บันทึก locale ที่ draft ไว้ด้วย)
- [ ] **I18N-8 QA + เอกสาร** (~1.5 วัน) — e2e เปลี่ยน selector ไทยเป็น role/testid + smoke spec ภาษาอังกฤษ 1 ชุด · ไล่ดู layout ล้น (อังกฤษยาวกว่าไทย ~20–30% ปุ่มจะแตก) · อัปเดต DEV_SPEC §2.1 + §12 + ADR 0005

**รวมประมาณ 15 วันทำงาน** (คนเดียว) — ship ได้เป็นก้อน: I18N-0..2 ปล่อยก่อนได้เลย (public เป็นสองภาษา, ในแอปยังไทย), 3–4 ตามมา, 5–7 ทำคู่ขนานได้เพราะแตะคนละไฟล์

---

## 5. เรื่องที่จะไปสะดุด

1. **`story-image.ts`** ตัดคำแบบทีละอักษรเพราะไทยไม่มีช่องว่าง — ภาษาอังกฤษต้องตัดตามคำ ไม่งั้นคำจะขาดกลาง
2. **`public/sw.js`** แคช shell ตาม path — พอมี `/en/...` ต้องแยก cache key ต่อ locale ไม่งั้นเปลี่ยนภาษาแล้วได้หน้าเก่า
3. **`lib/offline.ts`** snapshot ใน localStorage เก็บ label ที่แปลแล้วหรือเปล่า — ถ้าใช่ ต้องเก็บ code แทน
4. **e2e ~160 บรรทัดยิงจากข้อความไทย** — ถ้า th.json ใส่ค่าเดิมเป๊ะจะยังผ่าน แต่จะเปราะ ควรค่อย ๆ เปลี่ยนเป็น testid ระหว่างแตะไฟล์
5. **พ.ศ./ค.ศ.** — `formatThaiDate`/`formatThaiRange` ถูกเรียกหลายที่ ต้องเลิก hardcode `th-TH-u-ca-buddhist`
6. **ศัพท์แบรนด์** ต้องมี glossary ก่อนแปล: ROVE, Wishlist, Plan, Zone, Points, Trip Mode, Recap — ห้ามแปลสลับไปมาระหว่างหน้า และ §15 บอกโทน "เป็นกันเอง ไม่ทางการ" → อังกฤษก็ต้องโทนนี้ ไม่ใช่ภาษาเอกสาร
7. **ใครเขียน copy อังกฤษ** — ถ้าให้ AI ร่างต้องมีคนอ่านทวนทั้งไฟล์ ไม่งั้นได้ภาษาบริษัทประกัน

---

## 6. ที่ต้องแก้ในสเปค

- §2.1 แถว i18n: `มีแค่ th ก่อน` → `th + en`, บันทึกวิธี route ที่เลือก
- §12 บรรทัด `I18N: EN + ประเทศที่ 2` — แยกเป็นสองเรื่อง: **EN ของ UI = งานชุดนี้**, ส่วน zones/POI/prep rules ของประเทศที่ 2 ยังอยู่ Phase 3
- ADR ใหม่ `docs/adr/0005-i18n-th-en.md` — บันทึก D1/D2/D3 พร้อมเหตุผล
