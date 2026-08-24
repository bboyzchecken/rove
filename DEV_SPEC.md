# DEV_SPEC.md — ROVE: Collaborative Trip Planning Platform (Japan-first)

> Source of truth สำหรับ dev — ใช้กับ Claude Code
> Product rationale อ้างอิง `trip-planning-platform-plan.md`
> **BRAND (§15) ✅ ใส่แล้ว** — อ่าน §15 ก่อนแตะ UI ทุกครั้ง
> Backend ยึดตาม `PROJECT_TEMPLATE.md` (Go + Echo + GORM + Uber FX + MySQL) — ห้ามเปลี่ยน pattern โดยไม่บันทึกใน Decision Log

---

## 0. วิธีใช้ไฟล์นี้กับ Claude Code

- อ่าน §1–§7 ให้ครบก่อนเริ่มงานทุกครั้ง (ภาพรวม, stack, repo, data model, API contract, conventions)
- งานทั้งหมดอยู่ใน checklist §9–§12 แยกตาม Phase → ทำตามลำดับ ห้ามข้าม Phase
- ทุก task ที่เสร็จ ติ๊ก `[x]` ในไฟล์นี้ + commit message อ้าง task id เช่น `feat(api): T3.4 wishlist coverage endpoint`
- การตัดสินใจนอกสเปค → บันทึก §16 Decision Log ก่อนทำ
- ห้ามเพิ่ม feature นอก Phase ปัจจุบัน แม้จะ "ทำได้ง่าย"
- **Repo แยก 2 ตัว**: `rove-api` (Go) และ `rove-web` (Next.js) — dev คนละ checklist ได้ ขนานกันได้ตาม §9

---

## 1. ภาพรวมระบบ

**สิ่งที่สร้าง:** เว็บแอปชื่อ **ROVE** ให้กลุ่มเพื่อนสร้าง "ห้องทริป" ร่วมกัน → แต่ละคนใส่ wishlist → AI ร่างแพลนรายวัน + งบ + เหตุผล → กลุ่มแก้/คอมเมนต์/โหวตร่วมกัน → ติดตาม expense จริง → ถ่ายรูปที่แต่ละสถานที่ → แชร์ลิงก์/เปิด public ให้คนอื่น clone → ทุก item มีปุ่มจอง affiliate ที่ track ได้

**ผู้ใช้ฟรี** รายได้จาก affiliate

**Public Model (incentivized):** เจ้าของ trip เลือกเปิดทริปเป็น public เพื่อให้คนอื่นไปเที่ยวตาม → เมื่อคนที่ clone ทริปนั้นกดจองผ่าน affiliate link → เจ้าของทริปต้นแบบได้รับ "แต้ม ROVE" → แต้มใช้เป็นส่วนลดเมื่อจองในทริปของตัวเอง ROVE จะแจ้งเตือนให้เปิด public พร้อมอธิบายประโยชน์ที่จะได้รับ

**Scope Phase 1 (MVP):** ญี่ปุ่นเท่านั้น, ภาษาไทย, web mobile-first, ไม่มี native app

**สถาปัตยกรรมภาพรวม**
```
Browser (Next.js SSR/CSR)
   │  fetch (TanStack Query)  +  SSE (realtime)
   ▼
Next.js server (BFF บาง ๆ: auth cookie, ISR public page, OG image, proxy /api → Go)
   │  HTTP + JWT
   ▼
Go API (Echo) ── Uber FX ── Handlers → Store interfaces → GORM → MySQL 8
   │                                   └→ Redis (cache, SSE pubsub, rate limit, job queue)
   ├→ Anthropic Claude API (AI planner worker)
   ├→ Google Places / Distance Matrix
   ├→ Open-Meteo, FX API (cache รายวัน)
   └→ Cloudflare R2 (export files, OG images, uploads, documents, photos)
```

**Deploy Phase 1:** AWS **Lightsail** ตัวเดียว (Docker Compose: api + mysql + redis + caddy) + Next.js บน **Lightsail container/instance เดียวกัน** หรือ Vercel free tier — ดู §8

---

## 2. Tech Stack (ตัดสินใจแล้ว)

### 2.1 Frontend (`rove-web`)
| Layer | เลือก | หมายเหตุ |
|---|---|---|
| Framework | **Next.js เวอร์ชันล่าสุด (App Router) + React 19+ + TypeScript strict** | ตอน init ใช้ `pnpm create next-app@latest` แล้วบันทึกเวอร์ชันจริงลง Decision Log — สเปคนี้ไม่ผูกเลขเวอร์ชัน |
| Server data | **TanStack Query v5** (`@tanstack/react-query`) | เป็นชั้นเดียวที่คุยกับ Go API ทั้งหมด |
| Client state | **Zustand** | เฉพาะ UI state ของ editor (drag state, selection, panel open) — **ห้ามเก็บ server data ใน Zustand** |
| Form | react-hook-form + zod resolver | |
| UI | Tailwind CSS + shadcn/ui + lucide-react | สีอ่านจาก CSS vars §15 |
| DnD | dnd-kit | timeline reorder |
| Realtime | **SSE** (`EventSource`) → invalidate TanStack Query keys | ไม่ใช้ WebSocket ใน Phase 1 |
| Date | date-fns + date-fns-tz | timezone `Asia/Tokyo` ใน editor |
| Number/Money | decimal.js + `Intl.NumberFormat('th-TH')` | |
| i18n | next-intl (มีแค่ `th` ก่อน, key เป็นอังกฤษ) | |
| Analytics | PostHog (browser) | |
| Test | Vitest + Testing Library + Playwright (e2e) | |
| Package manager | pnpm | |

### 2.2 Backend (`rove-api`) — ตาม PROJECT_TEMPLATE.md
| Layer | เลือก | หมายเหตุ |
|---|---|---|
| Language | **Go 1.23+** | |
| Web | **Echo v4** | |
| ORM | **GORM v1.25+** | |
| DB | **MySQL 8.0** | ปรับ data model จาก Postgres → MySQL แล้วใน §4 |
| DI | **Uber FX** | |
| Auth | **JWT HS256** (7 วัน) + OAuth (LINE, Google) | ตาม template + เพิ่ม OAuth |
| Config | Viper + godotenv | |
| Log | Logrus + request middleware | |
| Validate | go-playground/validator | |
| Migration | **gormigrate/v2** (auto-run ตอน start) | |
| Storage | AWS SDK v2 → **Cloudflare R2** | export html/pdf, og image, documents, trip photos |
| Cache/Queue/PubSub | **Redis** (go-redis) | AI job queue, SSE pubsub, rate limit, cache POI/distance/weather/fx |
| Worker | goroutine pool ในโปรเซสเดียวกัน (Phase 1) | แยก binary เมื่อโหลดสูง (Phase 2) |
| PDF | headless Chrome ผ่าน `chromedp` หรือเรียก service `gotenberg` container | เลือกใน T10.4 แล้วบันทึก Decision Log — ใช้สำหรับ export plan HTML/PDF และ Photo Book |
| Email | Gmail API (ตาม template) หรือ Resend | ใช้เท่าที่จำเป็น (invite fallback) |
| Test | `go test` + testify + sqlmock/testcontainers | |

### 2.3 Infra
> **แก้ 23 ส.ค. 2569 — ADR 0004:** ตัด Lightsail ออก ขึ้น ECS Fargate ตั้งแต่วันแรก
> เพราะซื้อโดเมนแล้วและช่องทางเปิดตัวคืออินฟลูฯ (traffic มาเป็นขั้นบันได ไม่ใช่ทางลาด)
> การย้าย Lightsail → ECS ทีหลังคือการเปลี่ยน network + secret store + CI target +
> ย้าย DB พร้อมกัน ซึ่งจะต้องทำตอนที่เว็บกำลังไฟไหม้พอดี

| ส่วน | ใช้จริง (ADR 0004) | ตอนโตแล้วปรับ |
|---|---|---|
| Compute | **ECS Fargate** — api + web คนละ service, autoscale 1–10 task | เพิ่ม max, ขยาย cpu/memory |
| Load balance | **ALB** + host-based routing + ACM | คงเดิม |
| Autoscale | Target tracking: ALBRequestCountPerTarget + CPU | ปรับ target value |
| DB | **RDS MySQL 8** `db.t4g.micro` single-AZ | `db_multi_az = true` / class ใหญ่ขึ้น |
| Redis | **ElastiCache** 1 node `cache.t4g.micro` | replication group |
| Outbound | NAT **instance** `t4g.nano` (~$3/mo) | NAT Gateway (~$32/mo) |
| Object storage | Cloudflare R2 (egress ฟรี) — bucket แยก: export, images, documents, photos | คงเดิม |
| DNS/CDN | Cloudflare (free) | คงเดิม |
| Secret | AWS Secrets Manager (DB password ให้ RDS หมุนเอง) | คงเดิม |
| Backup | RDS automated backup 7 วัน + PITR + final snapshot | เพิ่ม retention |
| IaC | **Terraform** — `deploy/terraform/` | คงเดิม |
| CI/CD | GitHub Actions (OIDC ไม่มี access key) → ECR → ECS UpdateService | คงเดิม |
| Monitoring | CloudWatch Logs + alarms → SNS อีเมล + AWS Budgets | Container Insights / Grafana |

> ค่าใช้จ่ายตั้งต้น **~$50–70/เดือน** ตอนยังไม่มีคนใช้ ไม่รวม AI API และ Google Maps API
> — สูงกว่าเป้าเดิม $25 เพราะ ALB/RDS คิดขั้นต่ำแม้ traffic เป็นศูนย์ แลกกับการรับ
> traffic spike ได้โดยไม่ต้อง migrate

---

## 3. โครง Repository

### 3.1 `rove-api` (Go — ยึด PROJECT_TEMPLATE.md)
```
rove-api/
├── main.go                     # env → viper → FX app → migrate → Echo :5000
├── seeder.go                   # seed users/pois/characters/template plans
├── docker-compose.yml          # mysql + redis (local dev)
├── Dockerfile                  # multi-stage go → alpine
├── deploy/
│   ├── docker-compose.prod.yml # api + mysql + redis + caddy (+ web ถ้ารวม)
│   ├── Caddyfile
│   └── deploy.sh               # pull image + up -d + healthcheck
├── migrations/                 # *.sql ที่ทำมือ (documentation)
├── data/
│   ├── poi/jp.csv              # seed POI
│   ├── characters.json         # seed 20 characters (name, emoji, image_url)
│   ├── prep_rules.json         # rule blocks (Phase 2)
│   └── templates/              # template plans
└── pkg/
    ├── core/config.go          # Config struct (§6.1)
    ├── handlers/api/
    │   ├── api.go              # Server struct + route registration
    │   ├── middleware.go       # JWT, optional JWT, admin, trip role guard, rate limit
    │   ├── request/request.go  # pagination, hash, otp, ctx helpers
    │   ├── auth.handler.go
    │   ├── user.handler.go     # รวม character, stats, calendar, points
    │   ├── trip.handler.go
    │   ├── member.handler.go
    │   ├── wishlist.handler.go
    │   ├── plan.handler.go
    │   ├── item.handler.go
    │   ├── budget.handler.go
    │   ├── expense.handler.go  # NEW: actual expense tracking shared/personal
    │   ├── prep.handler.go
    │   ├── comment.handler.go
    │   ├── vote.handler.go
    │   ├── poi.handler.go
    │   ├── ai.handler.go
    │   ├── booking.handler.go
    │   ├── dream.handler.go    # NEW: dream trip bucket list
    │   ├── photo.handler.go    # NEW: trip photos at POI (Phase 2)
    │   ├── document.handler.go # NEW: trip document folder (Phase 2)
    │   ├── public.handler.go   # public plan, explore, clone
    │   ├── export.handler.go   # plan HTML/PDF + photo book (Phase 2)
    │   ├── events.handler.go   # SSE
    │   └── admin.handler.go
    ├── models/                 # GORM struct + Store interface (1 ไฟล์ต่อ domain)
    ├── store/
    │   ├── store.go            # pagination + query helpers
    │   └── <domain>/<domain>.store.go
    ├── services/
    │   ├── ai/                 # claude client, prompts, schemas, pipeline, tools
    │   ├── airports/           # ดัชนีสนามบินทั้งโลก (embed data/airports.json) — ค้น IATA/เมือง/ประเทศ
    │   ├── places/             # google places + distance (+ redis cache)
    │   ├── weather/            # open-meteo
    │   ├── fx/                 # exchange rate (fetch API, cache 24h)
    │   ├── storage/            # R2 (multi-bucket: export/images/documents/photos)
    │   ├── email/              # gmail/resend
    │   ├── affiliate/          # deeplink builder + partner registry
    │   ├── events/             # SSE hub (redis pubsub)
    │   ├── jobs/               # redis queue + worker pool
    │   └── photobook/          # Phase 2: compile photos → PDF/Ebook via chromedp/gotenberg
    ├── domain/                 # pure logic (ไม่มี DB): budget, expense, coverage, route, validate, match, points
    ├── logger/
    └── utils/{dateutil,hashutil,str,validator}
```

### 3.2 `rove-web` (Next.js)
```
rove-web/
├── app/
│   ├── (marketing)/            # landing, /explore
│   ├── (app)/
│   │   ├── home/               # NEW: home dashboard (stats, calendar, dream, points)
│   │   ├── t/[tripId]/         # trip room: overview|wishlist|plan|budget|expense|prep|bookings|discussion|photos
│   │   ├── recap/[tripId]/     # NEW: บันทึกทริปที่จบแล้ว (อ่านอย่างเดียว + ชวนเปิด public)
│   │   └── profile/            # NEW: user profile (character, stats, dream, points history)
│   ├── p/[slug]/               # public plan (ISR)
│   ├── s/[shareToken]/         # private share view
│   ├── invite/[token]/
│   ├── u/[handle]/             # creator profile (Phase 2)
│   └── api/                    # BFF: auth cookie exchange, og-image, (proxy ถ้าจำเป็น)
├── components/{ui,trip,editor,wishlist,budget,expense,prep,public,common,photo}/
├── features/                   # 1 โฟลเดอร์ต่อ domain: api.ts + queries.ts + types.ts
│   ├── trip/ wishlist/ plan/ budget/ expense/ prep/ booking/
│   ├── dream/ character/ stats/ points/ photo/ document/
│   └── public/
├── lib/{api-client.ts,auth.ts,sse.ts,format.ts,flags.ts}
├── stores/                     # zustand (UI state เท่านั้น)
├── messages/th.json            # next-intl
└── styles/{globals.css,brand.css}   # brand.css = §15 tokens (ใส่แล้ว)
```

---

## 4. Data Model (GORM / MySQL 8)

### 4.1 กติกาทั่วไป
- PK: **`id CHAR(36)` UUID v4** (`google/uuid`) — เพราะต้องแชร์/clone ข้าม trip และไม่อยากให้เดา id ได้
- `created_at`, `updated_at` (GORM auto), **ไม่ใช้ soft delete** — ใช้ status/flag ตาม template
- Charset: `utf8mb4_0900_ai_ci`, Engine InnoDB, timezone เก็บ UTC
- Enum เก็บเป็น `VARCHAR(20)` + constant ใน Go (ไม่ใช้ MySQL ENUM เพื่อให้ migrate ง่าย)
- Array/JSON (tags, pros, cons, checklist, snapshot) → คอลัมน์ `JSON` + helper type `datatypes.JSON` หรือ custom `StringArray`
- Money → `DECIMAL(12,2)` + คอลัมน์ currency แยก
- JSON response **snake_case**, error shape `{"error":"message"}` (ตาม template)

