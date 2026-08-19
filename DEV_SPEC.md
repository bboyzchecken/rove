# DEV_SPEC.md — Collaborative Trip Planning Platform (Japan-first)

> Source of truth สำหรับ dev — ใช้กับ Claude Code
> Product rationale อ้างอิง `trip-planning-platform-plan.md`
> **BRAND (§15) เว้นว่างไว้ — จะเติมทีหลัง** ห้าม hardcode ชื่อ/สี/โลโก้ ใช้ token placeholder เท่านั้น
> Backend ยึดตาม `PROJECT_TEMPLATE.md` (Go + Echo + GORM + Uber FX + MySQL) — ห้ามเปลี่ยน pattern โดยไม่บันทึกใน Decision Log

---

## 0. วิธีใช้ไฟล์นี้กับ Claude Code

- อ่าน §1–§7 ให้ครบก่อนเริ่มงานทุกครั้ง (ภาพรวม, stack, repo, data model, API contract, conventions)
- งานทั้งหมดอยู่ใน checklist §9–§12 แยกตาม Phase → ทำตามลำดับ ห้ามข้าม Phase
- ทุก task ที่เสร็จ ติ๊ก `[x]` ในไฟล์นี้ + commit message อ้าง task id เช่น `feat(api): T3.4 wishlist coverage endpoint`
- การตัดสินใจนอกสเปค → บันทึก §16 Decision Log ก่อนทำ
- ห้ามเพิ่ม feature นอก Phase ปัจจุบัน แม้จะ "ทำได้ง่าย"
- **Repo แยก 2 ตัว**: `xxx-api` (Go) และ `xxx-web` (Next.js) — dev คนละ checklist ได้ ขนานกันได้ตาม §9

---

## 1. ภาพรวมระบบ

**สิ่งที่สร้าง:** เว็บแอปให้กลุ่มเพื่อนสร้าง "ห้องทริป" ร่วมกัน → แต่ละคนใส่ wishlist → AI ร่างแพลนรายวัน + งบ + เหตุผล → กลุ่มแก้/คอมเมนต์/โหวตร่วมกัน → แชร์ลิงก์/เปิด public ให้คนอื่น clone → ทุก item มีปุ่มจอง affiliate ที่ track ได้

**ผู้ใช้ฟรี** รายได้จาก affiliate

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
   ├→ Open-Meteo, FX API
   └→ Cloudflare R2 (export files, OG images, uploads)
```

**Deploy Phase 1:** AWS **Lightsail** ตัวเดียว (Docker Compose: api + mysql + redis + caddy) + Next.js บน **Lightsail container/instance เดียวกัน** หรือ Vercel free tier — ดู §8

---

## 2. Tech Stack (ตัดสินใจแล้ว)

### 2.1 Frontend (`xxx-web`)
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

### 2.2 Backend (`xxx-api`) — ตาม PROJECT_TEMPLATE.md
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
| Storage | AWS SDK v2 → **Cloudflare R2** | export html/pdf, og image |
| Cache/Queue/PubSub | **Redis** (go-redis) | AI job queue, SSE pubsub, rate limit, cache POI/distance/weather/fx |
| Worker | goroutine pool ในโปรเซสเดียวกัน (Phase 1) | แยก binary เมื่อโหลดสูง (Phase 2) |
| PDF | headless Chrome ผ่าน `chromedp` หรือเรียก service `gotenberg` container | เลือกใน T10.4 แล้วบันทึก Decision Log |
| Email | Gmail API (ตาม template) หรือ Resend | ใช้เท่าที่จำเป็น (invite fallback) |
| Test | `go test` + testify + sqlmock/testcontainers | |

### 2.3 Infra
| ส่วน | Phase 1 (low cost) | โตขึ้นแล้วย้ายไป |
|---|---|---|
| Compute | **AWS Lightsail instance** 2 vCPU / 2 GB (~$12/mo) รัน Docker Compose | Lightsail 4GB → ECS Fargate / EC2 + RDS |
| DB | MySQL container บน instance เดียวกัน + snapshot รายวัน | Lightsail Managed Database → RDS |
| Redis | container เดียวกัน | ElastiCache |
| Reverse proxy/TLS | **Caddy** container (auto Let's Encrypt) | ALB + ACM |
| Object storage | Cloudflare R2 (egress ฟรี) | คงเดิม |
| Frontend hosting | Vercel (Hobby) หรือ container บน Lightsail เดียวกัน | Vercel Pro / Amplify |
| DNS/CDN | Cloudflare (free) | คงเดิม |
| Backup | Lightsail auto snapshot + `mysqldump` → R2 รายวัน | RDS automated backup |
| CI/CD | GitHub Actions → build image → GHCR → ssh deploy script | ECR + ECS deploy |
| Monitoring | Uptime Kuma container + Lightsail metrics + Logrus → file → Loki (ทีหลัง) | CloudWatch/Grafana |

> เป้าหมายค่าใช้จ่าย Phase 1: **≤ $25/เดือน** ไม่รวม AI API และ Google Maps API

---

## 3. โครง Repository

### 3.1 `xxx-api` (Go — ยึด PROJECT_TEMPLATE.md)
```
xxx-api/
├── main.go                     # env → viper → FX app → migrate → Echo :5000
├── seeder.go                   # seed users/pois/template plans
├── docker-compose.yml          # mysql + redis (local dev)
├── Dockerfile                  # multi-stage go → alpine
├── deploy/
│   ├── docker-compose.prod.yml # api + mysql + redis + caddy (+ web ถ้ารวม)
│   ├── Caddyfile
│   └── deploy.sh               # pull image + up -d + healthcheck
├── migrations/                 # *.sql ที่ทำมือ (documentation)
├── data/
│   ├── poi/jp.csv              # seed POI
│   ├── prep_rules.json         # rule blocks (Phase 2)
│   └── templates/              # template plans
└── pkg/
    ├── core/config.go          # Config struct (§6.1)
    ├── handlers/api/
    │   ├── api.go              # Server struct + route registration
    │   ├── middleware.go       # JWT, optional JWT, admin, trip role guard, rate limit
    │   ├── request/request.go  # pagination, hash, otp, ctx helpers
    │   ├── auth.handler.go
    │   ├── user.handler.go
    │   ├── trip.handler.go
    │   ├── member.handler.go
    │   ├── wishlist.handler.go
    │   ├── plan.handler.go
    │   ├── item.handler.go
    │   ├── budget.handler.go
    │   ├── prep.handler.go
    │   ├── comment.handler.go
    │   ├── vote.handler.go
    │   ├── poi.handler.go
    │   ├── ai.handler.go
    │   ├── booking.handler.go
    │   ├── public.handler.go   # public plan, explore, clone
    │   ├── export.handler.go
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
    │   ├── fx/                 # exchange rate + cache
    │   ├── storage/            # R2
    │   ├── email/              # gmail/resend
    │   ├── affiliate/          # deeplink builder + partner registry
    │   ├── events/             # SSE hub (redis pubsub)
    │   └── jobs/               # redis queue + worker pool
    ├── domain/                 # pure logic (ไม่มี DB): budget, coverage, validate, match
    ├── logger/
    └── utils/{dateutil,hashutil,str,validator}
