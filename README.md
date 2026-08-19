# rove

Collaborative trip planning for groups — Japan first.
A group creates a trip room, everyone adds what they want to see, AI drafts a
day-by-day plan with a budget and reasons, the group edits it together, and the
result can be shared or exported. Every item has a bookable affiliate link.

- **Product rationale** → [trip-planning-platform-plan.md](trip-planning-platform-plan.md)
- **Dev source of truth** → [DEV_SPEC.md](DEV_SPEC.md)
- **Backend patterns** → [PROJECT_TEMPLATE.md](PROJECT_TEMPLATE.md)
- **Decisions** → [docs/adr/](docs/adr/)

Current phase: **Phase 0 — Setup & Validate** (DEV_SPEC §9).
The structure is in place; features are not built yet.

---

## Quick start

```bash
cp .env.example .env   # then set JWT_SECRET_KEY at minimum
docker compose up --build -d
```

That is the whole setup. It brings up MySQL, Redis, the Go API and the Next.js
web app, runs the database migrations, and starts both apps with hot reload.

| service | url |
|---|---|
| web | http://localhost:3000 |
|  api | http://localhost:5000 |
|  api liveness | http://localhost:5000/healthz |
|  api readiness | http://localhost:5000/readyz |
| mysql | localhost:3306 |
| redis | localhost:6379 |

> The API is on **5050** on the host, not 5000: macOS AirPlay Receiver squats on
> 5000. Inside the compose network it is still `http://api:5000`. Change
> `API_EXPOSED_PORT` in `.env` if you want a different one.

```bash
docker compose logs -f  api web   # follow logs
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
```

Layering rule: handler → store interface → GORM. Business logic goes in
`pkg/domain`. See DEV_SPEC §6.2.

**Authorization is the part to get right.** MySQL has no row-level security, so
`TripRoleMiddleware` checks membership and *every* store method takes a `tripID`
and includes it in the `WHERE` clause. Never query a trip-scoped row by id
alone (DEV_SPEC §4.3).

### apps/web

```
app/          routes; (marketing) public, (app)/t/[tripId] the trip room
features/     one folder per domain: types.ts + api.ts + queries.ts
lib/          api-client, auth, sse, query-keys, format, flags, env
stores/       zustand — UI state only
styles/       globals.css + brand.css (brand is a placeholder, §15)
components/   ui (shadcn) + one folder per feature area
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
make seed          # import data/poi/jp.csv
make sh- api        # shell into the api container
```

---

## Conventions

- Commit messages reference the DEV_SPEC task id: `feat(api): A0.3 initial migration`
- Tick the checklist in DEV_SPEC §9–§12 as tasks land
- Anything decided outside the spec goes in `docs/adr/` **and** DEV_SPEC §16 first
- No feature outside the current phase, however easy it looks
- Brand name, colours and logo are placeholders — read them from tokens, never
  hardcode them (DEV_SPEC §15)
- Definition of done for every task: DEV_SPEC §17