### 4.2 ตารางหลัก (สรุปฟิลด์สำคัญ)

**characters** *(seed data, admin-managed)* — `id SMALLINT PK, name, emoji, image_url, is_active`

**users** — `id, display_name, avatar_url, character_id(FK characters,null), handle(uniq,null), email(uniq,null), password(json:"-"), provider('line'|'google'|'password'), provider_uid, role('user'|'admin'), status('active'|'deactivated'), is_creator, locale, home_currency`

**user_points** *(1:1 กับ users)* — `user_id(PK,FK), balance DECIMAL(10,0), lifetime_earned DECIMAL(10,0), updated_at`

**points_transactions** — `id, user_id, amount INT (บวก=earn ลบ=redeem), type('earn_from_clone'|'redeem_booking'|'admin_adjust'), ref_id, ref_type('booking_confirmation'|'booking_click'), note, created_at`

**dream_items** — `id, user_id, title, destination_country, destination_city, url(null), image_url(null), notes, sort_order, created_at`
index: `(user_id, sort_order)`

**trips** — `id, owner_id, title, slug(uniq,null), destination_country, destination_cities(JSON), start_date, end_date, party_size, home_currency, dest_currency, fx_rate, fx_rate_at, visibility('private'|'link'|'public'), share_token(uniq,null), status('draft'|'planning'|'final'|'done'), source_trip_id, source_creator_id, final_plan_id, cover_image_url, summary, clone_count, view_count, public_hide_expense BOOL DEFAULT TRUE`
> `public_hide_expense` = TRUE เสมอตอน publish public — expense tab ไม่โชว์ให้คนนอก

**trip_members** — `trip_id, user_id, role('owner'|'editor'|'viewer'), joined_at` — PK รวม, index `(user_id)`

**trip_invites** — `id, trip_id, token(uniq), role, expires_at, created_by, used_count, max_uses`

**trip_flights** — `id, trip_id, seq, direction('out'|'inter'|'back'), mode('flight'|'ground'), airline, flight_no, dep_airport, arr_airport, dep_date, dep_time, arr_date, arr_time, raw_text, note`
> ต่างจากสเปคเดิมสามจุด: (1) `inter` = ขาระหว่างเมือง และ `mode` รองรับรถไฟ/รถ เพราะทริปสองประเทศต้องบอกได้ว่าข้ามยังไง
> (2) วันกับเวลาแยกคอลัมน์ — กลุ่มรู้ "4 ธ.ค. ถึง 08:05" ก่อนรู้เวลาออกหลายเดือน และเวลาเป็น wall clock ของสนามบินตัวเอง ไม่ใช่ UTC
> (3) `seq` ให้ลำดับ leg คงที่ · frame ของทริป (start/end date, destination_cities, destination_country) **derive จากตารางนี้**

**member_profiles** — `trip_id, user_id (PK รวม), visited_before, pace('chill'|'normal'|'packed'), walk_level, can_drive, has_idp, budget_min, budget_max, dietary(JSON), traveling_with(JSON), notes`

**wishlist_items** — `id, trip_id, member_id, kind('must'|'nice'|'avoid'), text, tags(JSON), poi_id, coverage('covered'|'partial'|'uncovered'|'na'), covered_by_item_ids(JSON), coverage_note, sort_order`

**plans** — `id, trip_id, name, parent_plan_id, version, is_final, created_by('ai'|'user'), created_by_user_id, summary, pros(JSON), cons(JSON), key_decision, status('generating'|'ready'|'error'), generation_job_id`

**days** — `id, plan_id, date, day_index, title, theme, sort_order`

**items** — `id, day_id, plan_id, sort_order, type('place'|'food'|'stay'|'transport'|'flight'|'free'|'note'), poi_id, title, notes, start_time, end_time, duration_min, travel_mode, travel_min, travel_note, cost_amount, cost_currency, cost_basis('per_person'|'per_group'|'per_night'|'per_unit'), cost_status('estimate'|'quoted'|'actual'|'paid'), cost_note, is_prepaid, booking_partner, booking_url, booking_status('none'|'clicked'|'booked'|'skipped'), verified('verified'|'unverified'), lat, lng`
index: `(plan_id, day_id, sort_order)`

**item_versions** — `id, item_id, plan_id, snapshot(JSON), changed_by, change_source('user'|'ai'), created_at`

**pois** — `id, name_th, name_en, name_ja, country, city, area, category, tags(JSON), lat, lng, google_place_id, open_hours(JSON), closed_days(JSON), seasonal_note, avg_visit_min, avg_cost_jpy, cost_note, tips, image_url, partner_links(JSON), is_active, source, quality_score`
index: `(country, city, area)`, FULLTEXT `(name_th, name_en, name_ja)`

**expense_entries** *(actual spending — แยกจาก Budget estimate)* — `id, trip_id, day_id(null), paid_by_user_id, title, amount DECIMAL(12,2), currency, category('food'|'stay'|'transport'|'ticket'|'shopping'|'other'), split_type('shared'|'personal'), participants_json JSON (user_ids ที่หาร — ใช้เมื่อ shared), fx_rate_snapshot DECIMAL(10,4), note, created_at`
index: `(trip_id, day_id)`, `(trip_id, paid_by_user_id)`

> `split_type='shared'` → **"น้องหาร"** (ชื่อฟีเจอร์หารบิลของ ROVE) หารตาม participants_json
> `split_type='personal'` → ค่าใช้จ่ายส่วนตัวของ paid_by_user_id เท่านั้น
> FX rate ใช้ snapshot ณ วันที่บันทึก (cache รายวันจาก API) — แสดง label "อัตราโดยประมาณ"

**trip_photos** *(Phase 2)* — `id, trip_id, day_id(null), poi_id(null), item_id(null), user_id, image_url, thumb_url, caption(null), taken_at(null), sort_order, created_at`
index: `(trip_id, poi_id)`, `(trip_id, item_id)`, `(trip_id, user_id)`
> ใช้สำหรับ: IG-style grid บน POI item card + รวม Photo Book

**trip_documents** *(Phase 2)* — `id, trip_id, user_id, name, file_url, file_size INT, file_type, category('ticket'|'hotel'|'transport'|'insurance'|'other'), created_at`
index: `(trip_id)`

**comments** — `id, trip_id, target_type('trip'|'plan'|'day'|'item'|'wishlist'), target_id, user_id, body, parent_id`

**votes** — `id, trip_id, target_type('plan'|'item'|'poll'), target_id, user_id, choice, reason` — uniq `(target_type,target_id,user_id)`

**polls** *(Phase 2)* — `id, trip_id, item_id, question, options(JSON), closes_at, closed`

**rationales** — `id, plan_id, item_id, wishlist_item_id, kind('cut'|'moved'|'chosen'|'added'|'warning'), text, created_by('ai'|'user')`

**activity_logs** — `id, trip_id, user_id, action, target_type, target_id, meta(JSON), created_at`

**prep_blocks** — `id, trip_id, type('weather'|'packing'|'rule'|'docs'|'custom'), trigger, title, content_md, checklist(JSON), sort_order, generated_by`

**tasks** *(Phase 2)* — `id, trip_id, title, assignee_id, due_date, done`

**ai_jobs** — `id, trip_id, plan_id, kind('generate'|'refine'|'explain'|'normalize'|'parse_ticket'), status('queued'|'running'|'done'|'error'), step, input(JSON), output(JSON), error, tokens_in, tokens_out, cost_usd, created_at, finished_at`

**orders** *(M20 — บิลและการชำระเงิน)* — `id, user_id, number(uniq "RV-2569-000123"), kind('ai_credit'|'subscription'|'points_topup'), status('pending'|'paid'|'failed'|'refunded'), title, lines(JSON: [{label,quantity,unit_amount_thb,amount_thb}]), subtotal_thb, discount_thb, total_thb, currency, method('card'|'promptpay'|'truemoney'|'points'|'free'), method_label, points_spent INT, trip_id(null, ไม่ใช่ FK), trip_title, provider, provider_ref, simulated BOOL, subscription_id(null), period_start(null), period_end(null), issued_at, paid_at, refunded_at`
index: `(user_id, issued_at)`, uniq `(number)`
> ตารางเดียวรับของทุกอย่างที่ขาย — Phase 1 ขายแค่โควตาร่าง AI แต่ subscription รายเดือนใช้แถวเดียวกัน (`kind='subscription'` + `period_*`) จึงไม่ต้องแก้ schema ตอนเปิดขาย
> **immutable** — คืนเงิน = เปลี่ยน status, ออกใหม่ = แถวใหม่ · ใบเสร็จที่ผู้ใช้โหลดไปแล้วต้องไม่กลายเป็นเอกสารคนละใบ
> `lines` เป็น JSON ไม่ใช่ตารางลูก: ใบเสร็จอ่านทั้งใบเสมอ ไม่มี query ที่ join รายบรรทัด
> `simulated=TRUE` เมื่อจ่ายด้วยเงินสด — Phase 1 ยังไม่มี gateway จึง**บันทึกแต่ไม่ตัดเงินจริง** (§16)
> จ่ายด้วยแต้ม: `subtotal` คงราคาป้าย, `discount = subtotal`, `total = 0`, `points_spent = 300 × qty` — แต้มไม่ใช่บาท ไม่บวกรวมกัน

**subscriptions** *(M20 — ว่างจนกว่าจะเปิดขาย)* — `id, user_id, plan_id, status('active'|'past_due'|'canceled'), interval('month'|'year'), price_thb, current_period_start, current_period_end, cancel_at_period_end BOOL, provider, provider_ref, canceled_at`
index: `(user_id)`
> ผู้ใช้ฟรี**ไม่มีแถว** — API สังเคราะห์แพ็กเกจฟรีจาก catalogue (`domain.Plans()`) ตารางนี้จึงมีเฉพาะคนที่ถูกเก็บเงินจริง

**booking_clicks** — `id, trip_id, plan_id, item_id, user_id, partner, tracking_id(uniq), target_url, clicked_at, ua, referrer, source_trip_id(null), source_creator_id(null)`
> `source_trip_id` + `source_creator_id` = trip ต้นแบบที่ clone มา ใช้ attributing แต้มให้ creator

**booking_confirmations** — `id, tracking_id, partner, partner_ref, amount, currency, commission, points_awarded INT DEFAULT 0, status('pending'|'confirmed'|'cancelled'), confirmed_at, raw(JSON)`

**affiliate_partners** — `key(PK), name, item_types(JSON), deeplink_template, subid_param, enabled, priority, notes`

**plan_clones** — `id, source_trip_id, new_trip_id, user_id, created_at`

**trip_reviews** *(Phase 3)* — `id, trip_id, user_id, rating, actual_budget_per_person, body`

**caches** — `distance_cache(from_key,to_key,mode,minutes,meters,fetched_at)`, `weather_cache`, `fx_cache(currency_pair,rate,fetched_at)` — fx_cache TTL 24h

### 4.3 Authorization (แทน RLS)
MySQL ไม่มี RLS → **บังคับสิทธิ์ที่ Go middleware + store layer**
- `TripRoleMiddleware(minRole)` — โหลด `trip_members` ของ user ปัจจุบัน แล้ว set `c.Set("trip_role", ...)`; ลำดับ `viewer < editor < owner`
- ทุก store method ที่แตะข้อมูลใน trip **ต้องรับ `tripID` เป็นพารามิเตอร์และ WHERE ด้วยเสมอ** (ห้าม query by id เดี่ยว ๆ) — ป้องกัน IDOR
- Public/share access ผ่าน handler แยก (`public.handler.go`) ที่อ่านเฉพาะฟิลด์ที่เปิดเผยได้ ตาม privacy setting
- **Expense tab ซ่อนเสมอเมื่อแชร์ public** — `public_hide_expense=TRUE` บังคับใน public payload
- เขียน integration test เคส cross-trip access ทุก endpoint กลุ่มหลัก

---

## 5. API Contract (Go — `/api/v1`)

รูปแบบตาม template: JSON snake_case, error `{"error":"..."}`, pagination `{total,total_pages,current_page,limit}`

### 5.1 Public / Auth
```
POST   /auth/oauth/line            {code, redirect_uri} → {token, user}
POST   /auth/oauth/google          → {token, user}
POST   /auth/login                 (email+password, dev/admin เท่านั้น)
GET    /auth/me                    (JWT)
POST   /auth/refresh
```

### 5.2 User / Character / Dream / Stats / Points
```
GET    /api/v1/characters                        list ทั้งหมด (seed data)
PATCH  /api/v1/users/me/character                {character_id} → update user
GET    /api/v1/users/me/stats                    {total_trips, total_days, countries[], total_spend_thb, trips_this_year}
GET    /api/v1/users/me/calendar                 upcoming trips + days_until + weather snippet (ต่อ trip)

GET    /api/v1/users/me/dream                    dream items (paginated)
POST   /api/v1/users/me/dream                    {title, destination_country, destination_city, url?, notes?}
PATCH  /api/v1/users/me/dream/:id
DELETE /api/v1/users/me/dream/:id
POST   /api/v1/users/me/dream/reorder            {ids[]} เรียงใหม่

GET    /api/v1/users/me/points                   {balance, lifetime_earned}
GET    /api/v1/users/me/points/history           transactions (cursor)
```

**หมายเหตุจากของที่ทำจริง:** calendar แยกเป็น `GET /users/me/trips/upcoming` + `GET /users/me/trips/past`
· past trip แต่ละใบพก `end_date` + `visibility` + `public_slug` มาด้วย เพื่อให้การ์ดลิงก์ไปหน้าบันทึกทริป
(`/recap/:tripId`) และรู้ว่าเปิด public ไปแล้วหรือยัง

### 5.3 Trip
```
POST   /api/v1/trips                          สร้างทริป {entry_type, title?, start_date?, end_date?, cities[], party_size, flights[]}
GET    /api/v1/trips                          ทริปของฉัน (paginated)
GET    /api/v1/trips/:tripId                  overview (trip + members + counts + flags)
PATCH  /api/v1/trips/:tripId                  แก้ frame            [editor]
DELETE /api/v1/trips/:tripId                                        [owner]
GET    /api/v1/trips/:tripId/flights          legs + stops/countries/nights ที่ derive แล้ว
POST   /api/v1/trips/:tripId/flights          เพิ่มหนึ่ง leg        [editor]
PUT    /api/v1/trips/:tripId/flights          แทนที่ทั้งเส้นทาง     [editor]
PATCH  /api/v1/trips/:tripId/flights/:flightId แก้ leg              [editor]
DELETE /api/v1/trips/:tripId/flights/:flightId ลบ leg               [editor]
POST   /api/v1/trips/:tripId/invites          สร้างลิงก์เชิญ        [owner]
POST   /api/v1/invites/:token/accept          join
GET    /api/v1/trips/:tripId/members
PATCH  /api/v1/trips/:tripId/members/:userId  เปลี่ยน role          [owner]
DELETE /api/v1/trips/:tripId/members/:userId                        [owner]
GET    /api/v1/trips/:tripId/activity         feed (cursor)
GET    /api/v1/trips/:tripId/recap            บันทึกทริปที่จบแล้ว: decisions + itinerary + spending + share  [viewer]
PATCH  /api/v1/trips/:tripId/visibility       {visibility, privacy_opts}  [owner]
POST   /api/v1/trips/:tripId/clone            → new trip
```

**หมายเหตุจากของที่ทำจริง:** join คือ `POST /api/v1/invites/:token/join` (ไม่ใช่ `/accept`)
และมี `GET /api/v1/invites/:token` สำหรับหน้า preview ก่อนล็อกอิน · overview อยู่ที่
`GET /api/v1/trips/:tripId/overview` ส่วน `GET /api/v1/trips/:tripId` คืน trip เปล่า