```

### 3.2 `xxx-web` (Next.js)
```
xxx-web/
├── app/
│   ├── (marketing)/            # landing, /explore
│   ├── (app)/t/[tripId]/       # trip room: overview|wishlist|plan|budget|prep|bookings|discussion|compare
│   ├── p/[slug]/               # public plan (ISR)
│   ├── s/[shareToken]/         # private share view
│   ├── invite/[token]/
│   ├── u/[handle]/             # creator profile (Phase 2)
│   └── api/                    # BFF: auth cookie exchange, og-image, (proxy ถ้าจำเป็น)
├── components/{ui,trip,editor,wishlist,budget,prep,public,common}/
├── features/                   # 1 โฟลเดอร์ต่อ domain: api.ts (fetcher) + queries.ts (hooks) + types.ts
├── lib/{api-client.ts,auth.ts,sse.ts,format.ts,flags.ts}
├── stores/                     # zustand (UI state เท่านั้น)
├── messages/th.json            # next-intl
└── styles/{globals.css,brand.css}   # brand.css = §15 placeholder
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

**users** — `id, display_name, avatar_url, handle(uniq,null), email(uniq,null), password(json:"-"), provider('line'|'google'|'password'), provider_uid, role('user'|'admin'), status('active'|'deactivated'), is_creator, locale, home_currency`

**trips** — `id, owner_id, title, slug(uniq,null), destination_country, destination_cities(JSON), start_date, end_date, party_size, home_currency, dest_currency, fx_rate, fx_rate_at, visibility('private'|'link'|'public'), share_token(uniq,null), status('draft'|'planning'|'final'|'done'), source_trip_id, source_creator_id, final_plan_id, cover_image_url, summary, clone_count, view_count`

**trip_members** — `trip_id, user_id, role('owner'|'editor'|'viewer'), joined_at` — PK รวม, index `(user_id)`

**trip_invites** — `id, trip_id, token(uniq), role, expires_at, created_by, used_count, max_uses`

**trip_flights** — `id, trip_id, direction('out'|'return'), airline, flight_no, dep_airport, arr_airport, dep_at, arr_at, raw_text`

**member_profiles** — `trip_id, user_id (PK รวม), visited_before, pace('chill'|'normal'|'packed'), walk_level, can_drive, has_idp, budget_min, budget_max, dietary(JSON), traveling_with(JSON), notes`

**wishlist_items** — `id, trip_id, member_id, kind('must'|'nice'|'avoid'), text, tags(JSON), poi_id, coverage('covered'|'partial'|'uncovered'|'na'), covered_by_item_ids(JSON), coverage_note, sort_order`

**plans** — `id, trip_id, name, parent_plan_id, version, is_final, created_by('ai'|'user'), created_by_user_id, summary, pros(JSON), cons(JSON), key_decision, status('generating'|'ready'|'error'), generation_job_id`

**days** — `id, plan_id, date, day_index, title, theme, sort_order`

**items** — `id, day_id, plan_id, sort_order, type('place'|'food'|'stay'|'transport'|'flight'|'free'|'note'), poi_id, title, notes, start_time, end_time, duration_min, travel_mode, travel_min, travel_note, cost_amount, cost_currency, cost_basis('per_person'|'per_group'|'per_night'|'per_unit'), cost_status('estimate'|'quoted'|'actual'|'paid'), cost_note, is_prepaid, booking_partner, booking_url, booking_status('none'|'clicked'|'booked'|'skipped'), verified('verified'|'unverified'), lat, lng`
index: `(plan_id, day_id, sort_order)`

**item_versions** — `id, item_id, plan_id, snapshot(JSON), changed_by, change_source('user'|'ai'), created_at` (ใช้ undo/diff)

**pois** — `id, name_th, name_en, name_ja, country, city, area, category, tags(JSON), lat, lng, google_place_id, open_hours(JSON), closed_days(JSON), seasonal_note, avg_visit_min, avg_cost_jpy, cost_note, tips, image_url, partner_links(JSON), is_active, source, quality_score`
index: `(country, city, area)`, FULLTEXT `(name_th, name_en, name_ja)`

**comments** — `id, trip_id, target_type('trip'|'plan'|'day'|'item'|'wishlist'), target_id, user_id, body, parent_id`

