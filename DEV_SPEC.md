# DEV_SPEC.md — ROVE: Collaborative Trip Planning Platform (Japan-first)

> Source of truth สำหรับ dev — ใช้กับ Claude Code
> Product rationale อ้างอิง `trip-planning-platform-plan.md`
> **BRAND (§15) ✅ ใส่แล้ว** — อ่าน §15 ก่อนแตะ UI ทุกครั้ง
> Backend ยึดตาม `PROJECT_TEMPLATE.md` (Go + Echo + GORM + Uber FX + MySQL) — ห้ามเปลี่ยน pattern โดยไม่บันทึกใน Decision Log

> **สถานะ (2026-08-20): Phase 0 + Phase 1 เขียนโค้ดครบแล้ว — ติ๊ก 133/145**
>
> ที่เหลืออีก 12 ข้อไม่ใช่โค้ดที่ยังไม่ได้เขียน แต่เป็นสิ่งที่ต้องมีบัญชี เซิร์ฟเวอร์
> หรือ API ที่เสียเงินก่อน (Lightsail instance, Vercel, Google Maps billing,
> สมัคร affiliate, AI eval, closed beta) — แต่ละข้อมีโน้ตกำกับไว้ใน §9/§10 ว่าติดอะไร
>
> - `go test ./...` และ `pnpm test` ผ่านทั้งหมด · `pnpm build` ผ่าน 22 routes
> - `pkg/domain` (logic เรื่องเงิน/coverage/validate) coverage 92.6%
> - เทสต์ cross-trip access ครอบทุกกลุ่ม endpoint ใน §5 แล้ว (X.3) — เจอบั๊กจริง 2 ตัวและแก้แล้ว
> - การตัดสินใจตอนสร้าง Phase 1 อยู่ใน §16 และ `docs/adr/0003`

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
| ส่วน | Phase 1 (low cost) | โตขึ้นแล้วย้ายไป |
|---|---|---|
| Compute | **AWS Lightsail instance** 2 vCPU / 2 GB (~$12/mo) รัน Docker Compose | Lightsail 4GB → ECS Fargate / EC2 + RDS |
| DB | MySQL container บน instance เดียวกัน + snapshot รายวัน | Lightsail Managed Database → RDS |
| Redis | container เดียวกัน | ElastiCache |
| Reverse proxy/TLS | **Caddy** container (auto Let's Encrypt) | ALB + ACM |
| Object storage | Cloudflare R2 (egress ฟรี) — bucket แยก: export, images, documents, photos | คงเดิม |
| Frontend hosting | Vercel (Hobby) หรือ container บน Lightsail เดียวกัน | Vercel Pro / Amplify |
| DNS/CDN | Cloudflare (free) | คงเดิม |
| Backup | Lightsail auto snapshot + `mysqldump` → R2 รายวัน | RDS automated backup |
| CI/CD | GitHub Actions → build image → GHCR → ssh deploy script | ECR + ECS deploy |
| Monitoring | Uptime Kuma container + Lightsail metrics + Logrus → file → Loki (ทีหลัง) | CloudWatch/Grafana |

> เป้าหมายค่าใช้จ่าย Phase 1: **≤ $25/เดือน** ไม่รวม AI API และ Google Maps API

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
    │   ├── places/             # google places + distance (+ redis cache)
    │   ├── weather/            # open-meteo
    │   ├── fx/                 # exchange rate (fetch API, cache 24h)
    │   ├── storage/            # R2 (multi-bucket: export/images/documents/photos)
    │   ├── email/              # gmail/resend
    │   ├── affiliate/          # deeplink builder + partner registry
    │   ├── events/             # SSE hub (redis pubsub)
    │   ├── jobs/               # redis queue + worker pool
    │   └── photobook/          # Phase 2: compile photos → PDF/Ebook via chromedp/gotenberg
    ├── domain/                 # pure logic (ไม่มี DB): budget, expense, coverage, validate, match, points
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

**trip_flights** — `id, trip_id, direction('out'|'return'), airline, flight_no, dep_airport, arr_airport, dep_at, arr_at, raw_text`

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

> `split_type='shared'` → คิดแบบ "ขุนทอง" หารตาม participants_json
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

### 5.3 Trip
```
POST   /api/v1/trips                          สร้างทริป {entry_type, title?, start_date?, end_date?, cities[], party_size}
GET    /api/v1/trips                          ทริปของฉัน (paginated)
GET    /api/v1/trips/:tripId                  overview (trip + members + counts + flags)
PATCH  /api/v1/trips/:tripId                  แก้ frame            [editor]
DELETE /api/v1/trips/:tripId                                        [owner]
POST   /api/v1/trips/:tripId/flights          เพิ่ม/แก้เที่ยวบิน    [editor]
POST   /api/v1/trips/:tripId/invites          สร้างลิงก์เชิญ        [owner]
POST   /api/v1/invites/:token/accept          join
GET    /api/v1/trips/:tripId/members
PATCH  /api/v1/trips/:tripId/members/:userId  เปลี่ยน role          [owner]
DELETE /api/v1/trips/:tripId/members/:userId                        [owner]
GET    /api/v1/trips/:tripId/activity         feed (cursor)
PATCH  /api/v1/trips/:tripId/visibility       {visibility, privacy_opts}  [owner]
POST   /api/v1/trips/:tripId/clone            → new trip
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

## 8. Deployment (AWS Lightsail — low cost)

### 8.1 Phase 1 topology (instance เดียว)
```
Lightsail Ubuntu 2 vCPU / 2 GB / 60 GB SSD  ($12/mo)  + static IP (ฟรีเมื่อ attach)
└── docker compose -f deploy/docker-compose.prod.yml
    ├── caddy      :80/:443  → TLS อัตโนมัติ, reverse proxy
    │     api.rove.app  → api:5000
    │     rove.app      → web:3000 (ถ้าไม่ใช้ Vercel)
    ├── api        (Go binary, alpine)
    ├── web        (Next.js standalone output)  [optional]
    ├── mysql:8.0  volume ./data/mysql, my.cnf ปรับ innodb_buffer_pool_size=512M
    └── redis:7    volume ./data/redis, maxmemory 128mb allkeys-lru
```
- ถ้า RAM ตึง: ย้าย web ไป Vercel Hobby (ฟรี)
- เปิดเฉพาะพอร์ต 22/80/443 ใน Lightsail firewall
- swap file 2GB กัน OOM ตอน build/AI burst

### 8.2 CI/CD
1. GitHub Actions: `go test` + `go build` → build image → push **GHCR**
2. ssh เข้า Lightsail → `deploy/deploy.sh` → `docker compose pull && up -d` → healthcheck `/healthz`
3. Web (ถ้าอยู่บน Vercel) deploy อัตโนมัติจาก branch

### 8.3 Backup / Ops
- Lightsail automatic snapshot รายวัน (เก็บ 7 วัน)
- cron: `mysqldump` gzip → อัป R2 ทุกวัน เก็บ 30 วัน + ทดสอบ restore เดือนละครั้ง
- Logrus → stdout → docker json-file; Uptime Kuma ping `/healthz` + แจ้ง LINE
- `/healthz` เช็ค DB + Redis; `/readyz` สำหรับ deploy gate

### 8.4 เส้นทาง scale
2GB → 4GB instance → แยก MySQL ไป Lightsail Managed DB → ECS Fargate + RDS + ElastiCache เมื่อ trips/วัน > ~2k

---

## 9. Phase 0 — Setup & Validate

### API (`rove-api`)
- [x] A0.1 init repo ตาม template: main.go + FX + Echo + GORM + Viper + Logrus + validator
- [x] A0.2 `docker-compose.yml` (mysql 8 + redis) สำหรับ local, `.env.example` ครบ §6.1
- [x] A0.3 gormigrate migration แรก: users, user_points, trips, trip_members, pois, characters (AutoMigrate)
- [x] A0.4 Auth: JWT HS256 + `JwtMiddleware` + `OptionalJwt` + `IsAdmin` + `TripRoleMiddleware`
- [x] A0.5 OAuth LINE Login + Google → สร้าง/ผูก user → ออก JWT
  > โค้ดครบทั้งสองฝั่ง (แลก code, ผูกบัญชีเดิมด้วยอีเมลที่ยืนยันแล้ว, state cookie กัน CSRF) — ยังไม่ได้ทดสอบกับ credential จริง ต้องใส่ `LINE_LOGIN_CHANNEL_ID` / `GOOGLE_OAUTH_CLIENT_ID` แล้วลองล็อกอินหนึ่งรอบ
- [x] A0.6 `pkg/store/store.go` pagination + `pkg/utils/*` ตาม template
- [x] A0.7 Redis client + rate limit middleware + cache helper (รวม FX cache helper)
- [x] A0.8 `/healthz`, `/readyz`, request logger, CORS (allow WebBaseURL), Recover, Secure
- [x] A0.9 Dockerfile multi-stage + GitHub Actions (test/build/push GHCR)
- [ ] A0.10 `deploy/` (compose.prod, Caddyfile, deploy.sh) + สร้าง Lightsail instance + domain + TLS ผ่านจริง
  > สคริปต์และ compose.prod พร้อมแล้วใน `deploy/` — ที่ยังขาดคือการสร้าง Lightsail instance จริง จด domain และให้ TLS ผ่าน ซึ่งต้องมีบัญชี AWS และโดเมนก่อน

### Web (`rove-web`)
- [x] W0.1 `pnpm create next-app@latest` (App Router, TS strict) + บันทึกเวอร์ชันใน Decision Log
- [x] W0.2 Tailwind + shadcn/ui + lucide + `styles/brand.css` โดยใช้ค่า token จาก §15 ทันที (ไม่ใช้ placeholder)
- [x] W0.3 TanStack Query provider + devtools + default options §7.1
- [x] W0.4 `lib/api-client.ts` (fetch wrapper: base url, auth, error → typed) + `features/` skeleton
- [x] W0.5 Auth flow: LINE/Google button → callback route → set httpOnly cookie → `useMe()`
- [x] W0.6 Zustand store สำหรับ UI state + next-intl + PostHog + flags
- [ ] W0.7 Vercel (หรือ container) deploy preview ต่อ PR
  > ต้องเชื่อม repo กับ Vercel (หรือเปิด GitHub Environment) ก่อน ทำจากในโค้ดอย่างเดียวไม่ได้

### Data / Ops
- [x] D0.1 zone codes ญี่ปุ่นใน `pkg/domain/zones.go` (tokyo_east/west/bay, yokohama, kamakura, fuji, kawagoe, …)
- [x] D0.2 `data/poi/jp.csv` + validator + import command (`go run main.go seed:poi`)
- [x] D0.3 seed POI ≥ 300 จุด (Disney, DisneySea, Tsukiji, Sensoji, Skytree, Ueno NM, Ameyoko, Akihabara, Kawagoe, Ikebukuro, Shinjuku, TeamLab Planets, Tokyo Tower, Takeshita, Shibuya Sky, Roppongi, Kamakura crossing, Enoshima, Cup Noodles, Red Brick, Chureito, Oishi Park, Oshino Hakkai ฯลฯ)
- [ ] D0.4 enrich จาก Google Places (place_id, lat/lng, open_hours) + cache
  > `pkg/services/places` + `Tools.ResolveFromURL` พร้อมแล้ว (ใช้ตอนวางลิงก์ Google Maps) แต่ยังไม่มีคำสั่ง batch enrich ทั้ง catalogue — และต้องมี `GOOGLE_MAPS_SERVER_KEY` ที่เปิด billing ก่อน
- [x] D0.5 `data/templates/` 3 แพลนต้นแบบ (Tokyo Base, Yokohama Base, +1)
- [ ] D0.6 สมัคร affiliate (Agoda, Booking, Klook, KKday, Rentalcars, Airalo) + seed `affiliate_partners`
  > seed `affiliate_partners` ครบ 6 รายแล้ว (`go run . seed partners`) พร้อม deeplink template — ที่เหลือคือสมัครกับแต่ละพาร์ทเนอร์เพื่อเอา affiliate id มาใส่ `.env`
- [x] D0.7 **seed characters:** `data/characters.json` 20 ตัว (สัตว์น่ารัก/ตัวละคร ชื่อ + emoji + image_url placeholder) + `go run main.go seed:characters`
- [x] D0.8 ADR แรก: stack, id strategy, deploy target

---

## 10. Phase 1 — MVP

**DoD:** กลุ่ม 4 คนสร้างทริปญี่ปุ่น ใส่ wishlist ทุกคน กด AI ร่างแพลน แก้ timeline ร่วมกัน เห็น **Budget ประมาณการ** และ **Expense จริงแบบ Shared/Personal** export/แชร์ลิงก์ กดปุ่มจองแล้ว track ได้ — ผู้ใช้มี character ประจำตัว มี dream list ส่วนตัว เห็น stats รวม — ทำงานจริงบน Lightsail

### M1 Entry Points
- [x] A1.1 `POST /trips` รองรับ entry_type ('date'|'city'|'ticket'|'clone')
- [x] A1.2 `POST /ai/parse-ticket` → flights + suggested frame
- [x] W1.1 Landing 3 การ์ด (เริ่มจากวัน / เมือง / วางข้อความตั๋ว)
- [x] W1.2 Flow วัน: date range → เมือง (optional) → party size → create → redirect
- [x] W1.3 Flow เมือง: chips เมือง → แนะนำจำนวนวัน → วัน → create
- [x] W1.4 Flow ตั๋ว: textarea → preview flights → confirm → create
- [x] W1.5 Onboarding checklist ใน Overview (ชวนเพื่อน / ใส่ wishlist / กด AI)
- [ ] X1.1 e2e: ทุก entry ได้ทริปใน ≤ 3 หน้าจอ
  > เขียนไว้แล้วใน `apps/web/e2e/entry.spec.ts` — ต้องรันกับ stack ที่ boot จริง (`docker compose up`) ยังไม่ได้รันในสภาพแวดล้อมนี้

### M2 Trip Room
- [x] A2.1 trip CRUD + flights + overview payload (counts, flags)
- [x] A2.2 invites: create/accept, role guard ครบทุก endpoint
- [x] A2.3 members list/patch/remove
- [x] A2.4 activity_logs + `GET /activity` (cursor)
- [x] A2.5 SSE hub (redis pubsub) + `GET /events` + emit helper ในทุก mutation
- [x] W2.1 Layout `/t/[tripId]` + tabs + mobile bottom nav (Overview|Wishlist|Plan|Budget|Expense|Prep|Bookings|Discussion)
- [x] W2.2 Overview: Trip Frame card, members (character avatar), สถานะ, quick actions
- [x] W2.3 Inline edit frame (optimistic)
- [x] W2.4 Invite dialog + `/invite/[token]`
- [x] W2.5 Activity feed (infinite query)
- [x] W2.6 `useTripEvents` hook → invalidate ตาม event type
- [x] W2.7 Empty/loading/error states ทุก tab

### M3 Wishlist & Coverage
- [x] A3.1 member_profiles GET/PUT
- [x] A3.2 wishlist CRUD (เขียนได้เฉพาะของตัวเอง ยกเว้น owner)
- [x] A3.3 AI normalize wishlist (job) → tags + poi_id
- [x] A3.4 `pkg/domain/coverage.go` + unit tests + `GET /coverage`
- [x] A3.5 recompute coverage หลัง items เปลี่ยน (hook ใน service layer)
- [x] W3.1 Profile form
- [x] W3.2 Wishlist editor (must/nice/avoid, tags, reorder, delete)
- [x] W3.3 Coverage Board (✅/⚠️/❌ + note + ลิงก์ไป item)
- [x] W3.4 แสดง "ใครยังไม่ใส่ wishlist" ใน Overview

### M4 AI Planner
- [x] A4.1 `services/ai` skeleton: client, schemas, prompts, token accounting
- [x] A4.2 tools: lookup_poi, get_poi, distance (Google + redis cache), weather, fx
- [x] A4.3 buildFrame (anchors: flights, prepaid stay, dated must-do, zones)
- [x] A4.4 generatePlan → PlanDraft (1 variant)
- [x] A4.5 `pkg/domain/validate.go` (closed day, นอกเวลาเปิด, วันยาวเกิน, travel ไม่สมจริง, must-do หาย, POI ซ้ำ) + tests
- [x] A4.6 repairPlan (≤2 loops)
- [x] A4.7 explainPlan → rationales + open_questions
- [x] A4.8 persistPlan ใน transaction + item_versions
- [x] A4.9 ai_jobs + redis queue + worker pool + SSE progress
- [x] A4.10 refinePlan → ItemDiff[] + `apply-diff`
- [x] A4.11 rate limit + cost cap ต่อ trip/วัน
- [ ] A4.12 eval set 5 ทริป (`services/ai/evals`) วัด schema pass / coverage% / issues / latency
  > ต้องเรียก Anthropic API จริงทุกครั้งที่รัน ซึ่งมีค่าใช้จ่าย — ควรทำหลังตั้ง `ANTHROPIC_API_KEY` และตกลงงบ eval แล้ว
- [x] W4.1 ปุ่ม "ให้ AI ร่างแพลน" + progress steps (จาก SSE)
- [x] W4.2 Rationale panel + Open questions (ตอบ → ส่ง refine)
- [x] W4.3 Refine chat + **Diff preview UI** (accept ทั้งหมด/รายรายการ)

### M5 Itinerary Editor
- [x] A5.1 day/item CRUD + move (คำนวณ sort_order) + undo จาก item_versions
- [x] A5.2 `GET /plans/:id` payload เดียวจบ (days+items+rationales+warnings)
- [x] A5.3 `POST /pois/resolve` (google maps url / place_id / text)
- [x] W5.1 Plan tab: day tabs + timeline card (เวลา, ชื่อ, POI badge, cost, booking, verified)
- [x] W5.2 Add item: search POI (debounced) / paste maps url / free text
- [x] W5.3 Edit item sheet (ครบทุกฟิลด์ §4.2)
- [x] W5.4 dnd-kit reorder + ข้ามวัน + optimistic + rollback
- [x] W5.5 Delete + undo
- [x] W5.6 List view (print-friendly)
- [x] W5.7 Version snapshot + ดูประวัติ
- [x] W5.8 Warning badge จาก `/validate`
- [ ] X5.1 ทดสอบ dnd บนมือถือจริง (iOS Safari + Android Chrome)
  > ตั้ง Playwright project `ios` / `android` ไว้แล้ว — ต้องมี fixture ที่ seed ทริปพร้อมแพลนก่อน แล้วรันบนเครื่องจริงอีกรอบ

### M7 Budget (ประมาณการจาก plan items)
- [x] A7.1 `pkg/domain/budget.go` (category rollup, per_person/group/night, prepaid แยก, FX) + tests
- [x] A7.2 `GET /plans/:id/budget` + FX service (cache รายวันจาก API) + override manual
- [x] W7.1 Budget tab: ตาราง category × (JPY, THB, ต่อคน) + total + prepaid + เทียบงบที่ตั้งไว้ + label "ประมาณการ"
- [x] W7.2 Highlight item ที่ยังไม่มี cost
- [x] W7.3 Budget ส่วนตัว (per_person) + tooltip อัตราแลกเปลี่ยนโดยประมาณ ณ วันที่

### M8 Prep
- [x] A8.1 weather service (Open-Meteo) + cache → prep block
- [x] A8.2 packing generator (rule จาก temp band + tags) + AI เสริมข้อความ
- [x] A8.3 docs checklist default (passport, Visit Japan Web, insurance, eSIM, IDP ถ้ามีรถ)
- [x] W8.1 Prep tab + checklist ติ๊กร่วมกัน (optimistic + SSE)
- [x] W8.2 Custom block (markdown)

### M9 Collaboration
- [x] A9.1 comments CRUD (thread 1 ชั้น) + emit SSE
- [x] W9.1 Comment thread บน item/day/plan + Discussion tab
- [x] W9.2 Viewer mode + ปุ่ม "เข้าร่วมทริป"

### M10 Share & Export
- [x] A10.1 visibility private/link + share_token + `GET /public/plans/:token` (ซ่อน expense payload เสมอ)
- [x] A10.2 export job: render HTML (Go template self-contained) → R2 → signed url
- [x] A10.3 export PDF (chromedp/gotenberg) — บันทึกทางเลือกที่เลือกใน Decision Log
- [x] W10.1 Share dialog + copy link
- [x] W10.2 `/s/[token]` view page (noindex)
- [x] W10.3 ปุ่ม export + สถานะ job + ดาวน์โหลด
- [x] W10.4 OG image พื้นฐาน

### M12 Booking (stay + activity)
- [x] A12.1 `services/affiliate`: partner registry + `BuildDeepLink(partner, item, trackingID)`
- [x] A12.2 `POST /items/:id/booking-link` + `GET /go/:trackingId` (302 + log click + บันทึก source_creator_id ถ้ามี)
- [x] A12.3 partner selection rule (poi.partner_links → type-based priority)
- [x] A12.4 booking-status manual + `GET /trips/:id/bookings`
- [ ] A12.5 generic confirmations importer (CSV) + webhook skeleton + award points เมื่อ confirmed
  > webhook `/webhooks/affiliate/:partner` + การให้แต้มตอน confirmed ทำแล้วและมี guard กันจ่ายซ้ำ — ที่ขาดคือ CSV importer และ signature ของแต่ละพาร์ทเนอร์ ซึ่งต้องรู้รูปแบบจริงจากพาร์ทเนอร์ก่อน
- [x] W12.1 ปุ่มจองบน item card + สถานะ
- [x] W12.2 Bookings tab (กรองตาม type/สถานะ)

### M13 Admin
- [x] A13.1 admin guard + POI CRUD + CSV import + character management
- [x] A13.2 dashboard endpoints (trips, ai cost, clicks, confirmations, points issued)
- [x] W13.1 หน้า admin ง่าย ๆ (table + form)
- [x] A13.2b feature flags table/env

### M14 Widget Character (NEW — ง่าย)
- [x] A14.1 seed 20 characters จาก `data/characters.json` → ตาราง `characters`
- [x] A14.2 `GET /api/v1/characters` + `PATCH /api/v1/users/me/character {character_id}`
- [x] A14.3 migration: เพิ่ม `character_id` ใน `users` (nullable, FK)
- [x] W14.1 Character picker dialog ใน profile setup + settings
- [x] W14.2 แสดง character แทน avatar ใน member list, activity feed, comment (ถ้าไม่มี avatar_url จาก OAuth)
- [x] W14.3 Character เป็น option ใน onboarding step แรก ("เลือกตัวละครของคุณ")

### M15 Dream Trip — Bucket List (NEW — ง่าย)
- [x] A15.1 migration: ตาราง `dream_items`
- [x] A15.2 dream CRUD + reorder endpoints (§5.2)
- [x] W15.1 Dream list ใน `/profile` — cards ที่อยากไป (ชื่อ, ปลายทาง, url, notes)
- [x] W15.2 Add dream dialog: ชื่อ, ปลายทาง, วาง URL ได้, โน้ต
- [x] W15.3 ปุ่ม "เริ่มแพลนทริปนี้" จาก dream item → pre-fill city ใน Entry flow (M1)
- [x] W15.4 Dream list ใน Home Dashboard (M18) — แสดง 3 อันดับแรก

### M16 Expense Tracking — Shared / Personal (NEW — กลาง)
- [x] A16.1 migration: ตาราง `expense_entries`
- [x] A16.2 `pkg/domain/expense.go`: คำนวณ per-member (shared หารตาม participants), personal แยก, FX conversion + tests
- [x] A16.3 expense CRUD endpoints + summary endpoint (§5.7)
- [x] A16.4 emit SSE `expense.created` / `expense.updated` หลังทุก mutation
- [x] W16.1 **Expense tab** แยกจาก Budget tab ชัดเจน
- [x] W16.2 Add expense form: ชื่อ, จำนวน, สกุลเงิน, category, Shared/Personal toggle, เลือกว่าใครร่วมหาร (ถ้า shared)
- [x] W16.3 Summary: รายคน (ใครจ่ายไปเท่าไหร่, ใครเป็นหนี้ใคร), total รวม
- [x] W16.4 แสดง label "อัตราโดยประมาณ ณ [date]" ทุกที่ที่แปลงสกุลเงิน
- [x] W16.5 ตั้งค่า privacy: Expense tab ซ่อนเสมอใน public view (toggle ปิดไม่ได้ — เป็น UX default ที่ชัดเจน)

### M17 Home Dashboard + Stats + Calendar (NEW — ง่าย)
- [x] A17.1 `GET /api/v1/users/me/stats` — aggregate จาก trips (status='done'|'planning'), expense_entries
- [x] A17.2 `GET /api/v1/users/me/calendar` — upcoming trips sorted by start_date + ต่อ trip ดึง weather snippet
- [x] W17.1 `/home` page: upcoming trips (calendar strip + days until), past trip recap cards, dream list preview, points balance
- [x] W17.2 Stats widget: ปีนี้ไปกี่ทริป / กี่วัน / กี่ประเทศ / ใช้เงินรวมเท่าไหร่ (THB โดยประมาณ)
- [x] W17.3 Calendar view: trip bars บน calendar + weather ปลายทาง
- [x] W17.4 Points balance display + history link

### Cross-cutting
- [ ] X.1 e2e: create → invite 2 users → wishlist → generate → edit → budget → add expense → share → book click
  > flow เดียวกันนี้ครอบไว้แล้วในระดับ API (`pkg/handlers/api/tests/flow_test.go`) — ส่วนที่ยังไม่ได้คือผ่าน UI จริง ซึ่งติดสองอย่าง: ล็อกอินโดยไม่มีบัญชี LINE จริง และ response ของ AI ที่ต้องอัดไว้ล่วงหน้าไม่ให้เสียเงินทุกรอบ
- [ ] X.2 Perf: Trip Room LCP < 2.5s บน 4G; plan 7 วัน × 10 items ลื่นบนมือถือ
  > ต้องวัดกับ stack ที่ deploy จริงบน 4G ยังวัดไม่ได้จากที่นี่
- [x] X.3 Security: integration test cross-trip access ทุกกลุ่ม endpoint + ตรวจ expense ไม่หลุด public payload + ตรวจ secret ไม่หลุด client bundle
- [x] X.4 Analytics events §13 ครบ
- [ ] X.5 Backup/restore ทดสอบจริง 1 รอบ
  > `deploy/backup.sh` พร้อมแล้ว — ต้องมีเซิร์ฟเวอร์จริงถึงจะทดสอบ restore ได้
- [ ] X.6 Closed beta 10–20 กลุ่ม + feedback log
  > ต้อง deploy ขึ้น production ก่อน

---

## 11. Phase 2 — V1 (Variants, Public + Points, Photos, Documents, Community)

### Plan Variants & Compare
- [ ] A6.1 create variant (fork จาก day index) + key_decision
- [ ] A6.2 AI multi-variant (2–3 ตาม key decision candidates)
- [ ] A6.3 `GET /plans/:id/compare?with=` metrics (cost, per person, travel รวม, coverage%, POI count, warnings)
- [ ] A6.4 votes + freeze plan
- [ ] A6.5 conflict detector (pace/budget/must-do ชนกัน) ก่อน generate
- [ ] W6.1 Compare page (metrics table + parallel timeline + pros/cons)
- [ ] W6.2 Vote UI + freeze

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
`expense_added {split_type,category}`, `expense_summary_viewed`,
`photo_uploaded {from_item}`, `photobook_export_started {format}`, `photobook_downloaded`,
`document_uploaded {category}`,
`points_earned {amount}`, `points_balance_viewed`, `home_dashboard_viewed`, `calendar_viewed`

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
  - Default (light bg): espresso body `#2C1A0E` + terracotta asterisk `#D4614A`
  - Dark bg: white body + terracotta asterisk
  - Monochrome: espresso ทั้งหมด
- **App icon / favicon:** asterisk เดี่ยว terracotta บน cream circle
- **Gimmick:** 8 ทิศ = infinite directions = การเดินทางที่ไม่ตายตัว

### Color Tokens (`styles/brand.css`)
```css
:root {
  /* Primary */
  --brand-primary:        19 62% 56%;   /* #D4614A cha thai terracotta */
  --brand-primary-light:  16 52% 67%;   /* #E8906B terracotta light */
  --brand-primary-fg:     0  0%  100%;  /* white text on primary */

  /* Base */
  --brand-espresso:       24 53% 16%;   /* #2C1A0E logo / headings */
  --brand-bg:             38 27% 91%;   /* #F0EDE6 cream linen (textured) */
  --brand-surface:        0  0%  100%;  /* #FFFFFF white cards */
  --brand-muted:          22 18% 43%;   /* #6B5B4E gray body text */

  /* Accent palette (category colors, badges) */
  --brand-matcha:         137 36% 65%;  /* #8BC99A success / nature */
  --brand-sky:            207 68% 81%;  /* #A8D4F0 info / calm */
  --brand-sun:            52  82% 68%;  /* #F0E06B warning / happy */
  --brand-joyfull:        260 37% 80%;  /* #C4B8E8 playful / secondary */
}
```
> Shadcn CSS vars mapping: ตั้งค่าใน `globals.css` ให้ `--primary` = `--brand-primary`, `--background` = `--brand-bg` ฯลฯ

### Typography
- **Display / Headings:** Prompt (Google Fonts) — Bold/ExtraBold, Uppercase สำหรับ section headers
- **Body:** Noto Sans Thai (Google Fonts) — Regular/Medium, อ่านสบาย
- **Mono / Data:** JetBrains Mono — ใช้ใน code snippet, tracking id
- **Type scale:** ยึด Tailwind default (`text-xs` → `text-4xl`) + Prompt สำหรับ display

### Visual Direction
- **Mood:** Cozy · Warm · Playful · Inviting — ไม่ใช่ corporate dashboard
- **Background:** Cream linen texture — ให้รู้สึกเหมือนสมุดบันทึกการเดินทาง
- **Border radius:** 16-24px (rounded-2xl / rounded-3xl) สำหรับ cards — friendly, ไม่ sharp
- **Cards:** Colored blocks ใช้สีจาก accent palette แทน border — แต่ละ category ใช้คนละสี
- **Icons:** Rounded filled style (lucide-react rounded variant) — ไม่ใช่ outline เท่านั้น
- **Shadows:** Soft, warm-tinted shadow `rgba(44,26,14,0.10)` แทน neutral gray

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
| — | Deploy | Lightsail instance เดียว + Docker Compose | ต้นทุน ≤ $25/mo ใน Phase 1 |
| 2026-08-19 | Next.js version | **16.3.1** + React 19.2.8 + TS 5.9.3 + Tailwind 4.3.3 | ดู `docs/adr/0002` — มี 2 จุดที่ค้างเวอร์ชันไว้พร้อมเหตุผล (air, ESLint) |
| 2026-08-20 | PDF renderer | **Gotenberg** เป็น compose profile แยก (`--profile pdf`) | chromedp = Chrome ทั้งตัวใน image API บนเครื่อง 2 GB; Gotenberg เป็น container ที่เปิดเฉพาะตอนใช้ และ `GOTENBERG_URL` ว่าง = export HTML ได้ปกติ |
| 2026-08-20 | Affiliate approve status | seed 6 เจ้าใน DB แล้ว (Agoda, Booking, Klook, KKday, Rentalcars, Airalo) — **ยังไม่ได้สมัครจริง** | เก็บ partner ไว้ใน `affiliate_partners` ไม่ใช่ในโค้ด จะได้เปลี่ยน template/commission โดยไม่ deploy |
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
| 2026-08-19 | Repo layout | **Monorepo** `apps/api` + `apps/web` + `.env` เดียว (ต่างจาก §0 ที่ระบุ 2 repo) | prototype คนเดียว — 2 repo = 2 CI, 2 env ที่ drift, และ PR ที่ต้อง merge ตามลำดับ ดู `docs/adr/0001` |
| 2026-08-20 | AI tools | resolve facts **ก่อน** เรียกโมเดล แล้วแนบเป็น `facts` block (ไม่ใช้ tool-use loop) | tool loop = 5+ round trip ต่อการร่าง 1 ครั้ง บน job ที่ retry+repair อยู่แล้ว การันตีเท่ากัน เพราะ validator ตรวจซ้ำด้วย Go อยู่ดี ดู `docs/adr/0003` |
| 2026-08-20 | Export | **synchronous** คืน signed URL เลย (§5.11 ออกแบบเป็น job) | แพลน 7 วัน render ไม่ถึงวินาที — job + polling UI เกินความจำเป็น เก็บ queue ไว้ให้ AI ที่ใช้เวลาเป็นนาทีจริง ๆ |
| 2026-08-20 | Email | **Resend** (§2.2 ให้เลือกกับ Gmail API) | Gmail ต้องมี consent screen + refresh token ต่อผู้ส่ง สำหรับ invite fallback ไม่กี่ฉบับไม่คุ้ม; ไม่ตั้งค่า = ข้ามการส่ง ไม่ทำให้ invite พัง |
| 2026-08-20 | UI components | เขียน component เองบน Tailwind + lucide (ไม่ได้รัน shadcn CUI) | §15 ต้องการ card สีทึบ ไม่มี border, radius 16-24px, เงาโทนอุ่น — override shadcn ทุกตัวจนเหลือแต่โครง สู้เขียนตรง ๆ 8 ไฟล์ดีกว่า; `dialog` ใช้ `<dialog>` ของ platform เลยได้ focus trap + Escape ฟรี |
| 2026-08-20 | Sort order | dense `0..n-1` renumber ทุกครั้งที่ย้าย (ไม่ใช้ fractional index) | วันหนึ่งมีราว 10 รายการ — renumber ถูกกว่าและตัดบั๊ก "precision หมด" ทิ้งทั้งกลุ่ม |
| 2026-08-20 | Coverage | คำนวณสดตอนอ่าน `GET /coverage` (คอลัมน์ที่เก็บไว้เป็น cache สำหรับ list) | board ไม่มีวันค้างหลังแก้ item ด้วยมือ และ hook A3.5 กลายเป็น optimisation ไม่ใช่เงื่อนไขความถูกต้อง |
| 2026-08-20 | Expense privacy | ทำเป็น **โครงสร้าง** ไม่ใช่ flag — `public.handler.go` ไม่มี path ไปยังตาราง expense เลย | flag ที่ payload builder ต้องอ่าน = บั๊กที่รอเกิด; แบบนี้ leak ไม่ได้แม้จะพลิกค่า |

---

## 17. Definition of Done (ทุก task)
- **API:** มี handler + store + domain logic แยกชั้นถูกต้อง, scope ด้วย tripID, เขียน activity_log, emit SSE, มี unit test ของ domain logic, `go vet`/lint ผ่าน
- **Web:** ผ่าน typecheck/lint, ใช้ query key factory, mutation มี optimistic + rollback, มี loading/empty/error, ทดสอบที่ 375px, สีและ token อ้างอิงจาก `styles/brand.css` เสมอ (ห้าม hardcode hex)
- ไม่มี secret ใน client bundle
- FX display ต้องมี label โดยประมาณและวันที่ทุกที่
- Expense payload ไม่ปรากฏใน public/share response
- อัปเดต checklist ในไฟล์นี้ + Decision Log ถ้ามีการตัดสินใจ