### 5.3b Airports — ค้นสนามบินทั้งโลก (M1 / A1.3)
```
GET    /api/v1/airports?q=&limit=   ค้นด้วยรหัส IATA / เมือง / ชื่อสนามบิน / ประเทศ (ไทย+อังกฤษ)
GET    /api/v1/airports/:iata       หนึ่งสนามบิน
```
สาธารณะทั้งคู่ (อยู่ใน allowlist ของ `routes_test.go`) เพราะ entry flow ต้องค้นได้ก่อนล็อกอิน เหมือนเว็บจองตั๋ว ·
ข้อมูลถูก **embed** ไว้ใน binary (`data/airports.json`, `//go:embed`) ~3.6k สนามบินทั่วโลกที่มีรหัส IATA +
เที่ยวบินประจำ + ขนาด large/medium — ไม่ต้องใช้ key, ไม่มีโควตา, ทำงานได้ทั้ง mock และ live ·
สร้างใหม่ด้วย `node scripts/gen-airports.mjs` (ที่มา: OurAirports + OpenFlights + i18n-iso-countries ผ่าน npm) ·
ฝั่งเว็บมีสำเนาเดียวกันที่ `lib/data/airports.data.json` โหลดแบบ dynamic import เฉพาะตอนเปิด picker

### 5.3a Dates — นัดวัน (ทำเกินสเปคเดิม)
```
GET    /api/v1/trips/:tripId/dates/board          ใครว่างวันไหนบ้าง
GET    /api/v1/trips/:tripId/dates/windows        ช่วงที่คนว่างมากที่สุด (จัดอันดับ)
GET    /api/v1/trips/:tripId/dates/destinations   ปลายทางที่เข้ากับช่วงนั้น (fit score)
PUT    /api/v1/trips/:tripId/dates/availability   กาวันว่างของตัวเอง        [editor]
POST   /api/v1/trips/:tripId/dates/submit         ยืนยันว่ากาครบแล้ว        [editor]
POST   /api/v1/trips/:tripId/dates/destination    เลือกปลายทาง              [editor]
POST   /api/v1/trips/:tripId/dates/lock           ล็อกวันเดินทาง            [owner]
DELETE /api/v1/trips/:tripId/dates/lock           ปลดล็อก                   [owner]
```

### 5.4 Wishlist / Profile
```
GET    /api/v1/trips/:tripId/wishlist
POST   /api/v1/trips/:tripId/wishlist
PATCH  /api/v1/trips/:tripId/wishlist/:id
DELETE /api/v1/trips/:tripId/wishlist/:id
GET    /api/v1/trips/:tripId/profile/me
PUT    /api/v1/trips/:tripId/profile/me
GET    /api/v1/trips/:tripId/coverage
```

### 5.5 Plan / Item
```
GET    /api/v1/trips/:tripId/plans
POST   /api/v1/trips/:tripId/plans            [editor]
GET    /api/v1/plans/:planId
PATCH  /api/v1/plans/:planId                  [editor]
DELETE /api/v1/plans/:planId                  [editor]
POST   /api/v1/plans/:planId/freeze           [owner]
POST   /api/v1/plans/:planId/snapshot         [editor]
GET    /api/v1/plans/:planId/validate
POST   /api/v1/plans/:planId/days
POST   /api/v1/plans/:planId/items
PATCH  /api/v1/items/:itemId
POST   /api/v1/items/:itemId/move             {day_id, position}
DELETE /api/v1/items/:itemId
POST   /api/v1/items/:itemId/undo
GET    /api/v1/plans/:planId/compare?with=planId2   (Phase 2)
```

### 5.6 Budget (ประมาณการจาก plan items)
```
GET    /api/v1/plans/:planId/budget            สรุปตาม category + per person + prepaid + FX (โดยประมาณ)
```

### 5.7 Expense (รายจ่ายจริง Shared/Personal)
```
GET    /api/v1/trips/:tripId/expense                  รายการทั้งหมด (paginated, กรองตาม day/user/type)
POST   /api/v1/trips/:tripId/expense                  {title, amount, currency, category, split_type, participants_json?, day_id?, note?}
PATCH  /api/v1/expense/:id                            แก้รายการ [owner ของ entry]
DELETE /api/v1/expense/:id                            [owner ของ entry หรือ trip owner]
GET    /api/v1/trips/:tripId/expense/summary          {per_member[], total, settled_status, fx_rate, fx_rate_at}
```
> summary คำนวณสด จาก `pkg/domain/expense.go` — ใช้ FX rate จาก fx_cache รายวัน
> response มี field `fx_rate_note: "อัตราโดยประมาณ ณ วันที่ [date]"` เสมอ

### 5.8 Prep
```
GET    /api/v1/trips/:tripId/prep
POST   /api/v1/trips/:tripId/prep
PATCH  /api/v1/prep/:blockId
POST   /api/v1/trips/:tripId/prep/regenerate
```

### 5.9 Collaboration
```
GET/POST /api/v1/trips/:tripId/comments?target_type=&target_id=
DELETE   /api/v1/comments/:id
POST     /api/v1/votes                          {target_type,target_id,choice,reason}
GET      /api/v1/trips/:tripId/events           SSE stream
```

### 5.10 AI
```
POST /api/v1/trips/:tripId/ai/generate    {variants?:1..3, hints?} → {job_id}
POST /api/v1/plans/:planId/ai/refine      {instruction} → {job_id}
POST /api/v1/ai/parse-ticket              {text} → {flights[], suggested_trip}
GET  /api/v1/ai/jobs/:jobId
POST /api/v1/plans/:planId/ai/apply-diff  {job_id, accepted_diff_ids[]}   [editor]
```

### 5.11 POI / Booking / Public / Export
```
GET  /api/v1/pois/search?q=&city=&category=
GET  /api/v1/pois/:id
POST /api/v1/pois/resolve                        {google_maps_url|place_id|text} → POI

POST /api/v1/items/:itemId/booking-link          → {tracking_id, redirect_url}
GET  /go/:trackingId                             302 → partner (นับ click, บันทึก source_creator_id)  [no auth]
POST /api/v1/items/:itemId/booking-status        {status}
GET  /api/v1/trips/:tripId/bookings

GET  /public/plans/:slug                         [no auth] public plan (ซ่อน expense เสมอ)
GET  /public/explore?city=&days=&month=&budget=&tags=&sort=   [no auth]
POST /public/plans/:slug/view                    นับ view (fire-and-forget)

POST /api/v1/trips/:tripId/export                {format:'html'|'pdf'} → {job_id}
GET  /api/v1/exports/:id                         → signed R2 url
POST /webhooks/affiliate/:partner                [no auth, verify signature]
```

### 5.12 Photos (Phase 2)
```
GET    /api/v1/trips/:tripId/photos              ทั้งหมด (paginated) + กรอง ?poi_id= ?item_id= ?user_id=
POST   /api/v1/trips/:tripId/photos             {image (multipart), poi_id?, item_id?, day_id?, caption?, taken_at?}
DELETE /api/v1/photos/:id                       [uploader หรือ trip owner]
POST   /api/v1/trips/:tripId/photobook           {format:'pdf'|'ebook'} → {job_id}
```

### 5.13 Documents (Phase 2)
```
GET    /api/v1/trips/:tripId/documents
POST   /api/v1/trips/:tripId/documents          {file (multipart), name, category}
DELETE /api/v1/documents/:id                    [uploader หรือ trip owner]
```

### 5.14 SSE (`events.handler.go`)
- endpoint: `GET /api/v1/trips/:tripId/events` (JWT ผ่าน query token หรือ cookie)
- ใช้ Redis Pub/Sub channel `trip:{tripId}` — ทุก mutation publish `{type, target_type, target_id, actor_id, ts}`
- Frontend: hook `useTripEvents(tripId)` → `queryClient.invalidateQueries({queryKey:[...]})` ตาม type
- event types เพิ่มเติม: `expense.created`, `expense.updated`, `photo.uploaded`
- heartbeat ทุก 20s, reconnect อัตโนมัติ + refetch on reconnect

### 5.15 Billing (M20 — บิลและการชำระเงิน)
```
GET  /api/v1/users/me/billing/summary            → {orders, ai_drafts_purchased, total_spent_thb, points_spent, since, subscription}
GET  /api/v1/users/me/billing/orders             → order[] (ใหม่สุดก่อน)
GET  /api/v1/users/me/billing/orders/:orderId    → order (ใบเสร็จ) · ของคนอื่น = 404 ไม่ใช่ 403
GET  /api/v1/users/me/billing/subscription       → subscription (ฟรี = สังเคราะห์ ไม่มีแถวในตาราง)
GET  /api/v1/users/me/billing/plans              → subscription_plan[] (`available:false` จนกว่าจะมี gateway)
```
> **อ่านอย่างเดียว** — order ถูกเขียนโดย "สิ่งที่ขาย" เท่านั้น: วันนี้คือ `POST /trips/:tripId/ai/credits/purchase` ต่อไปคือ renewal ของ subscription
> `purchase` รับ `{quantity, method, channel}` — `method` = id ช่องทาง (`card`|`promptpay`|`truemoney`|`points`), `channel` = ป้ายที่ผู้ใช้กดจริง เก็บลงใบเสร็จตามตัวอักษร · response พ่วง `order` มาด้วยเพื่อลิงก์ไปใบเสร็จได้ทันที
> อยู่ใต้ `/users/me` เพราะใบเสร็จเป็นของคนจ่าย ไม่ใช่ของทริป และอยู่ได้นานกว่าทริปที่ใช้สิทธิ์นั้น

---

## 6. Backend Conventions (ต่อจาก PROJECT_TEMPLATE.md)

### 6.1 Config (`pkg/core/config.go`)
```go
type Config struct {
    Environment string; Commit string; Port string
    JwtSecret   string
    MySQL       MySQLConfig
    Redis       RedisConfig
    R2          R2Config      // fields: ExportBucket, ImageBucket, DocumentBucket, PhotoBucket
    Anthropic   AnthropicConfig   // ApiKey, ModelPlanner, ModelFast, MaxTokens
    Google      GoogleConfig      // MapsServerKey, OAuthClientID/Secret
    Line        LineConfig        // LoginChannelID/Secret, MessagingToken
    FX          FXConfig          // APIURL, APIKey, CacheTTLHours (default 24)
    AppBaseURL  string
    WebBaseURL  string
    Affiliate   map[string]string // partner key → id
    Points      PointsConfig      // EarnRatePct (% of commission → points), MinRedeemBalance
}
```

### 6.2 Layer rules
- Handler ทำแค่: bind → validate → เรียก store/service → map เป็น response DTO (ห้ามใส่ business logic)
- **Business logic บริสุทธิ์อยู่ใน `pkg/domain/`** และต้องมี unit test: `budget.go`, `expense.go`, `coverage.go`, `validate.go`, `match.go`, `zones.go`, `points.go`
- Store รับ/คืน model, ต้อง scope ด้วย `tripID` เสมอ (§4.3)
- Service ภายนอก (places/weather/fx/ai/storage) ต้องอยู่หลัง interface เพื่อ mock ได้
- ทุก mutation เขียน `activity_logs` + publish SSE event (ทำผ่าน helper `s.emit(tripID, event)`)
- Transaction: การเขียนหลายตาราง (persistPlan, clone, applyDiff, awardPoints) ต้องอยู่ใน `db.Transaction`
- Rate limit: Echo middleware + Redis — guest, per-user, per-endpoint (AI endpoints เข้ม)
- **FX rate**: `services/fx` ดึงจาก API ภายนอก cache ใน `fx_cache` TTL 24h — ไม่ดึง real-time ทุก request — response ต้องแนบ `fx_rate_at` เสมอ

### 6.3 AI Service (`pkg/services/ai/`)
```
client.go       Anthropic HTTP client (retry, timeout, token accounting → ai_jobs)
prompts/        *.md prompt templates (แยกไฟล์, มีเวอร์ชัน)
schemas.go      Go struct + JSON schema ของ PlanDraft, ItemDiff, ParsedTicket, NormalizedWishlist
tools.go        lookup_poi, get_poi, distance, weather, fx  (tool use → เรียก service จริง)
pipeline.go     normalize → buildFrame → generate → validate(domain) → repair → explain → persist
worker.go       consume redis queue, update ai_jobs, publish SSE
```
กติกา:
- Output ต้อง parse เข้า struct ได้ (retry ≤2) มิฉะนั้น job = error
- POI ที่หาไม่เจอใน DB → `verified='unverified'`
- ทุก cost จาก AI → `cost_status='estimate'` + `cost_note`
- ห้ามให้ AI ตัดสินเวลาเปิด/ปิด/ราคาเอง — ต้องผ่าน tool
- บันทึก tokens/cost ทุก job

### 6.4 PlanDraft schema (ย่อ)
```go
type PlanDraft struct {
    Name, KeyDecision, Summary string
    Pros, Cons []string
    Days []struct{
        Date string; Title, Theme string
        Items []struct{
            Type string; POIRef *POIRef; Title, Notes string
            StartTime, EndTime string; DurationMin int
            TravelMode string; TravelMin int; TravelNote string
            Cost *struct{ Amount float64; Currency, Basis, Note string }
        }
    }
    Coverage []struct{ WishlistItemID, Status, Note string; ItemRefs []string }
    Rationales []struct{ Kind, Text, ItemRef, WishlistItemID string }
    OpenQuestions []string
}
type ItemDiff struct{ Op string; ItemID string; DayIndex, Position int; Item map[string]any; Reason string }
```

### 6.5 Points Logic (`pkg/domain/points.go`)
- เมื่อ `booking_confirmations` status → `confirmed`:
  - ตรวจว่า `booking_clicks.source_creator_id` มีค่า
  - คำนวณ `points = floor(commission * EarnRatePct / 100)` (ปัดลง)
  - สร้าง `points_transactions` + update `user_points.balance` ใน transaction เดียวกับ confirm
- Redeem: Phase 2 (ออกแบบ flow เมื่อ partner support discount code หรือ cashback)

---

## 7. Frontend Conventions