**votes** — `id, trip_id, target_type('plan'|'item'|'poll'), target_id, user_id, choice, reason` — uniq `(target_type,target_id,user_id)`

**polls** (Phase 2) — `id, trip_id, item_id, question, options(JSON), closes_at, closed`

**rationales** — `id, plan_id, item_id, wishlist_item_id, kind('cut'|'moved'|'chosen'|'added'|'warning'), text, created_by('ai'|'user')`

**activity_logs** — `id, trip_id, user_id, action, target_type, target_id, meta(JSON), created_at`

**prep_blocks** — `id, trip_id, type('weather'|'packing'|'rule'|'docs'|'custom'), trigger, title, content_md, checklist(JSON), sort_order, generated_by`

**tasks** (Phase 2) — `id, trip_id, title, assignee_id, due_date, done`

**ai_jobs** — `id, trip_id, plan_id, kind('generate'|'refine'|'explain'|'normalize'|'parse_ticket'), status('queued'|'running'|'done'|'error'), step, input(JSON), output(JSON), error, tokens_in, tokens_out, cost_usd, created_at, finished_at`

**booking_clicks** — `id, trip_id, plan_id, item_id, user_id, partner, tracking_id(uniq), target_url, clicked_at, ua, referrer, source_creator_id`

**booking_confirmations** — `id, tracking_id, partner, partner_ref, amount, currency, commission, status('pending'|'confirmed'|'cancelled'), confirmed_at, raw(JSON)`

**affiliate_partners** — `key(PK), name, item_types(JSON), deeplink_template, subid_param, enabled, priority, notes`

**plan_clones** — `id, source_trip_id, new_trip_id, user_id, created_at`

**trip_reviews** (Phase 3) — `id, trip_id, user_id, rating, actual_budget_per_person, body`

**caches** (หรือใช้ Redis อย่างเดียว) — `distance_cache(from_key,to_key,mode,minutes,meters,fetched_at)`, `weather_cache`, `fx_cache`

### 4.3 Authorization (แทน RLS)
MySQL ไม่มี RLS → **บังคับสิทธิ์ที่ Go middleware + store layer**
- `TripRoleMiddleware(minRole)` — โหลด `trip_members` ของ user ปัจจุบัน แล้ว set `c.Set("trip_role", ...)`; ลำดับ `viewer < editor < owner`
- ทุก store method ที่แตะข้อมูลใน trip **ต้องรับ `tripID` เป็นพารามิเตอร์และ WHERE ด้วยเสมอ** (ห้าม query by id เดี่ยว ๆ) — ป้องกัน IDOR
- Public/share access ผ่าน handler แยก (`public.handler.go`) ที่อ่านเฉพาะฟิลด์ที่เปิดเผยได้ ตาม privacy setting
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

### 5.2 Trip
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

### 5.3 Wishlist / Profile
```
GET    /api/v1/trips/:tripId/wishlist                 ทั้งหมด + coverage
POST   /api/v1/trips/:tripId/wishlist                 เพิ่ม (ของตัวเอง)
PATCH  /api/v1/trips/:tripId/wishlist/:id
DELETE /api/v1/trips/:tripId/wishlist/:id
GET    /api/v1/trips/:tripId/profile/me
PUT    /api/v1/trips/:tripId/profile/me
GET    /api/v1/trips/:tripId/coverage                 coverage board (คำนวณสด)
```

### 5.4 Plan / Item
```
GET    /api/v1/trips/:tripId/plans                    list variants
POST   /api/v1/trips/:tripId/plans                    สร้าง variant (copy/fork)  [editor]
GET    /api/v1/plans/:planId                          full plan (days+items+rationales)
PATCH  /api/v1/plans/:planId                          rename/summary             [editor]
DELETE /api/v1/plans/:planId                                                     [editor]
POST   /api/v1/plans/:planId/freeze                   set final                  [owner]
POST   /api/v1/plans/:planId/snapshot                 version++                  [editor]
GET    /api/v1/plans/:planId/validate                 issues[] (สด)
POST   /api/v1/plans/:planId/days                     เพิ่มวัน
POST   /api/v1/plans/:planId/items                    เพิ่ม item
PATCH  /api/v1/items/:itemId                          แก้ item
POST   /api/v1/items/:itemId/move                     {day_id, position}
DELETE /api/v1/items/:itemId
POST   /api/v1/items/:itemId/undo                     คืนจาก item_versions
GET    /api/v1/plans/:planId/compare?with=planId2     metrics เทียบ (Phase 2)
```

### 5.5 Budget / Prep
```
GET    /api/v1/plans/:planId/budget            สรุปตาม category + per person + prepaid
GET    /api/v1/trips/:tripId/prep              blocks + checklist
POST   /api/v1/trips/:tripId/prep              custom block
PATCH  /api/v1/prep/:blockId                   แก้ / ติ๊ก checklist
POST   /api/v1/trips/:tripId/prep/regenerate   weather+packing ใหม่
```

### 5.6 Collaboration
```
GET/POST /api/v1/trips/:tripId/comments?target_type=&target_id=
DELETE   /api/v1/comments/:id
POST     /api/v1/votes                          {target_type,target_id,choice,reason}
GET      /api/v1/trips/:tripId/events           **SSE stream** (event: item.updated|plan.ready|comment.created|...)
```

### 5.7 AI
```
POST /api/v1/trips/:tripId/ai/generate    {variants?:1..3, hints?} → {job_id}
POST /api/v1/plans/:planId/ai/refine      {instruction} → {job_id}
POST /api/v1/ai/parse-ticket              {text} → {flights[], suggested_trip}
GET  /api/v1/ai/jobs/:jobId               status/step/result (หรือฟังผ่าน SSE)
POST /api/v1/plans/:planId/ai/apply-diff  {job_id, accepted_diff_ids[]}   [editor]
```

