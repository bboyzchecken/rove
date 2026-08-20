# rove

Collaborative trip planning for groups — Japan first.
A group creates a trip room, everyone adds what they want to see, AI drafts a
day-by-day plan with a budget and reasons, the group edits it together, and the
result can be shared or exported. Every item has a bookable affiliate link.

- **Product rationale** → [trip-planning-platform-plan.md](trip-planning-platform-plan.md)
- **Dev source of truth** → [DEV_SPEC.md](DEV_SPEC.md)
- **Backend patterns** → [PROJECT_TEMPLATE.md](PROJECT_TEMPLATE.md)
- **Decisions** → [docs/adr/](docs/adr/)

Current phase: **Phase 1 — MVP** (DEV_SPEC §10), code complete.

133 of 145 Phase 0+1 checklist items are done. The twelve that are not need an
account, a server, or a paid API before anyone can do them — a Lightsail box,
Vercel, Google Maps billing, affiliate approval, an AI eval budget, a closed
beta. Each is annotated in DEV_SPEC §9/§10 with what exactly is blocking it.

---

## Quick start

```bash
cp .env.example .env   # then set JWT_SECRET_KEY at minimum
docker compose up --build -d
docker compose exec api go run . seed   # 315 POIs, 20 characters, 6 partners
```

That is the whole setup. It brings up MySQL, Redis, the Go API and the Next.js
web app, runs the database migrations, and starts both apps with hot reload.

Everything works without an external key. What each missing key costs you:

| unset | effect |
|---|---|
| `ANTHROPIC_API_KEY` | the AI planner returns a clear "not configured" instead of a 500 |
| `GOOGLE_MAPS_SERVER_KEY` | POI search still works from the seeded catalogue; pasting a Maps URL does not |
| `LINE_*` / `GOOGLE_OAUTH_*` | that sign-in button is unavailable |
| `FX_API_URL` | money shows in its source currency rather than a wrong converted number |
| `R2_*` | export renders but cannot be uploaded |
| `GOTENBERG_URL` | HTML export works, PDF is offered as unavailable |

`GET /api/v1/admin/flags` reports which of these a running deployment actually
has — it is the first thing to check when a feature "does not work on the
server".

| service | url |
|---|---|
| web | http://localhost:3000 |
| api | http://localhost:5050 |
| api liveness | http://localhost:5050/healthz |
| api readiness | http://localhost:5050/readyz |
| mysql | localhost:3306 |
| redis | localhost:6379 |

> The API is on **5050** on the host, not 5000: macOS AirPlay Receiver squats on
> 5000. Inside the compose network it is still `http://api:5000`. Change
> `API_EXPOSED_PORT` in `.env` if you want a different one.

```bash
docker compose logs -f api web   # follow logs
docker compose down              # stop
docker compose down -v           # stop and wipe the database
```

---

## Layout

```
rove/
├── .env                  ← the ONLY env file; every service reads it
├── docker-compose.yml    ← the ONLY command needed to run everything
├── apps/
│   ├── api/              Go · Echo · GORM · Uber FX · MySQL 8 · Redis
│   └── web/              Next.js App Router · TanStack Query · Tailwind
├── packages/             shared code, once there is any
├── deploy/               Lightsail production compose + Caddy + deploy script
└── docs/adr/             architecture decision records
```

### apps/api

```
main.go            env → config → FX graph → migrate → Echo on :5000
pkg/core/          config, database, redis, migrations
pkg/handlers/api/  routes, middleware, one <domain>.handler.go per domain
pkg/models/        GORM structs + the Store interface for each domain
pkg/store/         GORM implementations, one package per domain
pkg/services/      external systems behind interfaces (ai, places, weather, …)
pkg/domain/        pure business logic, no DB, no HTTP — always unit tested
pkg/testsupport/   the real router against in-memory SQLite, for the auth tests
data/              poi/jp.csv (315 points), characters.json, plan templates
```

Layering rule: handler → store interface → GORM. Business logic goes in
`pkg/domain`. See DEV_SPEC §6.2.

**Authorization is the part to get right.** MySQL has no row-level security, so
`TripRoleMiddleware` checks membership and *every* store method takes a `tripID`
and includes it in the `WHERE` clause. Never query a trip-scoped row by id
alone (DEV_SPEC §4.3).

Routes addressed by a child id — `/plans/:planId`, `/items/:itemId`,
`/expense/:id` — go through `ResolveTrip`, which maps that id to its owning trip
and then runs the same role check. The resolver returns only an id, never
content, so a guessed id discloses nothing.

`pkg/handlers/api/tests` asserts all of this against the real router for every
endpoint group in DEV_SPEC §5, plus the rule that expense never reaches a public
payload. Those tests found two real bugs; keep them green.

### apps/web

```
app/          routes; (marketing) public, (app)/t/[tripId] the trip room
features/     one folder per domain: types.ts + api.ts + queries.ts
lib/          api-client, auth, sse, query-keys, format, flags, env
stores/       zustand — UI state only
styles/       globals.css + brand.css — the only place a colour is defined
components/   ui/ (button, card, dialog, …) + one folder per feature area
types/api.ts  mirrors the Go DTOs exactly, snake_case, no renaming in transit
e2e/          Playwright, incl. iOS and Android projects for touch drag (X5.1)
```

Server data lives in TanStack Query and nowhere else. Zustand holds drag state
and open panels. Query keys always come from `lib/query-keys.ts`.

---

## Common tasks

```bash
make help          # list everything below
make up            # docker compose up --build -d
make logs          # follow  api + web logs
make test          # go test + vitest
make migrate       # run migrations only
make seed          # import POIs, characters and affiliate partners
make lint          # go vet + eslint + tsc
make sh-api        # shell into the api container
```

Seeding is idempotent — re-run it after editing `data/poi/jp.csv` and rows are
matched on name and updated. The CSV is validated on import and again in CI
(`apps/api/seeder_test.go`), so a bad row is caught when it is committed rather
than against production.

---

## Conventions

- Commit messages reference the DEV_SPEC task id: `feat(api): A0.3 initial migration`
- Tick the checklist in DEV_SPEC §9–§12 as tasks land
- Anything decided outside the spec goes in `docs/adr/` **and** DEV_SPEC §16 first
- No feature outside the current phase, however easy it looks
- Colours, type and the product name come from `styles/brand.css` and
  `NEXT_PUBLIC_BRAND_NAME` — never hardcode a hex value (DEV_SPEC §15)
- Money that was converted always carries its as-of date (`fxLabel`), and
  expense never appears in a public payload
- Definition of done for every task: DEV_SPEC §17