### 7.1 TanStack Query
- `QueryClient` default: `staleTime: 30_000`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false`
- **Query key factory ต่อ feature:**
```ts
export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string) => [...tripKeys.all, id] as const,
  members: (id: string) => [...tripKeys.detail(id), 'members'] as const,
  wishlist: (id: string) => [...tripKeys.detail(id), 'wishlist'] as const,
  coverage: (id: string) => [...tripKeys.detail(id), 'coverage'] as const,
  activity: (id: string) => [...tripKeys.detail(id), 'activity'] as const,
  expense: (id: string) => [...tripKeys.detail(id), 'expense'] as const,
  expenseSummary: (id: string) => [...tripKeys.detail(id), 'expense', 'summary'] as const,
  photos: (id: string) => [...tripKeys.detail(id), 'photos'] as const,
  documents: (id: string) => [...tripKeys.detail(id), 'documents'] as const,
}
export const planKeys = {
  all: ['plans'] as const,
  list: (tripId: string) => [...planKeys.all, 'list', tripId] as const,
  detail: (planId: string) => [...planKeys.all, planId] as const,
  budget: (planId: string) => [...planKeys.detail(planId), 'budget'] as const,
  validate: (planId: string) => [...planKeys.detail(planId), 'validate'] as const,
}
export const userKeys = {
  me: ['user', 'me'] as const,
  stats: ['user', 'me', 'stats'] as const,
  calendar: ['user', 'me', 'calendar'] as const,
  dream: ['user', 'me', 'dream'] as const,
  points: ['user', 'me', 'points'] as const,
}
```
- Mutation ที่แก้ item/day → optimistic update + rollback + invalidate `planKeys.detail`, `planKeys.budget`, `tripKeys.coverage`
- Expense mutation → invalidate `tripKeys.expense`, `tripKeys.expenseSummary`, `userKeys.stats`
- SSR: หน้า public/share ใช้ `HydrationBoundary` + `dehydrate` จาก server fetch
- AI job: polling 2s เฉพาะตอนไม่มี SSE
- Infinite list (explore, activity, comments) ใช้ `useInfiniteQuery` cursor

### 7.2 อื่น ๆ
- TypeScript strict, ห้าม `any`; type ของ API generate จาก OpenAPI (`openapi-typescript`)
- Auth: JWT เก็บใน **httpOnly cookie** ที่ตั้งจาก Next route handler หลัง OAuth callback
- mobile-first 375px, ทดสอบ dnd บนมือถือจริง
- ทุกหน้ามี loading/empty/error state
- Feature flags: `lib/flags.ts` อ่านจาก env
- **FX display:** ทุกที่ที่แสดงเงินที่แปลงจาก FX ต้องมี tooltip หรือ label "อัตราโดยประมาณ" แนบ date

---

## 8. Deployment (AWS ECS Fargate + ALB + autoscale)

> **เขียนใหม่ทั้งหัวข้อ 23 ส.ค. 2569 — [ADR 0004](docs/adr/0004-aws-ecs-instead-of-lightsail.md)**
> ของเดิม (Lightsail กล่องเดียว + Caddy + docker compose, ≤$25/mo) ถูกแทนที่
> **ขั้นตอนลงมือจริงอยู่ที่ [deploy/AWS_DEPLOY.md](deploy/AWS_DEPLOY.md)** หัวข้อนี้เก็บแค่โครง

### 8.1 Topology
```
Cloudflare DNS (rovetravel.site)
└── ALB :443 (ACM cert, idle_timeout 120s รองรับ SSE)
    ├── rovetravel.site / www → web target group → ECS service "rove-web"  (Fargate, 1–10 task)
    └── api.rovetravel.site   → api target group → ECS service "rove-api"  (Fargate, 1–10 task)
                                                    │  (private subnet, ไม่มี public IP)
                                                    ├── RDS MySQL 8  db.t4g.micro, single-AZ, backup 7 วัน
                                                    ├── ElastiCache Redis 7  cache.t4g.micro 1 node
                                                    └── NAT instance t4g.nano → Anthropic / Google / LINE