### 5.8 POI / Booking / Public / Export
```
GET  /api/v1/pois/search?q=&city=&category=      ค้น POI (FULLTEXT + redis cache)
GET  /api/v1/pois/:id
POST /api/v1/pois/resolve                        {google_maps_url|place_id|text} → POI (สร้างถ้ายังไม่มี, source='google')

POST /api/v1/items/:itemId/booking-link          → {tracking_id, redirect_url}
GET  /go/:trackingId                             302 → partner (นับ click)   [no auth]
POST /api/v1/items/:itemId/booking-status        {status}
GET  /api/v1/trips/:tripId/bookings

GET  /public/plans/:slug                         [no auth] public plan payload (ตาม privacy)
GET  /public/explore?city=&days=&month=&budget=&tags=&sort=   [no auth]
POST /public/plans/:slug/view                    นับ view (fire-and-forget)

POST /api/v1/trips/:tripId/export                {format:'html'|'pdf'} → {job_id}
GET  /api/v1/exports/:id                         → signed R2 url
POST /webhooks/affiliate/:partner                [no auth, verify signature]
```

### 5.9 SSE (`events.handler.go`)
- endpoint: `GET /api/v1/trips/:tripId/events` (JWT ผ่าน query token หรือ cookie)
- ใช้ Redis Pub/Sub channel `trip:{tripId}` — ทุก mutation publish `{type, target_type, target_id, actor_id, ts}`
- Frontend: hook `useTripEvents(tripId)` → `queryClient.invalidateQueries({queryKey:[...]})` ตาม type
- heartbeat ทุก 20s, reconnect อัตโนมัติ (EventSource ทำเอง) + refetch on reconnect

---

## 6. Backend Conventions (ต่อจาก PROJECT_TEMPLATE.md)

### 6.1 Config (`pkg/core/config.go`)
```go
type Config struct {
    Environment string; Commit string; Port string
    JwtSecret   string
    MySQL       MySQLConfig
    Redis       RedisConfig
    R2          R2Config
    Anthropic   AnthropicConfig   // ApiKey, ModelPlanner, ModelFast, MaxTokens
    Google      GoogleConfig      // MapsServerKey, OAuthClientID/Secret
    Line        LineConfig        // LoginChannelID/Secret, MessagingToken
    FX          FXConfig
    AppBaseURL  string            // สำหรับ deeplink /go/:id, invite url
    WebBaseURL  string
    Affiliate   map[string]string // partner key → id
}
```

### 6.2 Layer rules
- Handler ทำแค่: bind → validate → เรียก store/service → map เป็น response DTO (ห้ามใส่ business logic)
- **Business logic บริสุทธิ์อยู่ใน `pkg/domain/`** และต้องมี unit test: `budget.go`, `coverage.go`, `validate.go`, `match.go`, `zones.go`
- Store รับ/คืน model, ต้อง scope ด้วย `tripID` เสมอ (§4.3)
- Service ภายนอก (places/weather/fx/ai/storage) ต้องอยู่หลัง interface เพื่อ mock ได้
- ทุก mutation เขียน `activity_logs` + publish SSE event (ทำผ่าน helper `s.emit(tripID, event)`)
- Transaction: การเขียนหลายตาราง (persistPlan, clone, applyDiff) ต้องอยู่ใน `db.Transaction`
- Rate limit: Echo middleware + Redis — guest, per-user, per-endpoint (AI endpoints เข้ม)

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

---

## 7. Frontend Conventions