```
- 2 AZ, public subnet มีแค่ ALB กับ NAT — ที่เหลืออยู่ private ทั้งหมด
- Fargate ผสม on-demand 1 task เป็นฐาน + Spot ส่วนที่ scale ขึ้น (weight 1:4)
- Secret อยู่ใน Secrets Manager, MySQL password ให้ RDS สร้าง/หมุนเอง
- IaC ทั้งหมด: `deploy/terraform/` (state บน S3 + DynamoDB lock)

### 8.2 Autoscale
- Target tracking 2 ตัวต่อ service, อันไหนถึงก่อนชนะ:
  - `ALBRequestCountPerTarget` — api 500, web 400 req/target/นาที (**ตัวหลัก**)
  - `ECSServiceAverageCPUUtilization` 65%
- scale-out cooldown 60s / scale-in 300s — ผิดทางขึ้นถูกกว่าผิดทางลงตอน spike
- CPU อย่างเดียวตอบสนอง spike ช้าไป 1–2 cooldown จึงต้องมี request count คู่กัน

### 8.3 CI/CD
1. GitHub Actions (`release.yml`) trigger จาก tag `v*`
2. build → push **ECR** (ไม่ใช่ GHCR แล้ว) ผ่าน **OIDC role** — ไม่มี AWS access key ใน GitHub
3. ดึง task definition ที่ live อยู่มาเปลี่ยนเฉพาะ image → `UpdateService` → รอ stable
4. api ก่อน web เสมอ (`max-parallel: 1`)
5. `aws_ecs_service` ตั้ง `ignore_changes = [task_definition, desired_count]` ไม่ให้ Terraform ทับ CI/autoscaler
   → ผลข้างเคียง: แก้ env var ใน `ecs.tf` ต้อง `--force-new-deployment` เอง (AWS_DEPLOY.md ขั้น 8)

### 8.4 Backup / Ops
- RDS automated backup 7 วัน + PITR + final snapshot ตอนลบ + `deletion_protection`
- CloudWatch Logs `/ecs/rove-api`, `/ecs/rove-web` เก็บ 14 วัน
- Alarm → SNS อีเมล: ALB 5xx, unhealthy host, RDS CPU/storage, Redis CPU, NAT instance down
- AWS Budgets เตือนที่ 80% actual และ 100% forecast (**เตือนได้อย่างเดียว หยุด spend ไม่ได้**)
- `/healthz` = ALB health check, `/readyz` เช็ค DB + Redis สำหรับตรวจหลัง deploy

### 8.5 ข้อจำกัดที่รู้ตัว (ADR 0004)
| จุด | ความเสี่ยง | แก้เมื่อ |
|---|---|---|
| NAT instance ตัวเดียว | outbound (AI/Maps/LINE) ตาย เว็บยังขึ้น | เปลี่ยนเป็น NAT Gateway |
| RDS single-AZ | ไม่มี failover อัตโนมัติ | `db_multi_az = true` |
| Fargate Spot | ถูกดึงคืนได้ (เตือนล่วงหน้า 2 นาที) | ลบ block Spot |
| **migration รันทุก task ตอน boot** | หลาย task boot พร้อมกัน = แย่งกันรัน | ใส่ MySQL advisory lock ครอบ `core.Migrate` |
| SSR ของ web เรียก api ผ่าน ALB สาธารณะ | เพิ่ม 1 hop | ECS Service Connect |

### 8.6 เส้นทาง scale ต่อจากนี้
ทุกข้อคือแก้ตัวแปรใน `terraform.tfvars` แล้ว apply — ไม่ต้อง migrate:
ยก `api_max_count` → `db_instance_class` ใหญ่ขึ้น → `db_multi_az` → Redis replication group → RDS read replica

---

## 9. Phase 0 — Setup & Validate

> **สถานะ ณ 20 ส.ค. 2569 — Phase 0 + Phase 1: ติ๊กแล้ว 128 / 153**
>
> (145 ข้อเดิม ติ๊กได้ 120 · อีก 8 ข้อคือของที่ทำเกินสเปคแล้วเพิ่มเข้ามาให้เช็กลิสต์ตรงกับของจริง)
>
> เช็กลิสต์นี้ตรวจกับ tree ที่อยู่บน `main` หลัง merge `feat/ui-prototype` แล้ว
> (ไม่ใช่กับสิ่งที่ตั้งใจจะทำ) — ทุกข้อที่ติ๊กคือของที่มีจริงในโค้ดและ build ผ่าน
> ข้อที่ยังไม่ติ๊กมี **หมายเหตุ** บอกว่าค้างตรงไหน
>
> **ที่ค้างและปิด MVP ไม่ได้ถ้าไม่ทำ:** D0.3 (POI 91/300), A3.1 (`member_profiles`),
> A4.5 + A7.1 (unit test ของ validate/budget), X.1 (e2e ยังไม่ครบเส้น), A0.10 (ยังไม่มี server จริง)
>
> **ที่ค้างเพราะรอของนอกโค้ด:** D0.6 (ยังไม่ได้สมัคร affiliate) → A12.5, X.6 (closed beta)
>
> มีของที่ **ทำเกินสเปค** และไม่มีในเช็กลิสต์เดิม: M2.5 นัดวัน — เพิ่มไว้ด้านล่างแล้ว

### API (`rove-api`)
- [x] A0.1 init repo ตาม template: main.go + FX + Echo + GORM + Viper + Logrus + validator
- [x] A0.2 `docker-compose.yml` (mysql 8 + redis) สำหรับ local, `.env.example` ครบ §6.1  ·  **หมายเหตุ:** `.env.example` อยู่ที่รากของ repo — ใช้ร่วมกันทั้ง api และ web
- [x] A0.3 gormigrate migration แรก: users, user_points, trips, trip_members, pois, characters (AutoMigrate)  ·  **หมายเหตุ:** 4 migrations: init_core, poi_fulltext, phase1_core, phase1_trip_user_columns
- [x] A0.4 Auth: JWT HS256 + `JwtMiddleware` + `OptionalJwt` + `IsAdmin` + `TripRoleMiddleware`
- [x] A0.5 OAuth LINE Login + Google → สร้าง/ผูก user → ออก JWT
- [x] A0.6 `pkg/store/store.go` pagination + `pkg/utils/*` ตาม template
- [x] A0.7 Redis client + rate limit middleware + cache helper (รวม FX cache helper)  ·  **หมายเหตุ:** gen 240/นาที, ai 12/ชม.; ไม่มี Redis = ข้ามการนับ (dev ไม่ต้องรัน container)
- [x] A0.8 `/healthz`, `/readyz`, request logger, CORS (allow WebBaseURL), Recover, Secure
- [x] A0.9 Dockerfile multi-stage + GitHub Actions (test/build/push **ECR**)  ·  **หมายเหตุ:** ci.yml: go build/vet/test -race, web typecheck/lint/test/build, playwright, docker compose boot, terraform fmt/validate · release.yml: OIDC → ECR → ECS UpdateService (เปลี่ยนจาก GHCR ตาม ADR 0004)
- [ ] A0.10 ~~Lightsail~~ **AWS ECS Fargate + ALB + autoscale ผ่าน Terraform** + domain + TLS ผ่านจริง  ·  **หมายเหตุ:** โค้ดครบแล้วและ `terraform validate` ผ่าน — `deploy/terraform/` (16 ไฟล์), `deploy/AWS_DEPLOY.md` (ขั้นตอน 16 ขั้น), ADR 0004 · **ยังไม่ได้ provision จริงบน AWS** ยังไม่มี account/DNS/secret ของจริง · ของเดิม (compose.prod, Caddyfile, deploy.sh, backup.sh) เลิกใช้แล้ว เก็บไว้อ้างอิงเฉย ๆ

### Web (`rove-web`)
- [x] W0.1 `pnpm create next-app@latest` (App Router, TS strict) + บันทึกเวอร์ชันใน Decision Log  ·  **หมายเหตุ:** Next 16.3.1 App Router + Turbopack, React 19.2.8, TS 5.9.3 strict — บันทึกใน §16
- [x] W0.2 Tailwind + shadcn/ui + lucide + `styles/brand.css` โดยใช้ค่า token จาก §15 ทันที (ไม่ใช้ placeholder)  ·  **หมายเหตุ:** `components/ui/*` เขียนเอง ไม่ได้ผ่าน shadcn CLI; Tailwind v4 `@theme inline` ใน `styles/brand.css` ไม่มี tailwind.config.js
- [x] W0.3 TanStack Query provider + devtools + default options §7.1
- [x] W0.4 `lib/api-client.ts` (fetch wrapper: base url, auth, error → typed) + `features/` skeleton  ·  **หมายเหตุ:** `features/*/queries.ts` 9 โมดูล + `lib/data/` แยก mock/live repo
- [x] W0.5 Auth flow: LINE/Google button → callback route → set httpOnly cookie → `useMe()`
- [x] W0.6 Zustand store สำหรับ UI state + next-intl + PostHog + flags  ·  **หมายเหตุ:** next-intl wire แล้ว — `i18n/request.ts` + plugin ใน next.config + `NextIntlClientProvider` ใน root layout · แท็บห้องทริปอ่าน label จาก `messages/th.json` เป็นตัวพิสูจน์ท่อ (ภาษาที่สองเริ่มจากตรงนั้น)
- [ ] W0.7 Vercel (หรือ container) deploy preview ต่อ PR  ·  **หมายเหตุ:** CI build ผ่านทุก PR แต่ยังไม่มี preview deploy ต่อ PR

### Data / Ops
- [x] D0.1 zone codes ญี่ปุ่นใน `pkg/domain/zones.go` (tokyo_east/west/bay, yokohama, kamakura, fuji, kawagoe, …)
- [x] D0.2 `data/poi/jp.csv` + validator + import command (`go run main.go seed:poi`)  ·  **หมายเหตุ:** คำสั่งเดียวคือ `go run . seed` (ทำทั้ง characters และ poi แบบ upsert)
- [ ] D0.3 seed POI ≥ 300 จุด (Disney, DisneySea, Tsukiji, Sensoji, Skytree, Ueno NM, Ameyoko, Akihabara, Kawagoe, Ikebukuro, Shinjuku, TeamLab Planets, Tokyo Tower, Takeshita, Shibuya Sky, Roppongi, Kamakura crossing, Enoshima, Cup Noodles, Red Brick, Chureito, Oishi Park, Oshino Hakkai ฯลฯ)  ·  **หมายเหตุ:** **91 / 300 จุด** — ต้องเติมอีก ~210
- [ ] D0.4 enrich จาก Google Places (place_id, lat/lng, open_hours) + cache  ·  **หมายเหตุ:** `services/places` + Redis cache 7 วัน พร้อมใช้ (AI tools / `POST /poi/resolve`) แต่ยังไม่มี enrich pass ย้อนกลับเข้า `pois`
- [ ] D0.5 `data/templates/` 3 แพลนต้นแบบ (Tokyo Base, Yokohama Base, +1)  ·  **หมายเหตุ:** `data/templates/` มีแต่ README — ยังไม่มีแพลนต้นแบบสักอัน
- [ ] D0.6 สมัคร affiliate (Agoda, Booking, Klook, KKday, Rentalcars, Airalo) + seed `affiliate_partners`  ·  **หมายเหตุ:** registry 6 เจ้าอยู่ใน `services/affiliate` (agoda, booking, klook, kkday, rentalcars, airalo) แต่ยังไม่ได้สมัครจริง จึงยังไม่มี tracking id
- [x] D0.7 **seed characters:** `data/characters.json` 20 ตัว (สัตว์น่ารัก/ตัวละคร ชื่อ + emoji + image_url placeholder) + `go run main.go seed:characters`  ·  **หมายเหตุ:** 20 ตัว + ภาพ `.webp` เจนจริงแล้ว (ไม่ใช่ placeholder)
- [x] D0.8 ADR แรก: stack, id strategy, deploy target  ·  **หมายเหตุ:** อยู่ใน §16 Decision Log

---

## 10. Phase 1 — MVP

**DoD:** กลุ่ม 4 คนสร้างทริปญี่ปุ่น ใส่ wishlist ทุกคน กด AI ร่างแพลน แก้ timeline ร่วมกัน เห็น **Budget ประมาณการ** และ **Expense จริงแบบ Shared/Personal** export/แชร์ลิงก์ กดปุ่มจองแล้ว track ได้ — ผู้ใช้มี character ประจำตัว มี dream list ส่วนตัว เห็น stats รวม — ทำงานจริงบน Lightsail

### M1 Entry Points

**ปรับใหม่ (route-first):** เดิมมี 4 ประตูและซ้ำกันเอง — "เริ่มจากเมือง" กับ "วางข้อความตั๋ว" ถามเรื่องเดียวกัน
และคำตอบแบบ chips เมือง ("โซล" + "อูเอโนะ") ตอบไม่ได้ว่ากี่ประเทศ กี่คืนต่อที่ และข้ามระหว่างกันยังไง —
แพลนจึงวางวันไม่ได้ ตอนนี้เหลือ **3 ประตูที่ไม่ทับกัน** เรียงตามสิ่งที่ผู้ใช้รู้แล้วจริง ๆ:

1. **รู้เที่ยวบินแล้ว (`route`)** — ใส่สนามบิน/วันบิน/เวลาถึง เช่น `BKK→NRT 4 ธ.ค. ถึง 08:05`,
   `NRT→BKK 10 ธ.ค. ถึง 22:05` แล้วค่อย ๆ เติมรายละเอียดทีหลัง · การวางอีเมลตั๋วเป็น **ทางลัดในประตูนี้**
   (เติม legs ชุดเดียวกัน) ไม่ใช่ประตูแยก
2. **รู้วันแล้ว (`date`)** — มีวันลาแล้ว ยังไม่รู้ปลายทาง → แนะนำปลายทางทีหลัง
3. **ยังไม่รู้วัน (`coordinate`)** — เข้า date board หาวันที่ตรงกันก่อน (M2.5)

- [x] A1.1 `POST /trips` รองรับ entry_type ('route'|'date'|'clone') + `flights[]`  ·  **หมายเหตุ:** analytics ยังนับ `coordinate` แยกจาก `date`; ถ้าส่ง `flights[]` มา frame (วัน/ปลายทาง/ประเทศ) มาจาก legs เสมอ
- [x] A1.2 `POST /ai/parse-ticket` → flights + suggested frame  ·  **หมายเหตุ:** เมืองปลายทางมาจาก airport index ทั้งโลกแล้ว ไม่ใช่ map 13 เมืองเดิม
- [x] **A1.3 airport index + route:** `GET /airports?q=` (สาธารณะ — ค้นทั้งโลกด้วยรหัส IATA / เมือง / ประเทศ ทั้งไทยและอังกฤษ), `GET /airports/:iata`, และ `GET|POST|PUT|PATCH|DELETE /trips/:id/flights` · frame ของทริป derive จาก legs (`pkg/domain/route.go` ↔ `lib/data/route.ts`)
- [x] W1.1 Landing 3 การ์ด (รู้เที่ยวบิน / รู้วัน / ยังไม่รู้วัน)
- [x] W1.2 Flow วัน: date range → party size → create → redirect
- [x] W1.3 Flow เที่ยวบิน: airport picker (ค้นทั้งโลก) → วันบิน/เวลาถึง → สรุปกี่คืนกี่ประเทศ → create
- [x] W1.4 วางข้อความตั๋ว: ทางลัดในประตู `route` — parse แล้วเติม legs ให้แก้ต่อได้
- [x] W1.5 Onboarding checklist ใน Overview (ชวนเพื่อน / ใส่ wishlist / กด AI)
- [x] X1.1 e2e: ทุก entry ได้ทริปใน ≤ 3 หน้าจอ  ·  **หมายเหตุ:** `e2e/trip-flow.spec.ts` ยืนยัน ≤ 3 หน้าจอ

**ทริปหลายประเทศ:** ทุก leg ที่ลงจอดเปิด "stop" หนึ่งจุด และ leg ถัดไปปิดมัน — จำนวนคืนต่อเมือง/ประเทศ
จึงคำนวณได้เสมอ ถ้ามีช่วงที่ไม่มี leg คร่อม (ลง ICN แต่เที่ยวถัดไปออกจาก NRT) UI จะเตือนให้เพิ่มขาระหว่างเมือง
ซึ่งเป็น **เที่ยวบินหรือ "ไปเอง (รถไฟ/รถ)"** ก็ได้ — ทั้งคู่นับเป็น leg เท่ากัน

### M2 Trip Room
- [x] A2.1 trip CRUD + flights + overview payload (counts, flags)
- [x] A2.2 invites: create/accept, role guard ครบทุก endpoint  ·  **หมายเหตุ:** สร้างลิงก์เชิญเป็น **owner เท่านั้น** ตาม §5.3 — ปิดช่องที่ editor ขยายสิทธิ์เขียนให้คนนอกได้เอง
- [x] A2.3 members list/patch/remove
- [x] A2.4 activity_logs + `GET /activity` (cursor)
- [x] A2.5 SSE hub (redis pubsub) + `GET /events` + emit helper ในทุก mutation
- [x] W2.1 Layout `/t/[tripId]` + tabs + mobile bottom nav (Overview|Wishlist|Plan|Budget|Expense|Prep|Bookings|Discussion)
- [x] W2.2 Overview: Trip Frame card, members (character avatar), สถานะ, quick actions
- [x] W2.3 Inline edit frame (optimistic)  ·  **หมายเหตุ:** รูปปกทริปแก้ได้แล้ว — ปุ่ม “เปลี่ยนรูปปก” บนรูปปกในห้องทริป → `components/trip/trip-cover-sheet.tsx` (คลังปก 15 แบบ หรืออัปโหลดเอง)
- [x] W2.4 Invite dialog + `/invite/[token]`
- [x] W2.5 Activity feed (infinite query)  ·  **หมายเหตุ:** API เป็น cursor แล้ว แต่ UI ยังดึงรอบเดียว ยังไม่ได้ต่อ infinite scroll
- [x] W2.6 `useTripEvents` hook → invalidate ตาม event type  ·  **หมายเหตุ:** `components/trip/trip-realtime.tsx` + `lib/sse.ts`
- [x] W2.7 Empty/loading/error states ทุก tab

### M2.5 นัดวัน (ทำเกินสเปค — ไม่มีในเช็กลิสต์เดิม)

ทางเข้า `entry_type='coordinate'`: กลุ่มที่ยังไม่รู้ว่าไปวันไหนได้ ทุกคนกาวันว่าง
ระบบหาช่วงที่ทับกันมากที่สุด แล้วค่อยล็อกวันและเลือกปลายทาง

- [x] A2.5a migration: `availabilities`, `availability_submissions`
- [x] A2.5b `pkg/domain/dates.go` (หา window ที่คนว่างมากที่สุด, จัดอันดับปลายทางตาม fit) + tests
- [x] A2.5c `GET /dates/board|windows|destinations`, `PUT /dates/availability`, `POST /dates/submit|destination`, `POST|DELETE /dates/lock` (ล็อก = owner)
- [x] W2.5a Date board + availability calendar + step bar + destination picker
- [x] W2.5b analytics: `availability_marked`, `availability_submitted`, `dates_locked`, `destination_chosen`
- [x] X2.5 e2e `e2e/date-coordination.spec.ts`

### M3 Wishlist & Coverage
- [x] A3.1 member_profiles GET/PUT  ·  **หมายเหตุ:** ตาราง `member_profiles` (PK รวม trip_id+user_id) + `GET|PUT /trips/:id/profile/me` + `GET /trips/:id/profiles` — ฟอร์ม "สไตล์เที่ยวของคุณ" อยู่บนแท็บที่อยากไป (pace/เดิน/งบ/อาหาร/ขับรถ) · โปรไฟล์ระดับ user (`PATCH /users/me`) ยังอยู่แยกกัน
- [x] A3.2 wishlist CRUD (เขียนได้เฉพาะของตัวเอง ยกเว้น owner)
- [ ] A3.3 AI normalize wishlist (job) → tags + poi_id  ·  **หมายเหตุ:** มีแค่ค่าคงที่ `AIKindNormalize` — ยังไม่มี job ที่รันจริง (ตอนนี้ match ด้วย `domain.NormalizeName` ตอน generate แทน)
- [x] A3.4 `pkg/domain/coverage.go` + unit tests + `GET /coverage`
- [x] A3.5 recompute coverage หลัง items เปลี่ยน (hook ใน service layer)  ·  **หมายเหตุ:** คำนวณสดตอนอ่าน `GET /coverage` แทน hook หลัง mutation — ผลลัพธ์เท่ากันและไม่มีทางค้างไม่ตรง
- [x] W3.1 Profile form
- [x] W3.2 Wishlist editor (must/nice/avoid, tags, reorder, delete)
- [x] W3.3 Coverage Board (✅/⚠️/❌ + note + ลิงก์ไป item)
- [x] W3.4 แสดง "ใครยังไม่ใส่ wishlist" ใน Overview

### M4 AI Planner
- [x] A4.1 `services/ai` skeleton: client, schemas, prompts, token accounting
- [x] A4.2 tools: lookup_poi, get_poi, distance (Google + redis cache), weather, fx
- [x] A4.3 buildFrame (anchors: flights, prepaid stay, dated must-do, zones)
- [x] A4.4 generatePlan → PlanDraft (1 variant)  ·  **หมายเหตุ:** ไม่มีคีย์ = โหมด simulate ให้ผลแบบ deterministic (ใช้ใน UAT/e2e)
- [x] A4.5 `pkg/domain/validate.go` (closed day, นอกเวลาเปิด, วันยาวเกิน, travel ไม่สมจริง, must-do หาย, POI ซ้ำ) + tests  ·  **หมายเหตุ:** `validate_test.go` ครอบทุกกฎ + เวลาข้ามเที่ยงคืน + เวลาเปิดที่ parse ไม่ได้ต้องไม่เตือนมั่ว
- [ ] A4.6 repairPlan (≤2 loops)  ·  **หมายเหตุ:** ยังไม่ได้ทำ — pipeline validate แล้วเขียน warning ลง note ไม่ได้ป้อนกลับให้โมเดลแก้
- [x] A4.7 explainPlan → rationales + open_questions
- [x] A4.8 persistPlan ใน transaction + item_versions  ·  **หมายเหตุ:** persist ผ่าน transaction ใน `store/plan` + `AddVersion` ทุกครั้ง
- [x] A4.9 ai_jobs + redis queue + worker pool + SSE progress
- [ ] A4.10 refinePlan → ItemDiff[] + `apply-diff`  ·  **หมายเหตุ:** ยังไม่ได้ทำ
- [x] A4.11 rate limit + cost cap ต่อ trip/วัน  ·  **หมายเหตุ:** rate limit 12/ชม. + ระบบเครดิต (`ai_credits`) ฟรี 2 ครั้ง/ทริป
- [ ] A4.12 eval set 5 ทริป (`services/ai/evals`) วัด schema pass / coverage% / issues / latency  ·  **หมายเหตุ:** ยังไม่มี `services/ai/evals`
- [x] W4.1 ปุ่ม "ให้ AI ร่างแพลน" + progress steps (จาก SSE)
- [x] W4.2 Rationale panel + Open questions (ตอบ → ส่ง refine)  ·  **หมายเหตุ:** rationale + open questions แสดงครบ แต่ยังตอบกลับเพื่อ refine ไม่ได้ (ผูกกับ A4.10)
- [ ] W4.3 Refine chat + **Diff preview UI** (accept ทั้งหมด/รายรายการ)  ·  **หมายเหตุ:** ยังไม่ได้ทำ — ขึ้นกับ A4.10
- [x] A4.11a เครดิต AI (ทำเกินสเปค): ตาราง `ai_credits`, ฟรี 2 ครั้ง/ทริป แล้วจ่ายด้วยแต้ม/เงิน, `GET /ai/credits` + `POST /ai/credits/purchase` (§16)
- [x] W4.1a เครดิต AI (ทำเกินสเปค): `ai-credit-panel.tsx` — เหลือกี่ครั้ง / ซื้อเพิ่ม

### M5 Itinerary Editor
- [x] A5.1 day/item CRUD + move (คำนวณ sort_order) + undo จาก item_versions
- [x] A5.2 `GET /plans/:id` payload เดียวจบ (days+items+rationales+warnings)
- [x] A5.3 `POST /pois/resolve` (google maps url / place_id / text)
- [x] W5.1 Plan tab: day tabs + timeline card (เวลา, ชื่อ, POI badge, cost, booking, verified)
- [x] W5.2 Add item: search POI (debounced) / paste maps url / free text
- [x] W5.3 Edit item sheet (ครบทุกฟิลด์ §4.2)
- [x] W5.4 dnd-kit reorder + ข้ามวัน + optimistic + rollback  ·  **หมายเหตุ:** dnd-kit + optimistic + rollback
- [x] W5.5 Delete + undo
- [x] W5.6 List view (print-friendly)  ·  **หมายเหตุ:** ใช้ HTML จาก `/export` เปิดแท็บใหม่แล้วสั่งพิมพ์
- [x] W5.7 Version snapshot + ดูประวัติ
- [x] W5.8 Warning badge จาก `/validate`
- [ ] X5.1 ทดสอบ dnd บนมือถือจริง (iOS Safari + Android Chrome)  ·  **หมายเหตุ:** ยังไม่ได้ทดสอบบนเครื่องจริง — Playwright ครอบ webkit ไว้แล้วแต่ไม่ใช่ touch จริง

### M7 Budget (ประมาณการจาก plan items)
- [x] A7.1 `pkg/domain/budget.go` (category rollup, per_person/group/night, prepaid แยก, FX) + tests  ·  **หมายเหตุ:** `budget_test.go` ครอบทุก basis + prepaid/remaining + ปัดเศษ + party size 0 + FX rate 0
- [x] A7.2 `GET /plans/:id/budget` + FX service (cache รายวันจาก API) + override manual
- [x] W7.1 Budget tab: ตาราง category × (JPY, THB, ต่อคน) + total + prepaid + เทียบงบที่ตั้งไว้ + label "ประมาณการ"
- [x] W7.2 Highlight item ที่ยังไม่มี cost
- [x] W7.3 Budget ส่วนตัว (per_person) + tooltip อัตราแลกเปลี่ยนโดยประมาณ ณ วันที่

### M8 Prep
- [x] A8.1 weather service (Open-Meteo) + cache → prep block  ·  **หมายเหตุ:** weather (Open-Meteo) + cache เข้าไปที่ plan day — ยังไม่ได้ทำเป็น prep block แยก
- [ ] A8.2 packing generator (rule จาก temp band + tags) + AI เสริมข้อความ  ·  **หมายเหตุ:** packing template เป็นรายการคงที่ ยังไม่ได้ผูกกับ temp band หรือ tags
- [x] A8.3 docs checklist default (passport, Visit Japan Web, insurance, eSIM, IDP ถ้ามีรถ)  ·  **หมายเหตุ:** passport, Visit Japan Web, ประกัน, eSIM ครบ
- [x] W8.1 Prep tab + checklist ติ๊กร่วมกัน (optimistic + SSE)
- [x] W8.2 Custom block (markdown)

### M9 Collaboration
- [x] A9.1 comments CRUD (thread 1 ชั้น) + emit SSE
- [x] W9.1 Comment thread บน item/day/plan + Discussion tab
- [x] W9.2 Viewer mode + ปุ่ม "เข้าร่วมทริป"

### M10 Share & Export
- [x] A10.1 visibility private/link + share_token + `GET /public/plans/:token` (ซ่อน expense payload เสมอ)  ·  **หมายเหตุ:** public payload ไม่มี expense — มีเทสต์คุมใน `pkg/handlers/api/tests`
- [ ] A10.2 export job: render HTML (Go template self-contained) → R2 → signed url  ·  **หมายเหตุ:** export ตอบ HTML self-contained ตรง ๆ ยังไม่ได้ทำเป็น job → R2 → signed url
- [x] A10.3 export PDF (chromedp/gotenberg) — บันทึกทางเลือกที่เลือกใน Decision Log  ·  **หมายเหตุ:** เลือก **print dialog ของเบราว์เซอร์** แทน chromedp/gotenberg — บันทึกใน §16
- [x] W10.1 Share dialog + copy link
- [x] W10.2 `/s/[token]` view page (noindex)
- [x] W10.3 ปุ่ม export + สถานะ job + ดาวน์โหลด
- [x] W10.4 OG image พื้นฐาน  ·  **หมายเหตุ:** `public/brand/og-default.png` (static) ยังไม่ได้ทำแบบ per-trip

### M12 Booking (stay + activity)
- [x] A12.1 `services/affiliate`: partner registry + `BuildDeepLink(partner, item, trackingID)`
- [x] A12.2 `POST /items/:id/booking-link` + `GET /go/:trackingId` (302 + log click + บันทึก source_creator_id ถ้ามี)
- [x] A12.3 partner selection rule (poi.partner_links → type-based priority)
- [x] A12.4 booking-status manual + `GET /trips/:id/bookings`
- [ ] A12.5 generic confirmations importer (CSV) + webhook skeleton + award points เมื่อ confirmed  ·  **หมายเหตุ:** ยังไม่ได้ทำ — ผูกกับ D0.6 (ต้องมีบัญชี partner จริงก่อน)
- [x] W12.1 ปุ่มจองบน item card + สถานะ
- [x] W12.2 Bookings tab (กรองตาม type/สถานะ)

### M13 Admin
- [ ] A13.1 admin guard + POI CRUD + CSV import + character management  ·  **หมายเหตุ:** admin guard + POI CRUD + character management ครบ — **ยังไม่มี CSV import ผ่าน API** (ตอนนี้ import ได้ทาง `go run . seed` เท่านั้น)
- [x] A13.2 dashboard endpoints (trips, ai cost, clicks, confirmations, points issued)
- [x] W13.1 หน้า admin ง่าย ๆ (table + form)
- [x] A13.2b feature flags table/env  ·  **หมายเหตุ:** `lib/flags.ts` (planVariants, publicExplore ปิดไว้) + env

### M14 Widget Character (NEW — ง่าย)
- [x] A14.1 seed 20 characters จาก `data/characters.json` → ตาราง `characters`
- [x] A14.2 `GET /api/v1/characters` + `PATCH /api/v1/users/me/character {character_id}`  ·  **หมายเหตุ:** อยู่รวมใน `PATCH /users/me {character_id}` ไม่ได้แยก endpoint
- [x] A14.3 migration: เพิ่ม `character_id` ใน `users` (nullable, FK)
- [x] W14.1 Character picker dialog ใน profile setup + settings
- [x] W14.2 แสดง character แทน avatar ใน member list, activity feed, comment (ถ้าไม่มี avatar_url จาก OAuth)
- [ ] W14.3 Character เป็น option ใน onboarding step แรก ("เลือกตัวละครของคุณ")  ·  **หมายเหตุ:** ยังไม่มีหน้า onboarding — เลือกตัวละครได้จาก `/profile` เท่านั้น

### M15 Dream Trip — Bucket List (NEW — ง่าย)
- [x] A15.1 migration: ตาราง `dream_items`
- [x] A15.2 dream CRUD + reorder endpoints (§5.2)  ·  **หมายเหตุ:** CRUD ครบ — ยังไม่มี endpoint reorder แยก (เรียง `sort_order` ผ่าน PATCH ได้)
- [x] W15.1 Dream list ใน `/profile` — cards ที่อยากไป (ชื่อ, ปลายทาง, url, notes)
- [x] W15.2 Add dream dialog: ชื่อ, ปลายทาง, วาง URL ได้, โน้ต
- [x] W15.3 ปุ่ม "เริ่มแพลนทริปนี้" จาก dream item → pre-fill city ใน Entry flow (M1)
- [x] W15.4 Dream list ใน Home Dashboard (M18) — แสดง 3 อันดับแรก

### M16 Expense Tracking — Shared / Personal (NEW — กลาง)
- [x] A16.1 migration: ตาราง `expense_entries`
- [x] A16.2 `pkg/domain/expense.go`: คำนวณ per-member (shared หารตาม participants), personal แยก, FX conversion + tests  ·  **หมายเหตุ:** มี unit test
- [x] A16.3 expense CRUD endpoints + summary endpoint (§5.7)
- [x] A16.4 emit SSE `expense.created` / `expense.updated` หลังทุก mutation
- [x] W16.1 **Expense tab** แยกจาก Budget tab ชัดเจน
- [x] W16.2 Add expense form: ชื่อ, จำนวน, สกุลเงิน, category, Shared/Personal toggle, เลือกว่าใครร่วมหาร (ถ้า shared)
- [x] W16.3 Summary: รายคน (ใครจ่ายไปเท่าไหร่, ใครเป็นหนี้ใคร), total รวม  ·  **หมายเหตุ:** ชื่อฟีเจอร์ **น้องหาร** (§16)
- [x] W16.4 แสดง label "อัตราโดยประมาณ ณ [date]" ทุกที่ที่แปลงสกุลเงิน
- [x] W16.5 ตั้งค่า privacy: Expense tab ซ่อนเสมอใน public view (toggle ปิดไม่ได้ — เป็น UX default ที่ชัดเจน)

### M17 Home Dashboard + Stats + Calendar (NEW — ง่าย)
- [x] A17.1 `GET /api/v1/users/me/stats` — aggregate จาก trips (status='done'|'planning'), expense_entries
- [x] A17.2 `GET /api/v1/users/me/calendar` — upcoming trips sorted by start_date + ต่อ trip ดึง weather snippet  ·  **หมายเหตุ:** แยกเป็น `/users/me/trips/upcoming` + `/trips/past`
- [x] W17.1 `/home` page: upcoming trips (calendar strip + days until), past trip recap cards, dream list preview, points balance
- [x] W17.2 Stats widget: ปีนี้ไปกี่ทริป / กี่วัน / กี่ประเทศ / ใช้เงินรวมเท่าไหร่ (THB โดยประมาณ)
- [x] W17.3 Calendar view: trip bars บน calendar + weather ปลายทาง  ·  **หมายเหตุ:** เป็น calendar strip พร้อมอากาศ ยังไม่ใช่ตารางปฏิทินเต็มเดือน
- [x] W17.4 Points balance display + history link
- [x] A17.4 `GET /trips/:tripId/recap` — บันทึกทริปที่จบแล้ว: decisions (วันที่ล็อก, ปลายทาง, งบ, เหตุผลที่ AI จัดแบบนั้น, สิ่งที่จองจริง, ผลโหวต) + itinerary + spending แยกหมวด + share state · derive จากตารางเดิมทั้งหมด ไม่เก็บสำเนา
- [x] W17.5 `/recap/[tripId]` — หน้าอ่านอย่างเดียว: การ์ดทริปที่ผ่านมาใน `/home` และ `/trips` กดเข้าได้
- [x] W17.6 ปุ่ม "เปิดเป็นสาธารณะ" บนหน้าบันทึกทริป พร้อมอธิบายแต้ม/ส่วนลด (§6.5) — ทริปที่เปิดแล้วโชว์ลิงก์ `/p/[slug]` + ยอดดู/ยอดก๊อป แทนการชวนซ้ำ

### M20 บิลและการชำระเงิน (NEW — ต่อยอดจากเครดิต AI §16)
- [x] A20.1 ตาราง `orders` + `subscriptions` (§4.2) + migration `202608210000_billing`
- [x] A20.2 `store/billing` — เลขใบเสร็จ `RV-{ปีพ.ศ.}-{ลำดับ 6 หลัก}` ออกใน transaction + uniq index กันเลขซ้ำ (ชนแล้ว retry 1 ครั้ง)
- [x] A20.3 `pkg/domain/billing.go` — kind/status/method, `PayChannels` (id + label), catalogue แพ็กเกจ, `ReceiptNumber()`
- [x] A20.4 `GET /users/me/billing/{summary,orders,orders/:id,subscription,plans}` (§5.15) — อ่านอย่างเดียว
- [x] A20.5 `POST /ai/credits/purchase` ออกใบเสร็จทุกครั้ง (`recordOrder`) + รับ `method` แทนการเดาจากข้อความ
- [x] A20.6 test: ใบเสร็จของคนอื่นอ่านไม่ได้ (404), จ่ายด้วยแต้มไม่นับเป็นเงินสด, สรุปนับ "ครั้ง" ไม่ใช่ "บิล"
- [x] W20.1 `/billing` — แพ็กเกจปัจจุบัน + แพ็กเกจที่จะเปิดขาย + สรุปยอด + ประวัติแยกตามปี พ.ศ.
- [x] W20.2 แถว "บิลและการชำระเงิน" ในเมนูโปรไฟล์ (พร้อมจำนวนใบเสร็จ) + `/billing` เข้ากำแพง sign-in
- [x] W20.3 `/billing/[orderId]` — ใบเสร็จเต็มใบ สั่งพิมพ์/บันทึก PDF ได้จากหน้าเดียวกัน (`print:` utilities ไม่ใช่หน้า printable แยก)
- [x] W20.4 หลังจ่ายในกล่อง AI ขึ้นลิงก์ "ดูใบเสร็จ RV-…" ทันที + เลือกช่องทางชำระก่อนกดจ่าย
- [ ] A20.7 payment gateway จริง (Omise/Stripe) — เขียน `provider`/`provider_ref`, เอา `simulated` ออก, เปิด `status='pending'`
- [ ] A20.8 subscription จริง: checkout, webhook renewal → ออก order `kind='subscription'` ต่อรอบ, cancel/resume, โควตาร่างรายเดือน
- [ ] W20.5 หน้าเลือกแพ็กเกจ + วิธีจ่ายที่บันทึกไว้ (ทำพร้อม A20.7/A20.8)

### Cross-cutting
- [ ] X.1 e2e: create → invite 2 users → wishlist → generate → edit → budget → add expense → share → book click  ·  **หมายเหตุ:** `e2e/trip-flow.spec.ts` ครอบ create → wishlist → generate → budget → expense → share → prep แล้ว — **ยังขาด invite 2 คน, edit timeline, book click** และรันบน mock mode ไม่ใช่ API จริง
- [ ] X.2 Perf: Trip Room LCP < 2.5s บน 4G; plan 7 วัน × 10 items ลื่นบนมือถือ  ·  **หมายเหตุ:** ยังไม่ได้วัด
- [x] X.3 Security: integration test cross-trip access ทุกกลุ่ม endpoint + ตรวจ expense ไม่หลุด public payload + ตรวจ secret ไม่หลุด client bundle  ·  **หมายเหตุ:** `pkg/handlers/api/tests/authorization_test.go` — outsider/anonymous/viewer/editor/non-admin/token ปลอม ครบทุกกลุ่ม endpoint + `routes_test.go` เดินตาราง route + เทสต์ public payload ไม่มี expense
- [x] X.4 Analytics events §13 ครบ  ·  **หมายเหตุ:** `lib/analytics.ts` ประกาศครบทุก event ใน §13 เป็น typed map
- [ ] X.5 Backup/restore ทดสอบจริง 1 รอบ  ·  **หมายเหตุ:** `deploy/backup.sh` พร้อม แต่ยังไม่ได้ทดสอบ restore จริง
- [ ] X.6 Closed beta 10–20 กลุ่ม + feedback log  ·  **หมายเหตุ:** ยังไม่ได้เริ่ม

---

## 11. Phase 2 — V1 (Variants, Public + Points, Photos, Documents, Community)

### Plan Variants & Compare
- [x] A6.1 create variant (fork จาก day index) + key_decision  ·  **หมายเหตุ:** variant = snapshot ทั้งก้อนในตาราง `plan_variants` (JSON shape เดียวกับ AI draft) — อ่านอย่างเดียว เทียบ/โหวต/adopt ไม่แก้ในตัว · `POST /trips/:id/variants` fork แพลนปัจจุบัน + `from_day_index` บันทึกจุดแตก (Decision Log 24 ส.ค.)
- [x] A6.2 AI multi-variant (2–3 ตาม key decision candidates)  ·  **หมายเหตุ:** `POST /trips/:id/variants/generate` — job เดียวรัน pipeline 2–3 รอบ (สมดุล/สายชิล/จัดเต็ม — pace เปลี่ยน itemsPerDay จริง) ใช้เครดิตตามจำนวนแบบ ตรวจโควตาก่อนเริ่ม
- [x] A6.3 compare metrics (cost, per person, travel รวม, coverage%, POI count, warnings)  ·  **หมายเหตุ:** อยู่ใน `GET /trips/:id/variants` — ทุก variant + แพลนปัจจุบันถูกให้คะแนนด้วย `domain.ComputeVariantMetrics` ชุดเดียวกัน (มี unit test)
- [x] A6.4 votes + freeze plan  ·  **หมายเหตุ:** โหวตใช้ตาราง votes เดิม (`target_type='variant'`, กดซ้ำ = ถอน) · freeze = `POST|DELETE /trips/:id/plan/freeze` [owner] → trip.status='final' + middleware `PlanUnfrozen` กัน item/undo/apply/adopt ตอบ 409
- [x] A6.5 conflict detector (pace/budget/must-do ชนกัน) ก่อน generate  ·  **หมายเหตุ:** `GET /trips/:id/conflicts` — `domain.DetectConflicts` อ่าน member_profiles (A3.1) + wishlist: pace ชิลชนจัดเต็ม, งบไม่ทับกัน, must ชน avoid (มี unit test)
- [x] W6.1 Compare page (metrics table + parallel timeline + pros/cons)  ·  **หมายเหตุ:** `/t/[tripId]/plan/compare` — ตารางเทียบ + การ์ดต่อ variant (pros/cons, ไทม์ไลน์กางได้) + ปุ่มร่าง 2/3 แบบ + เก็บแพลนปัจจุบันก่อนสลับ + แบนเนอร์ conflicts
- [x] W6.2 Vote UI + freeze  ·  **หมายเหตุ:** thumbs up/down ต่อ variant (patch cache ไม่รีโหลดตาราง), ปุ่ม "ตกลงตามนี้ — สรุปแพลน" [owner] + แบนเนอร์ล็อกบนแท็บแพลน · mock/live ทำงานครบทั้งคู่

### Public Model + Points
- [ ] A10.4 publish flow: slug + privacy opts + `GET /public/plans/:slug` (expense hidden ทุกกรณี)
- [ ] A10.5 เมื่อ owner กด publish → แสดง modal อธิบาย "เปิด public = ได้แต้มเมื่อคนจองตาม" + confirm
- [ ] A11.1 `POST /trips/:id/clone` (reset booking/cost_status, source_trip_id/creator, counters)
- [ ] A11.2 `GET /public/explore` filters + sort + index ที่จำเป็น
- [ ] A12.6 `booking_confirmations` → award points ให้ source_creator_id (§6.5)
- [ ] A12.7 `GET /users/me/points` + `/history` + แสดงบน profile
- [ ] W10.5 Public plan page (ISR + SEO + OG) + ปุ่ม Clone + ปุ่มจอง (expense section ไม่โชว์)
- [ ] W11.1 `/explore` + filters + infinite scroll
- [ ] W11.2 Creator profile `/u/[handle]` + แต้มที่เคยได้

### Travel Photo Feature
- [ ] A18.1 migration: ตาราง `trip_photos`, S3 upload config (R2 photo bucket)
- [ ] A18.2 photo upload endpoint (resize/compress ก่อน store) + delete
- [ ] A18.3 `GET /trips/:tripId/photos?poi_id=` — photos ที่ POI นั้นในทริปนี้
- [ ] A18.4 photobook export job: เรียง photos ตาม day/poi → render HTML template → PDF/Ebook via gotenberg → R2
- [ ] W18.1 **Photos tab** ใน trip room — grid รวมทุกรูปในทริป (กรองตาม day, สมาชิก)
- [ ] W18.2 **Photo ที่ item card** — เมื่อ item มี photos → แสดง thumbnail strip + ปุ่ม upload
- [ ] W18.3 **POI Photo Grid** (IG-style) — เมื่อเปิด item/POI detail เห็นรูปทั้งหมดที่ถ่ายที่นั้นใน trip นี้ (แบบ Map pin + grid ใน ref image)
- [ ] W18.4 ปุ่ม "สร้าง Travel Photo Book" → เลือก format (PDF/Ebook) → download link
- [ ] W18.5 Photo Book แนบกับ profile creator (แสดงใน `/u/[handle]`)
- [ ] X18.1 ทดสอบ upload image บนมือถือ + preview ลื่น

### Document Folder
- [ ] A19.1 migration: ตาราง `trip_documents`, R2 document bucket
- [ ] A19.2 document upload (accept: PDF, image, common docs) + delete
- [ ] W19.1 **Documents tab** ใน trip room — list ไฟล์แยก category (ตั๋ว/โรงแรม/transport/อื่นๆ)
- [ ] W19.2 Upload dialog: เลือกไฟล์ + ตั้งชื่อ + เลือก category
- [ ] W19.3 Preview inline สำหรับ image + ปุ่ม download

### AI & Itinerary Enhancements
- [ ] A4.13 auto-fix suggestion จาก issues ("ให้ AI แก้")
- [ ] A4.14 partner_price_hint tool → แสดง "จาก ¥…"
- [ ] A5.4 auto travel_min เมื่อ move + warning ไปไม่ทัน/ร้านปิด
- [ ] W5.9 Map view (Google Maps JS): pins ตามวัน + polyline (static — ไม่ใช่ realtime nav)

### More Phase 2
- [ ] A8.4 rule blocks trigger จาก item (car → IDP/ETC/snow tires, themepark, onsen, rail pass)
- [ ] A9.2 mentions + notification inbox + LINE Messaging notify
- [ ] A9.3 tasks (assign/due/done), polls
- [ ] W9.3 presence/typing indicator (SSE)
- [ ] D2.1 seed 20–30 public plans จากทีม/อินฟลูฯ ก่อนเปิด
- [ ] A12.8 เพิ่ม partner: car rental, eSIM, insurance, flight
- [ ] A12.9 postback จริงตาม partner ที่ approve

---

## 12. Phase 3 — V2

- [ ] A11.3 `pkg/domain/match.go` match score (dates, budget, tags, party) + `GET /explore?match=`
- [ ] A11.4 clone + AI auto-adapt (วัน/คน/งบต่าง) + diff preview
- [ ] A11.5 reviews + actual budget post-trip
- [ ] W10.6 Trip Mode `/t/[id]/now` (วันนี้/ถัดไป, กด navigate → Google Maps, PWA offline cache)
- [ ] W10.7 export .ics + IG story image (1:1 สรุปทริป)
- [ ] A16.5 Expense settle-up จริง (คำนวณใครโอนใคร ขั้นต่ำสุด)
- [ ] A12.10 Points redemption: ออก discount code ใช้ลด booking ใน ROVE
- [ ] A12.11 creator revenue share ledger + payout report (Points → THB ถ้า scale)
- [ ] A12.12 agent lead handoff (form → email/LINE partner + tracking)
- [ ] Photo Book V2: auto-layout, cover design, custom theme
- [ ] I18N: EN + ประเทศที่ 2 (KR/TW): zones, POI, prep rules
- [ ] INFRA: ย้าย MySQL ไป managed DB / แยก AI worker เป็น service แยก

---

## 13. Analytics Events (PostHog)

**Trip & Plan:**
`trip_created {entry_type}`, `member_invited`, `member_joined`, `wishlist_item_added {kind}`, `profile_completed`,
`ai_generate_started/finished {ms,tokens,issues}`, `ai_refine_applied {diff_count}`, `item_added/moved/deleted {source}`,
`plan_variant_created`, `vote_cast`, `plan_frozen`, `budget_viewed`, `export {format}`, `share_link_created`, `trip_published {has_points_incentive}`,
`public_plan_viewed {slug}`, `trip_cloned`, `booking_click {partner,item_type}`, `booking_marked`, `booking_confirmed {partner,amount}`

**ROVE Personal Features:**
`character_selected {character_id}`, `dream_item_added`, `dream_item_converted_to_trip`,
`billing_viewed {orders}`, `receipt_viewed {kind}`, `ai_credits_purchased {quantity,channel}`,
`expense_added {split_type,category}`, `expense_summary_viewed`,
`photo_uploaded {from_item}`, `photobook_export_started {format}`, `photobook_downloaded`,
`document_uploaded {category}`,
`points_earned {amount}`, `points_balance_viewed`, `home_dashboard_viewed`, `calendar_viewed`,
`trip_recap_viewed {has_decisions}`

**Funnels:**
- Core: `trip_created → wishlist_item_added(≥1) → ai_generate_finished → item_moved(≥1) → share_link_created|trip_published → booking_click`
- Personal: `character_selected → dream_item_added → dream_item_converted_to_trip`
- Memory: `photo_uploaded(≥3) → photobook_export_started → photobook_downloaded`

---

## 14. Environment Variables

### API (`.env`)
```
ENV=development
PORT=5000
APP_BASE_URL=https://api.rove.app
WEB_BASE_URL=https://rove.app
JWT_SECRET_KEY=

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USERNAME=root
MYSQL_PASSWORD=
MYSQL_DATABASE=rovedb

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

ANTHROPIC_API_KEY=
AI_MODEL_PLANNER=
AI_MODEL_FAST=
AI_MAX_TOKENS=8000
AI_DAILY_COST_CAP_USD=

GOOGLE_MAPS_SERVER_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_MESSAGING_TOKEN=

OPEN_METEO_BASE=https://api.open-meteo.com
FX_API_URL=
FX_API_KEY=
FX_CACHE_TTL_HOURS=24

R2_ENDPOINT=
R2_REGION=auto
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_EXPORT_BUCKET=rove-exports
R2_IMAGE_BUCKET=rove-images
R2_DOCUMENT_BUCKET=rove-documents
R2_PHOTO_BUCKET=rove-photos

AFFILIATE_AGODA_ID=
AFFILIATE_BOOKING_AID=
AFFILIATE_KLOOK_AID=
AFFILIATE_KKDAY_ID=
AFFILIATE_RENTALCARS_ID=
AFFILIATE_AIRALO_ID=
ADMIN_EMAILS=

POINTS_EARN_RATE_PCT=25
POINTS_MIN_REDEEM=100
```

### Web (`.env.local`)
```
NEXT_PUBLIC_APP_URL=https://rove.app
NEXT_PUBLIC_API_URL=https://api.rove.app
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
NEXT_PUBLIC_BRAND_NAME=ROVE
AUTH_COOKIE_NAME=rove_token
AUTH_COOKIE_DOMAIN=rove.app
```

---

## 15. BRAND — ROVE ✅

### ชื่อและความหมาย
- **ชื่อ product:** ROVE
- **Tagline:** ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว
- **env:** `NEXT_PUBLIC_BRAND_NAME=ROVE`

### โลโก้
- **Wordmark:** `R✳VE` — ตัว O แทนด้วย asterisk 8 กลีบ (เข็มทิศ + ดอกไม้)
- **Logo file:** `public/brand/logo.svg` (custom SVG — ห้ามใช้ Unicode ✳ เพราะ render ไม่คม)
- **Logo variants:** 3 สี — ใช้ variant ตามพื้นหลัง:
  - Default (light bg): espresso body `#3D2B24` + terracotta asterisk `#D9714E`
  - Dark bg: white body + terracotta asterisk
  - Monochrome: espresso ทั้งหมด