### 7.1 TanStack Query
- `QueryClient` default: `staleTime: 30_000`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false` (realtime มาจาก SSE)
- **Query key factory ต่อ feature** ห้ามเขียน key ดิบ:
```ts
export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string) => [...tripKeys.all, id] as const,
  members: (id: string) => [...tripKeys.detail(id), 'members'] as const,
  wishlist: (id: string) => [...tripKeys.detail(id), 'wishlist'] as const,
  coverage: (id: string) => [...tripKeys.detail(id), 'coverage'] as const,
  activity: (id: string) => [...tripKeys.detail(id), 'activity'] as const,
}
export const planKeys = {
  all: ['plans'] as const,
  list: (tripId: string) => [...planKeys.all, 'list', tripId] as const,
  detail: (planId: string) => [...planKeys.all, planId] as const,
  budget: (planId: string) => [...planKeys.detail(planId), 'budget'] as const,
  validate:(planId: string) => [...planKeys.detail(planId), 'validate'] as const,
}
```
- Mutation ที่แก้ item/day ต้องทำ **optimistic update** (`onMutate` cancel + snapshot + rollback) แล้ว invalidate `planKeys.detail`, `planKeys.budget`, `tripKeys.coverage`
- SSR: หน้า public/share ใช้ `HydrationBoundary` + `dehydrate` จาก server fetch
- AI job: `useQuery` polling 2s **เฉพาะตอนไม่มี SSE** — ปกติฟัง SSE แล้ว invalidate
- Infinite list (explore, activity, comments) ใช้ `useInfiniteQuery` แบบ cursor
- ห้ามเรียก `fetch` ตรงใน component — ต้องผ่าน `features/<domain>/api.ts` + hook ใน `queries.ts`

### 7.2 อื่น ๆ
- TypeScript strict, ห้าม `any`; type ของ API generate จาก OpenAPI (`openapi-typescript`) — Go เขียน swagger annotation (Phase 1 ทำมือได้ แต่ต้องมี `features/*/types.ts` ตรงกับ API)
- Auth: JWT เก็บใน **httpOnly cookie** ที่ตั้งจาก Next route handler หลัง OAuth callback; api-client แนบ `Authorization` ฝั่ง server, ฝั่ง client ใช้ cookie ผ่าน proxy `/api/proxy/*`
- mobile-first 375px, ทดสอบ dnd บนมือถือจริง
- ทุกหน้ามี loading/empty/error state
- Feature flags: `lib/flags.ts` อ่านจาก env

---

## 8. Deployment (AWS Lightsail — low cost)

### 8.1 Phase 1 topology (instance เดียว)
```
Lightsail Ubuntu 2 vCPU / 2 GB / 60 GB SSD  ($12/mo)  + static IP (ฟรีเมื่อ attach)
└── docker compose -f deploy/docker-compose.prod.yml
    ├── caddy      :80/:443  → TLS อัตโนมัติ, reverse proxy
    │     api.<domain>  → api:5000
    │     <domain>      → web:3000 (ถ้าไม่ใช้ Vercel)
    ├── api        (Go binary, alpine)
    ├── web        (Next.js standalone output)  [optional]
    ├── mysql:8.0  volume ./data/mysql, my.cnf ปรับ innodb_buffer_pool_size=512M
    └── redis:7    volume ./data/redis, maxmemory 128mb allkeys-lru
```
- ถ้า RAM ตึง: ย้าย web ไป Vercel Hobby (ฟรี) → เหลือ api+mysql+redis บน 2GB สบาย
- เปิดเฉพาะพอร์ต 22/80/443 ใน Lightsail firewall; MySQL/Redis ไม่ expose ออกนอก
- swap file 2GB กัน OOM ตอน build/AI burst

### 8.2 CI/CD
1. GitHub Actions: `go test` + `go build` → build image → push **GHCR**
2. ssh เข้า Lightsail → `deploy/deploy.sh` → `docker compose pull && up -d` → healthcheck `/healthz`
3. Web (ถ้าอยู่บน Vercel) deploy อัตโนมัติจาก branch

### 8.3 Backup / Ops
- Lightsail automatic snapshot รายวัน (เก็บ 7 วัน)
- cron: `mysqldump` gzip → อัป R2 ทุกวัน เก็บ 30 วัน + ทดสอบ restore เดือนละครั้ง
- Logrus → stdout → docker json-file (rotate 10MB×3); Uptime Kuma ping `/healthz` + แจ้ง LINE
- `/healthz` เช็ค DB + Redis; `/readyz` สำหรับ deploy gate

### 8.4 เส้นทาง scale (บันทึกไว้ ไม่ต้องทำตอนนี้)
2GB → 4GB instance → แยก MySQL ไป Lightsail Managed DB → ย้าย API ไป ECS Fargate + RDS + ElastiCache เมื่อ trips/วัน > ~2k หรือ AI worker แย่ง CPU

---

## 9. Phase 0 — Setup & Validate

### API (`xxx-api`)
- [ ] A0.1 init repo ตาม template: main.go + FX + Echo + GORM + Viper + Logrus + validator
- [ ] A0.2 `docker-compose.yml` (mysql 8 + redis) สำหรับ local, `.env.example` ครบ §6.1
- [ ] A0.3 gormigrate migration แรก: users, trips, trip_members, pois (AutoMigrate)
- [ ] A0.4 Auth: JWT HS256 + `JwtMiddleware` + `OptionalJwt` + `IsAdmin` (ตาม template) + `TripRoleMiddleware`
- [ ] A0.5 OAuth LINE Login + Google → สร้าง/ผูก user → ออก JWT
- [ ] A0.6 `pkg/store/store.go` pagination + `pkg/utils/*` ตาม template
- [ ] A0.7 Redis client + rate limit middleware + cache helper
- [ ] A0.8 `/healthz`, `/readyz`, request logger, CORS (allow WebBaseURL), Recover, Secure
- [ ] A0.9 Dockerfile multi-stage + GitHub Actions (test/build/push GHCR)
- [ ] A0.10 `deploy/` (compose.prod, Caddyfile, deploy.sh) + สร้าง Lightsail instance + domain + TLS ผ่านจริง

### Web (`xxx-web`)
- [ ] W0.1 `pnpm create next-app@latest` (App Router, TS strict) + บันทึกเวอร์ชันใน Decision Log
- [ ] W0.2 Tailwind + shadcn/ui + lucide + `styles/brand.css` (placeholder §15)
- [ ] W0.3 TanStack Query provider + devtools + default options §7.1
- [ ] W0.4 `lib/api-client.ts` (fetch wrapper: base url, auth, error → typed) + `features/` skeleton
- [ ] W0.5 Auth flow: LINE/Google button → callback route → set httpOnly cookie → `useMe()`
- [ ] W0.6 Zustand store สำหรับ UI state + next-intl + PostHog + flags
- [ ] W0.7 Vercel (หรือ container) deploy preview ต่อ PR

### Data / Ops
- [ ] D0.1 zone codes ญี่ปุ่นใน `pkg/domain/zones.go` (tokyo_east/west/bay, yokohama, kamakura, fuji, kawagoe, …)
- [ ] D0.2 `data/poi/jp.csv` + validator + import command (`go run main.go seed:poi`)
- [ ] D0.3 seed POI ทุกจุดจาก `index.html` (Disney, DisneySea, Tsukiji, Sensoji, Skytree, Ueno NM, Ameyoko, Akihabara, Kawagoe, Ikebukuro, Shinjuku, TeamLab Planets, Tokyo Tower/Shiba, Takeshita, Shibuya Sky/Hachiko, Roppongi, Kamakura crossing, Enoshima, Cup Noodles, Red Brick, Chureito, Honcho St, Oishi Park, Oshino Hakkai, Kani Doraku, Yakiniku Bou-ya, Hotel Mifujien) + เติมให้ ≥ 300 จุด
- [ ] D0.4 enrich จาก Google Places (place_id, lat/lng, open_hours) + cache
- [ ] D0.5 `data/templates/` 3 แพลนต้นแบบ (Tokyo Base, Yokohama Base, +1)
- [ ] D0.6 สมัคร affiliate (Agoda, Booking, Klook, KKday, Rentalcars, Airalo) + seed `affiliate_partners`
- [ ] D0.7 ADR แรก: stack, id strategy, deploy target

---

## 10. Phase 1 — MVP

**DoD:** กลุ่ม 4 คนสร้างทริปญี่ปุ่น ใส่ wishlist ทุกคน กด AI ร่างแพลน แก้ timeline ร่วมกัน เห็นงบต่อคน export/แชร์ลิงก์ และกดปุ่มจองที่พัก/กิจกรรมแล้ว track ได้ — ทำงานจริงบน Lightsail

### M1 Entry Points
- [ ] A1.1 `POST /trips` รองรับ entry_type ('date'|'city'|'ticket'|'clone')
- [ ] A1.2 `POST /ai/parse-ticket` → flights + suggested frame
- [ ] W1.1 Landing 3 การ์ด (เริ่มจากวัน / เมือง / วางข้อความตั๋ว)
- [ ] W1.2 Flow วัน: date range → เมือง (optional) → party size → create → redirect
- [ ] W1.3 Flow เมือง: chips เมือง → แนะนำจำนวนวัน → วัน → create
- [ ] W1.4 Flow ตั๋ว: textarea → preview flights → confirm → create
- [ ] W1.5 Onboarding checklist ใน Overview (ชวนเพื่อน / ใส่ wishlist / กด AI)
- [ ] X1.1 e2e: ทุก entry ได้ทริปใน ≤ 3 หน้าจอ

### M2 Trip Room
- [ ] A2.1 trip CRUD + flights + overview payload (counts, flags)
- [ ] A2.2 invites: create/accept, role guard ครบทุก endpoint
- [ ] A2.3 members list/patch/remove
- [ ] A2.4 activity_logs + `GET /activity` (cursor)
- [ ] A2.5 SSE hub (redis pubsub) + `GET /events` + emit helper ในทุก mutation
- [ ] W2.1 Layout `/t/[tripId]` + tabs + mobile bottom nav
- [ ] W2.2 Overview: Trip Frame card, members, สถานะ, quick actions
- [ ] W2.3 Inline edit frame (optimistic)
- [ ] W2.4 Invite dialog + `/invite/[token]`
- [ ] W2.5 Activity feed (infinite query)
- [ ] W2.6 `useTripEvents` hook → invalidate ตาม event type
- [ ] W2.7 Empty/loading/error states ทุก tab

### M3 Wishlist & Coverage
- [ ] A3.1 member_profiles GET/PUT
- [ ] A3.2 wishlist CRUD (เขียนได้เฉพาะของตัวเอง ยกเว้น owner)
- [ ] A3.3 AI normalize wishlist (job) → tags + poi_id
- [ ] A3.4 `pkg/domain/coverage.go` + unit tests + `GET /coverage`
- [ ] A3.5 recompute coverage หลัง items เปลี่ยน (hook ใน service layer)
- [ ] W3.1 Profile form
- [ ] W3.2 Wishlist editor (must/nice/avoid, tags, reorder, delete)
- [ ] W3.3 Coverage Board (✅/⚠️/❌ + note + ลิงก์ไป item)
- [ ] W3.4 แสดง "ใครยังไม่ใส่ wishlist" ใน Overview

### M4 AI Planner
- [ ] A4.1 `services/ai` skeleton: client, schemas, prompts, token accounting
- [ ] A4.2 tools: lookup_poi, get_poi, distance (Google + redis cache), weather, fx
- [ ] A4.3 buildFrame (anchors: flights, prepaid stay, dated must-do, zones)
- [ ] A4.4 generatePlan → PlanDraft (1 variant)
- [ ] A4.5 `pkg/domain/validate.go` (closed day, นอกเวลาเปิด, วันยาวเกิน, travel ไม่สมจริง, must-do หาย, POI ซ้ำ) + tests
- [ ] A4.6 repairPlan (≤2 loops)
- [ ] A4.7 explainPlan → rationales + open_questions
- [ ] A4.8 persistPlan ใน transaction + item_versions
- [ ] A4.9 ai_jobs + redis queue + worker pool + SSE progress
- [ ] A4.10 refinePlan → ItemDiff[] + `apply-diff`
- [ ] A4.11 rate limit + cost cap ต่อ trip/วัน
- [ ] A4.12 eval set 5 ทริป (`services/ai/evals`) วัด schema pass / coverage% / issues / latency
- [ ] W4.1 ปุ่ม "ให้ AI ร่างแพลน" + progress steps (จาก SSE)
- [ ] W4.2 Rationale panel + Open questions (ตอบ → ส่ง refine)
- [ ] W4.3 Refine chat + **Diff preview UI** (accept ทั้งหมด/รายรายการ)

### M5 Itinerary Editor
- [ ] A5.1 day/item CRUD + move (คำนวณ sort_order) + undo จาก item_versions
- [ ] A5.2 `GET /plans/:id` payload เดียวจบ (days+items+rationales+warnings)
- [ ] A5.3 `POST /pois/resolve` (google maps url / place_id / text)
- [ ] W5.1 Plan tab: day tabs + timeline card (เวลา, ชื่อ, POI badge, cost, booking, verified)
- [ ] W5.2 Add item: search POI (debounced) / paste maps url / free text
- [ ] W5.3 Edit item sheet (ครบทุกฟิลด์ §4.2)
- [ ] W5.4 dnd-kit reorder + ข้ามวัน + optimistic + rollback
- [ ] W5.5 Delete + undo
- [ ] W5.6 List view (print-friendly)
- [ ] W5.7 Version snapshot + ดูประวัติ
- [ ] W5.8 Warning badge จาก `/validate`
- [ ] X5.1 ทดสอบ dnd บนมือถือจริง (iOS Safari + Android Chrome)

### M7 Budget
- [ ] A7.1 `pkg/domain/budget.go` (category rollup, per_person/group/night, prepaid แยก, FX) + tests
- [ ] A7.2 `GET /plans/:id/budget` + FX service (cache รายวัน) + override manual
- [ ] W7.1 Budget tab: ตาราง category × (JPY, THB, ต่อคน) + total + prepaid + เทียบงบที่ตั้งไว้
- [ ] W7.2 Highlight item ที่ยังไม่มี cost
- [ ] W7.3 Budget ส่วนตัว (per_person)

### M8 Prep
- [ ] A8.1 weather service (Open-Meteo) + cache → prep block
- [ ] A8.2 packing generator (rule จาก temp band + tags) + AI เสริมข้อความ
- [ ] A8.3 docs checklist default (passport, Visit Japan Web, insurance, eSIM, IDP ถ้ามีรถ)
- [ ] W8.1 Prep tab + checklist ติ๊กร่วมกัน (optimistic + SSE)
- [ ] W8.2 Custom block (markdown)

### M9 Collaboration
- [ ] A9.1 comments CRUD (thread 1 ชั้น) + emit SSE
- [ ] W9.1 Comment thread บน item/day/plan + Discussion tab
- [ ] W9.2 Viewer mode + ปุ่ม "เข้าร่วมทริป"

### M10 Share & Export
- [ ] A10.1 visibility private/link + share_token + `GET /public/plans/:token` (view-only payload)
- [ ] A10.2 export job: render HTML (Go template self-contained ตาม layout index.html) → R2 → signed url
- [ ] A10.3 export PDF (chromedp/gotenberg) — บันทึกทางเลือกที่เลือกใน Decision Log
- [ ] W10.1 Share dialog + copy link
- [ ] W10.2 `/s/[token]` view page (noindex)
- [ ] W10.3 ปุ่ม export + สถานะ job + ดาวน์โหลด
- [ ] W10.4 OG image พื้นฐาน

### M12 Booking (stay + activity)
- [ ] A12.1 `services/affiliate`: partner registry + `BuildDeepLink(partner, item, trackingID)`
- [ ] A12.2 `POST /items/:id/booking-link` + `GET /go/:trackingId` (302 + log click)
- [ ] A12.3 partner selection rule (poi.partner_links → type-based priority)
- [ ] A12.4 booking-status manual + `GET /trips/:id/bookings`
- [ ] A12.5 generic confirmations importer (CSV) + webhook skeleton
- [ ] W12.1 ปุ่มจองบน item card + สถานะ
- [ ] W12.2 Bookings tab (กรองตาม type/สถานะ)

### M13 Admin
- [ ] A13.1 admin guard + POI CRUD + CSV import
- [ ] A13.2 dashboard endpoints (trips, ai cost, clicks, confirmations)
- [ ] W13.1 หน้า admin ง่าย ๆ (table + form)
- [ ] A13.2b feature flags table/env

### Cross-cutting
- [ ] X.1 e2e: create → invite 2 users → wishlist → generate → edit → budget → share → book click
- [ ] X.2 Perf: Trip Room LCP < 2.5s บน 4G; plan 7 วัน × 10 items ลื่นบนมือถือ
- [ ] X.3 Security: integration test cross-trip access ทุกกลุ่ม endpoint + ตรวจ secret ไม่หลุด client bundle
- [ ] X.4 Analytics events §13 ครบ
- [ ] X.5 Backup/restore ทดสอบจริง 1 รอบ
- [ ] X.6 Closed beta 10–20 กลุ่ม + feedback log

---

## 11. Phase 2 — V1 (Variants, Public, Community)

- [ ] A6.1 create variant (fork จาก day index) + key_decision
- [ ] A6.2 AI multi-variant (2–3 ตาม key decision candidates)
- [ ] A6.3 `GET /plans/:id/compare?with=` metrics (cost, per person, travel รวม, coverage%, POI count, warnings)
- [ ] A6.4 votes + freeze plan
- [ ] A6.5 conflict detector (pace/budget/must-do ชนกัน) ก่อน generate
- [ ] W6.1 Compare page (metrics table + parallel timeline + pros/cons)
- [ ] W6.2 Vote UI + freeze
- [ ] A4.13 auto-fix suggestion จาก issues ("ให้ AI แก้")
- [ ] A4.14 partner_price_hint tool → แสดง "จาก ¥…"
- [ ] A5.4 auto travel_min เมื่อ move + warning ไปไม่ทัน/ร้านปิด
- [ ] W5.9 Map view (Google Maps JS): pins ตามวัน + polyline
- [ ] A8.4 rule blocks trigger จาก item (car → IDP/ETC/snow tires, themepark, onsen, multi-city rail pass) จาก `data/prep_rules.json`
- [ ] A9.2 mentions + notification inbox + LINE Messaging notify
- [ ] A9.3 tasks (assign/due/done), polls
- [ ] W9.3 presence/typing indicator (SSE)
- [ ] A10.4 publish flow: slug + privacy opts + `GET /public/plans/:slug`
- [ ] A11.1 `POST /trips/:id/clone` (reset booking/cost_status, source_trip_id/creator, counters)
- [ ] A11.2 `GET /public/explore` filters + sort + index ที่จำเป็น
- [ ] W10.5 Public plan page (ISR + SEO + OG) + ปุ่ม Clone + ปุ่มจอง
- [ ] W11.1 `/explore` + filters + infinite scroll
- [ ] W11.2 Creator profile `/u/[handle]`
- [ ] D2.1 seed 20–30 public plans จากทีม/อินฟลูฯ ก่อนเปิด
- [ ] A12.6 เพิ่ม partner: car rental, eSIM, insurance, flight
- [ ] A12.7 creator attribution ใน booking_clicks
- [ ] A12.8 postback จริงตาม partner ที่ approve

---

## 12. Phase 3 — V2

- [ ] A11.3 `pkg/domain/match.go` match score (dates, budget, tags, party) + `GET /explore?match=`
- [ ] A11.4 clone + AI auto-adapt (วัน/คน/งบต่าง) + diff preview
- [ ] A11.5 reviews + actual budget
- [ ] W10.6 Trip Mode `/t/[id]/now` (วันนี้/ถัดไป, nav, PWA offline cache)
- [ ] W10.7 export .ics + IG story image
- [ ] A7.2b expense split จริง (settle up)
- [ ] A12.9 creator revenue share ledger + payout report
- [ ] A12.10 agent lead handoff (form → email/LINE partner + tracking)
- [ ] I18N: EN + ประเทศที่ 2 (KR/TW): zones, POI, prep rules
- [ ] INFRA: ย้าย MySQL ไป managed DB / แยก AI worker เป็น service แยก

---

## 13. Analytics Events (PostHog)

`trip_created {entry_type}`, `member_invited`, `member_joined`, `wishlist_item_added {kind}`, `profile_completed`,
`ai_generate_started/finished {ms,tokens,issues}`, `ai_refine_applied {diff_count}`, `item_added/moved/deleted {source}`,
`plan_variant_created`, `vote_cast`, `plan_frozen`, `budget_viewed`, `export {format}`, `share_link_created`, `trip_published`,
`public_plan_viewed {slug}`, `trip_cloned`, `booking_click {partner,item_type}`, `booking_marked`, `booking_confirmed {partner,amount}`

Funnel: `trip_created → wishlist_item_added(≥1) → ai_generate_finished → item_moved(≥1) → share_link_created|trip_published → booking_click`

---

## 14. Environment Variables

### API (`.env`)
```
ENV=development
PORT=5000
APP_BASE_URL=https://api.example.com
WEB_BASE_URL=https://example.com
JWT_SECRET_KEY=

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USERNAME=root
MYSQL_PASSWORD=
MYSQL_DATABASE=tripdb

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

R2_ENDPOINT=
R2_REGION=auto
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_EXPORT_BUCKET=
R2_IMAGE_BUCKET=

AFFILIATE_AGODA_ID=
AFFILIATE_BOOKING_AID=
AFFILIATE_KLOOK_AID=
AFFILIATE_KKDAY_ID=
AFFILIATE_RENTALCARS_ID=
AFFILIATE_AIRALO_ID=
ADMIN_EMAILS=
```

### Web (`.env.local`)
```
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
NEXT_PUBLIC_BRAND_NAME=
AUTH_COOKIE_NAME=
AUTH_COOKIE_DOMAIN=
```

---

## 15. BRAND (เว้นไว้ — เติมทีหลัง)

> **TODO (owner):** เติมก่อนจบ Phase 1 จนกว่าจะเติม ห้าม hardcode สี/ชื่อ ใช้ token ด้านล่าง

- ชื่อ product: `{{BRAND_NAME}}` (env `NEXT_PUBLIC_BRAND_NAME`, default `"TripPlanner"`)
- โลโก้: `public/brand/logo.svg` (placeholder)
- Tone of voice: TBD
- Color tokens (`styles/brand.css`) — ค่า default neutral:
```css
:root{
  --brand-primary: 220 14% 20%;
  --brand-primary-fg: 0 0% 100%;
  --brand-accent: 220 14% 45%;
  --brand-bg: 0 0% 100%;
  --brand-surface: 220 14% 96%;
  --brand-muted: 220 9% 46%;
}
```
- Typography: TBD (default system-ui / Noto Sans Thai)
- Icon/illustration style, domain, social handles: TBD

---

## 16. Decision Log

| วันที่ | เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| — | Backend | Go + Echo + GORM + FX + MySQL ตาม PROJECT_TEMPLATE.md | ทีมมี template พร้อม ลด ramp-up |
| — | ID strategy | UUID v4 `CHAR(36)` แทน auto-increment | ป้องกันเดา id, รองรับ clone/share |
| — | Realtime | SSE + Redis pubsub (ไม่ใช้ WebSocket) | อ่านอย่างเดียวพอ, ผ่าน proxy ง่าย, ต้นทุนต่ำ |
| — | Server state | TanStack Query เท่านั้น, Zustand เฉพาะ UI | กัน state ซ้ำซ้อน |
| — | Deploy | Lightsail instance เดียว + Docker Compose | ต้นทุน ≤ $25/mo ใน Phase 1 |
| — | Next.js version | (บันทึกเวอร์ชันจริงตอน init) | สเปคไม่ผูกเลขเวอร์ชัน |
| — | PDF renderer | chromedp หรือ gotenberg (เลือกใน T10.4) | |
| — | Affiliate approve status | (บันทึกเมื่อสมัครแต่ละเจ้า) | |

---

## 17. Definition of Done (ทุก task)
- **API:** มี handler + store + domain logic แยกชั้นถูกต้อง, scope ด้วย tripID, เขียน activity_log, emit SSE, มี unit test ของ domain logic, `go vet`/lint ผ่าน
- **Web:** ผ่าน typecheck/lint, ใช้ query key factory, mutation มี optimistic + rollback, มี loading/empty/error, ทดสอบที่ 375px
- ไม่มี secret ใน client bundle
- อัปเดต checklist ในไฟล์นี้ + Decision Log ถ้ามีการตัดสินใจ