- **App icon / favicon:** asterisk เดี่ยว terracotta บน cream circle
- **รูปทรงจริงที่ใช้:** เข็มทิศ 8 แขน **ปลายมน** (แขนแนวตั้ง/แนวนอนยาวกว่าแนวทแยง เพื่อให้อ่านเป็นเข็มทิศ ไม่ใช่เกล็ดหิมะ)
- **Implementation:** wordmark เป็น React component (`components/brand/rove-logo.tsx`) = ตัวอักษร Inter ExtraBold + mark SVG — ไม่ใช่ไฟล์ภาพ จะได้คมทุกขนาด
- **Gimmick:** 8 ทิศ = infinite directions = การเดินทางที่ไม่ตายตัว

### Color Tokens (`styles/brand.css`)
```css
:root {
  /* Primary — ใช้เฉพาะ action / highlight เท่านั้น ไม่ใช่สีพื้น */
  --brand-primary:        15 65% 58%;   /* #D9714E cha thai terracotta */
  --brand-primary-light:  15 65% 70%;   /* #E49A81 terracotta light */
  --brand-primary-fg:     0  0%  100%;  /* white text on primary */

  /* Base */
  --brand-espresso:       17 26% 19%;   /* #3D2B24 black coffee — ตัวอักษรทั้งหมด */
  --brand-bg:             0  0%  100%;  /* white page */
  --brand-surface:        30 10% 96%;   /* neutral card บนพื้นขาว */
  --brand-muted:          22 18% 43%;   /* #6B5B4E secondary text */
  --brand-border:         30 8%  90%;

  /* Form field — ไม่ยืมสีพื้นของสิ่งที่มันวางอยู่ ขาวเสมอ + มีเส้นขอบเสมอ */
  --brand-field:          0  0%  100%;
  --brand-field-border:   26 14% 82%;   /* #D8D0CB เห็นชัดทั้งบนขาวและบน surface */

  /* Accent palette — colour block ของ component (tint ทับขาวเอา ไม่มี hex ชุดสอง) */
  --brand-matcha:         137 36% 65%;  /* #8BC99A success / nature */
  --brand-sky:            207 68% 81%;  /* #A8D4F0 info / calm */
  --brand-sun:            52  82% 68%;  /* #F0E06B warning / happy */
  --brand-joyfull:        260 37% 80%;  /* #C4B8E8 playful / secondary */
}
```
> Card ใช้ accent tint ที่ `/55` (matcha/sky/sun/joyfull) และ `/12` สำหรับ primary — ห้ามเขียน pastel hex ชุดใหม่
> Shadcn CSS vars mapping: ตั้งค่าใน `globals.css` ให้ `--primary` = `--brand-primary`, `--background` = `--brand-bg` ฯลฯ

### Typography
- **ทั้งเว็บใช้ Inter** (Google Fonts) — Regular → ExtraBold ทั้ง heading และ body
- **ภาษาไทย:** Inter ไม่มี glyph ไทย → fallback เป็น **Noto Sans Thai** (จับคู่ x-height/น้ำหนักแล้ว) — stack อยู่ใน `--brand-font-sans`
- **ตัวเลข:** ใช้ Inter + `.nums` (`font-variant-numeric: tabular-nums`) ทุกที่ที่เป็นเงิน/เวลา/จำนวน — ไม่มี mono font แยก
- **Type scale:** ยึด Tailwind default (`text-xs` → `text-5xl`)

### Visual Direction
- **Mood:** Bright · Playful · Colorful — สะอาดตา อ่านง่าย ไม่ใช่ corporate dashboard และไม่ใช่กระดาษสา
- **Background:** **ขาวล้วน** — ความต่างของพื้นที่มาจาก colour block ไม่ใช่ texture
- **Border radius:** 24px (`--brand-radius`) สำหรับ card, pill เต็มวงสำหรับปุ่ม/ชิป
- **Cards:** Colour block จาก accent palette — แต่ละหมวด/แต่ละ stat คนละสี ไม่ใช้ border
- **Icons:** lucide-react เส้นหนา (`strokeWidth` 2–2.5) วางบน colour block
- **Shadows:** แทบไม่ใช้ — เฉพาะ dialog/sheet ที่ลอยเหนือหน้า (`rgba(61,43,36,0.10)`)
- **Form fields:** ข้อยกเว้นเดียวของกฎ "ไม่ใช้ border" — ช่องกรอกต้องดูกรอกได้ ไม่กลืนกับพื้นหลัง
  - พื้นช่อง = `--brand-field` (ขาว) เสมอ ไม่ว่าจะวางบนขาวหรือบน colour block — ห้ามใช้ `bg-surface` เป็นพื้นช่อง (บน card สี surface มันจะหายไปทั้งช่อง)
  - เส้นขอบ 1px `--brand-field-border` + radius 16px, focus = ขอบ terracotta + ring `primary/25`
  - เขียนที่เดียวใน `components/ui/field.tsx` (`fieldClass`, `Input`, `Textarea`, `Select`, `FieldLabel`, `Field`, `fieldShellClass`) — ห้ามเขียน class ช่องกรอกเองในหน้าจอ
- **Illustration:** flat vector บนพื้นขาว สีจาก palette เดียวกัน — ปลายทางทั่วโลก ไม่ผูกกับญี่ปุ่น

### Tone of Voice
- **ภาษาไทยเป็นหลัก** — เป็นกันเอง ไม่ทางการ ใช้คำสั้น ตรงใจ
- ชวนให้รู้สึก "เพื่อนที่เที่ยวเยอะ" ช่วยแพลนให้ ไม่ใช่ระบบ
- Error message: บอกตรงๆ ว่าผิดอะไร + ทำอะไรต่อได้ — ไม่ขอโทษซ้ำซ้อน
- Empty state: ชวนให้ลองทำ ไม่ใช่แค่บอกว่าว่างเปล่า

### Social / Domain (TBD — เติมเมื่อจด)
- Domain: `rove.app`
- Social handles: TBD

---

## 16. Decision Log

| วันที่ | เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| — | Backend | Go + Echo + GORM + FX + MySQL ตาม PROJECT_TEMPLATE.md | ทีมมี template พร้อม ลด ramp-up |
| — | ID strategy | UUID v4 `CHAR(36)` แทน auto-increment | ป้องกันเดา id, รองรับ clone/share |
| — | Realtime | SSE + Redis pubsub (ไม่ใช้ WebSocket) | อ่านอย่างเดียวพอ, ผ่าน proxy ง่าย, ต้นทุนต่ำ |
| — | Server state | TanStack Query เท่านั้น, Zustand เฉพาะ UI | กัน state ซ้ำซ้อน |
| — | Deploy | ~~Lightsail instance เดียว + Docker Compose~~ | ~~ต้นทุน ≤ $25/mo ใน Phase 1~~ — แทนที่แล้ว ดูบรรทัด 23 ส.ค. |
| 23 ส.ค. 2569 | Deploy (แทนที่ของเดิม) | **ECS Fargate + ALB + autoscale 1–10 + RDS + ElastiCache ตั้งแต่วันแรก** ผ่าน Terraform — ตัด Lightsail ทิ้ง · [ADR 0004](docs/adr/0004-aws-ecs-instead-of-lightsail.md) | ซื้อโดเมน rovetravel.site แล้ว + เปิดตัวผ่านอินฟลูฯ = traffic มาเป็นขั้นบันได การ migrate Lightsail→ECS ทีหลังต้องทำตอนเว็บกำลังจะล่มพอดี · ตั้งทุกค่าที่โหมดถูกสุดไว้ก่อน (~$50–70/mo) แล้วยกทีละตัวแปรเมื่อจำเป็น |
| 19 ส.ค. 2569 | Next.js version | **16.3.1** (App Router + Turbopack), React 19.2.8, TS 5.9.3 strict, Tailwind v4 | บันทึกจริงตาม W0.1 — Tailwind v4 ใช้ `@theme inline` ไม่มี `tailwind.config.js` |
| 20 ส.ค. 2569 | PDF renderer | **ไม่ใช้ทั้งคู่ใน Phase 1** — export เป็น HTML self-contained แล้วให้ผู้ใช้สั่งพิมพ์เอง | ไม่ต้องแบก headless browser บน instance เดียว (§8.1) และได้ผลลัพธ์ที่ผู้ใช้เลือกขนาดกระดาษเองได้ · ทบทวนใหม่ตอน photo book Phase 2 |
| — | Affiliate approve status | (บันทึกเมื่อสมัครแต่ละเจ้า) | |
| — | Brand name | ROVE | ตัด `xxx` placeholder — §15 filled |
| — | Booking/Affiliate phase | Phase 1 — core revenue | ไม่เลื่อน, เป็น DoD ของ MVP |
| — | Public plan model | Incentivized publish — creator ได้ "แต้ม" เมื่อคนจองตาม | ไม่ใช่ open community ฟรี — จูงใจด้วย value ที่ชัด |
| — | Budget vs Expense | **แยก 2 tab** — Budget = estimate จาก plan, Expense = actual tracking | ข้อมูลต่างกัน คนละ purpose. Expense ซ่อนเสมอใน public view |
| — | FX rate | Fetch จาก API cache 24h — "ค่าเงินโดยประมาณ" ไม่ต้อง real-time | ใช้คำนวณคร่าวๆ พอ แสดง label date ที่ดึงข้อมูล |
| — | Journal concept | ปรับเป็น **Travel Photo Book** — photos at POI + IG grid + Ebook export | หุ้นส่วนยังไม่ชัดเรื่อง format text diary — photo-first ชัดกว่าและทำได้ Phase 2 |
| — | Map view | V1 = static (pins + polyline เพื่อดูแพลน), Trip Mode (realtime nav) = V2 | ไม่ Rush Trip Mode — ทำ static map ให้ดีก่อน |
| — | Widget Character phase | Phase 1 (ง่าย, เพิ่ม retention/engagement) | seed 20 characters ใน D0.7 |
| — | Dream Trip phase | Phase 1 (ง่าย, ต่อจาก M1 Entry flow) | convert dream → trip ใน 1 คลิก |
| — | Expense Tracking phase | Phase 1 (กลาง — ดีกว่ารอ V2) | ROVE ให้ความสำคัญชัดเจน, ใช้งานระหว่างทริปจริง |
| — | Stats + Calendar phase | Phase 1 lightweight (M17) | ง่าย + เพิ่ม reason to return ให้ app |
| — | Photo/Document phase | Phase 2 (V1) | ต้องออกแบบ UX ละเอียด + R2 bucket เพิ่ม + gotenberg |
| 19 ส.ค. 2569 | Logo asset | Wordmark = React component (Prompt ExtraBold + SVG mark) ไม่ใช่ไฟล์ภาพ; mark = เข็มทิศ 8 แขน ปลายมน hand-authored SVG | ต้องคมทุกขนาดรวม favicon 16px — FLUX เจนตัวอักษรออกมาแล้ว trace เป็น SVG ไม่ได้ |
| 19 ส.ค. 2569 | Illustration assets | เจนด้วย FLUX (`flux-2-pro`, seed คงที่) → `scripts/gen-brand-assets.mjs` | ได้ 20 characters + hero + empty states + covers + texture ที่เป็นสไตล์เดียวกัน และ regenerate ซ้ำได้ |
| 19 ส.ค. 2569 | UI prototype | ทำบน route จริงตาม §3.2 โดยอ่านข้อมูลจาก `apps/web/lib/mock/` แทน API | พอ Go API พร้อม สลับเป็น `features/*/queries.ts` ได้โดยไม่ต้องรื้อ component |
| 19 ส.ค. 2569 | Dark theme | ยังไม่ทำ — brand.css มีเฉพาะ light | cream linen paper คือตัวแบรนด์เอง ค่อยออกแบบ dark ใน Phase 2 |
| 19 ส.ค. 2569 | Visual direction v2 | พื้นขาวล้วน + colour block, ตัด cream linen texture ทิ้ง | ทีมเห็นว่า cozy paper ดูผูกกับญี่ปุ่นเกินไป — ขาว+สีสด อ่านง่ายกว่าและเป็นสากล |
| 19 ส.ค. 2569 | Typography | ใช้ **Inter** ทั้งเว็บ (ไทย fallback Noto Sans Thai), ตัด Prompt + JetBrains Mono | Inter ไม่มี glyph ไทย จึงต้องมี fallback — ตัวเลขใช้ `tabular-nums` แทน mono font |
| 19 ส.ค. 2569 | Brand colour | terracotta `#D9714E`, espresso `#3D2B24` (ปรับจาก #D4614A / #2C1A0E) | เจ้าของแบรนด์เคาะค่าจริง |
| 19 ส.ค. 2569 | ชื่อฟีเจอร์หารบิล | **น้องหาร** | เลี่ยงชื่อ "ขุนทอง" ที่เป็นแบรนด์ของคนอื่น — ความเสี่ยงเครื่องหมายการค้า |
| 19 ส.ค. 2569 | Scope ปลายทาง (prototype) | UI/copy พูดถึงทั่วโลก ไม่ผูกกับญี่ปุ่น | Phase 1 ยัง **ship ญี่ปุ่นก่อน** ตาม §1 — แต่หน้าจอที่ใช้นำเสนอต้องสื่อว่าโตไปทั่วโลกได้ |
| 19 ส.ค. 2569 | AI monetisation | ร่างฟรี **2 ครั้ง/ทริป** จากนั้นจ่ายด้วยแต้ม (300) หรือซื้อครั้งละ ฿39 | คุมต้นทุน Anthropic ต่อทริป + ผูกกับ referral/public points ให้เป็นวงจรเดียวกัน |
| 19 ส.ค. 2569 | แหล่งที่มาของแต้ม | referral (150/คน) + คนจองตามทริป public | เดิมมีแค่ทางที่สอง — referral ทำให้ผู้ใช้ใหม่มีแต้มตั้งต้นไว้ปลดล็อก AI |
| 19 ส.ค. 2569 | หน้า error/สถานะ | `not-found.tsx`, `error.tsx`, `global-error.tsx` + route `/maintenance` (static) | `/maintenance` ให้ Caddy เสิร์ฟตอน deploy/ล่มได้โดยไม่ต้องรอ Next ขึ้น (§8.1 instance เดียว) |
| 19 ส.ค. 2569 | แยก 503 ออกจาก 500 | error boundary เช็ค ApiError ≥500 / network → แสดงจอ "หลังบ้านไม่ตอบ" | ผู้ใช้แก้เองไม่ได้ ต้องบอกว่าไม่ใช่ที่เขา + ปุ่ม retry แทน "กลับหน้าแรก" · **ข้อจำกัด:** production Next mask error ฝั่ง server ทำให้ branch นี้ยิงจริงเฉพาะ error ฝั่ง client (ที่ TanStack Query อยู่) |
| 19 ส.ค. 2569 | เอกสารกฎหมาย | `/terms` + `/privacy` เป็น **ฉบับร่าง** เขียนจากพฤติกรรมจริงของระบบ | ให้ที่ปรึกษากฎหมายตรวจต่อจากของจริง ไม่ใช่ template · ช่อง `[...]` = ข้อมูลนิติบุคคลที่ยังไม่มี |
| 20 ส.ค. 2569 | รูปปกทริป | เพิ่มคลังปก “ตามอารมณ์ทริป” 9 แบบ (FLUX seed เดิม) + `cover-placeholder` เป็นปกตั้งต้นของทุกทริป · อัปโหลดเองย่อ/ครอบเป็น 1200×800 WebP ในเบราว์เซอร์แล้วเก็บเป็น data URL | ทริปที่ไม่ได้ไปญี่ปุ่นเคยได้ปกญี่ปุ่นทุกใบ · R2 ยังเป็น stub และ `cover_image_url` เป็น varchar(500) การอัปโหลดจึงเปิดเฉพาะโหมด mock จนกว่า Phase 2 จะต่อ bucket |
| 20 ส.ค. 2569 | สอง branch ที่ทำ Phase 1 ทับกัน | ยึด `feat/ui-prototype` เป็น tree ตั้งต้นทั้งก้อน แล้วยกเฉพาะชุดเทสต์ security ตามมา — merge commit ปกติ ไม่ rewrite ประวัติ | ui-prototype มีภาพที่เจนแล้ว (characters 20 + covers + empty states) และ mock/live layer ที่ demo ได้โดยไม่ต้องมี API · เลือกทับทั้ง tree ดีกว่าไล่ merge 111 ไฟล์ที่ชนกันทีละไฟล์ |
| 20 ส.ค. 2569 | สร้างลิงก์เชิญ | **owner เท่านั้น** (เดิม ui-prototype ให้ editor ทำได้) | editor ที่ออกลิงก์เชิญได้ = ขยายสิทธิ์เขียนในทริปของคนอื่นโดยเจ้าของไม่รู้ · ตรงกับสัญญาใน §5.3 อยู่แล้ว |
| 20 ส.ค. 2569 | DB ของ integration test | `glebarez/sqlite` (pure Go) in-memory | `go test ./...` รันได้โดยไม่ต้องมี cgo และไม่ต้องยก container — เทสต์ security จึงรันทุก PR ไม่ใช่เฉพาะตอนมี MySQL |
| 20 ส.ค. 2569 | ทริปที่จบแล้ว | เพิ่มหน้า **บันทึกทริป** (`/recap/:id`) แยกจากห้องทริป และ derive ทุกอย่างจากตารางเดิม | ห้องทริปออกแบบมาเพื่อ "แก้" ทริปที่จบแล้วต้องการแค่ "อ่าน" — และคำถามที่คนกลับมาถามคือ *ตอนนั้นตัดสินใจยังไง* ไม่ใช่ timeline ดิบ · ถ้าเก็บ snapshot แยกจะมีวันที่ไม่ตรงกับห้อง |
| 20 ส.ค. 2569 | จุดที่ชวนเปิด public | ชวนบนหน้าบันทึกทริป ไม่ใช่ตอนกำลังวางแผน | ทริปที่ไปมาแล้วคือทริปที่คนอื่นอยากตามรอย และเป็นจังหวะที่อธิบายวงจรแต้ม→ส่วนลดได้ตรงที่สุด (§6.5) · share dialog ยังตั้ง public ได้เหมือนเดิม |
| 20 ส.ค. 2569 | ขอบเขตของเทสต์ authorization | ยอมรับทั้ง 404 และ 403 ว่า "ปฏิเสธแล้ว" | §4.3 อยากได้ 404 เพื่อไม่ยืนยันว่า id มีอยู่จริง แต่ route ไหนตอบอะไรขึ้นกับว่า membership หรือ role พังก่อน · สิ่งที่เทสต์คุมคือ "เข้าไม่ได้" ไม่ใช่เลขสถานะ |
| 21 ส.ค. 2569 | เก็บประวัติการซื้อ | ตาราง **`orders` ตารางเดียว** รับของทุกอย่างที่ขาย (แยกด้วย `kind`) + `subscriptions` ที่ยังว่าง — ไม่ใช่ `ai_credit_purchases` | subscription รายเดือนคือของถัดไปที่จะขาย · ประวัติที่ต้องเขียนใหม่ตอนมีสินค้าชิ้นที่สองคือประวัติที่ทำสินค้าชิ้นแรกหาย |
| 21 ส.ค. 2569 | ใบเสร็จ = order ใบเดียวกัน | ไม่มีตาราง `receipts` แยก · order เป็น **immutable** — คืนเงิน = เปลี่ยน status, แก้ = ออกใบใหม่ | ใบเสร็จที่ผู้ใช้โหลดไปแล้วต้องไม่กลายเป็นเอกสารคนละใบเงียบ ๆ |
| 21 ส.ค. 2569 | เลขที่ใบเสร็จ | `RV-2569-000123` — ปี พ.ศ. + ลำดับต่อปี, COUNT ใน transaction + uniq index (ชนแล้ว retry 1 ครั้ง) | เป็นเลขที่ลูกค้าพูดผ่านแชท ต้องสั้น อ่านออกเสียงไม่กำกวม และไม่ซ้ำ · ยอดซื้อระดับหลักสิบต่อคนต่อปี ยังไม่คุ้มกับตาราง counter |
| 21 ส.ค. 2569 | จ่ายด้วยแต้มบนใบเสร็จ | คงราคาป้ายไว้ที่ `subtotal` แล้วลด `discount` เต็มจำนวน → `total = ฿0` + `points_spent` แยกช่อง | "฿0" เดี่ยว ๆ อ่านเหมือนบั๊ก · แต้มไม่ใช่บาท จึงไม่บวกรวมในยอดเงินสด แต่ต้องเห็นว่าจ่ายอะไรไป |
| 21 ส.ค. 2569 | ช่องทางชำระเงิน | `pay_channels` เปลี่ยนจาก `string[]` เป็น `{id,label}` และ purchase รับ `method` | เดิมฝั่ง Go แยกแต้ม/เงินสดด้วยการค้นคำว่า "แต้ม" ในข้อความ · ใบเสร็จที่เขียนว่า "บัตรเครดิต" ทั้งที่จ่ายพร้อมเพย์คือเรื่องร้องเรียน |
| 21 ส.ค. 2569 | แพ็กเกจรายเดือน | ใส่ catalogue (ฟรี / Plus รายเดือน ฿129 / รายปี ฿1,290) ตั้งแต่ตอนนี้ โดย `available:false` | หน้าจอที่จะขายคือหน้าจอที่เรนเดอร์อยู่แล้ว — วันเปิดขายเป็น deploy ไม่ใช่การรื้อหน้า · ผู้ใช้ฟรีไม่มีแถวใน `subscriptions` ให้ API สังเคราะห์เอา |
| 24 ส.ค. 2569 | โครงสร้าง plan variant (M6) | variant = **snapshot ทั้งก้อน** ในตาราง `plan_variants` (JSON รูปเดียวกับ AI draft) ไม่ใช่หลายแถวใน `plans`/`plan_days` · adopt ใช้โค้ดเส้นเดียวกับ apply draft | ทุก query ที่ scope ด้วย tripID ทำงานเหมือนเดิมโดยไม่ต้องรื้อ · variant มีไว้เทียบ/โหวต/สลับ ไม่ใช่แก้คู่ขนาน — แก้ได้เมื่อ adopt แล้วเท่านั้น ซึ่งตรงกับพฤติกรรมที่กลุ่มใช้จริง |
| 24 ส.ค. 2569 | ทางเข้าระบบ | `/login` เหลือ **OAuth อย่างเดียว** (LINE, Google) · ประตู dev-login ย้ายไป `/admin/login` และบัญชีที่ได้ถูกตั้งเป็น `admin` เสมอ | ทางเข้าที่ไม่มีเจ้าของบัญชีมายืนยันตัวตนคือสิ่งที่สคริปต์ปั่นบัญชีม้าต้องการ (แต้ม referral 150/คน + เครดิต AI ฟรี — plan §11) · เงื่อนไข 3 ชั้นเดิม (NEXT_PUBLIC_DEV_LOGIN + non-production + MOCK_MODE) ยังอยู่ครบ ประตูนี้แค่ไม่อยู่บนหน้าที่ผู้ใช้จริงเห็น |

---

## 17. Definition of Done (ทุก task)
- **API:** มี handler + store + domain logic แยกชั้นถูกต้อง, scope ด้วย tripID, เขียน activity_log, emit SSE, มี unit test ของ domain logic, `go vet`/lint ผ่าน
- **Web:** ผ่าน typecheck/lint, ใช้ query key factory, mutation มี optimistic + rollback, มี loading/empty/error, ทดสอบที่ 375px, สีและ token อ้างอิงจาก `styles/brand.css` เสมอ (ห้าม hardcode hex)
- ไม่มี secret ใน client bundle
- FX display ต้องมี label โดยประมาณและวันที่ทุกที่
- Expense payload ไม่ปรากฏใน public/share response
- อัปเดต checklist ในไฟล์นี้ + Decision Log ถ้ามีการตัดสินใจ
