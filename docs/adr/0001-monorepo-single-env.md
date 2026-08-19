# 0001 — Monorepo with a single root `.env`

- **Date:** 2026-08-19
- **Status:** accepted
- **Supersedes:** DEV_SPEC §0 ("Repo แยก 2 ตัว") and §14 (separate API `.env` / web `.env.local`)

## Context

DEV_SPEC assumes two repositories, `xxx-api` and `xxx-web`, each with its own
environment file, so two developers can work without stepping on each other.

That assumption does not hold yet. This is a **prototype built by one fullstack
developer to test the market** before a team exists. Two repos in that situation
cost real time: two clones, two CI pipelines, two env files that drift, and any
change spanning an API contract becomes two PRs that have to be merged in order.

## Decision

One repository:

```
rove/
├── .env                 the only environment file — every service reads it
├── docker-compose.yml   the only command needed to run everything
├── apps/api             Go
├── apps/web             Next.js
├── packages/            shared code, when there is any
└── deploy/              production compose + Caddy + scripts
```

`docker compose up --build -d` starts MySQL, Redis, the API and the web app,
runs migrations, and enables hot reload on both sides.

Consequences of the single `.env`:

- Docker Compose reads the root `.env` natively; no per-app file, no drift.
- Secrets that only the API should see (`ANTHROPIC_API_KEY`, `JWT_SECRET_KEY`,
  R2 keys) still sit in the same file. **They are not exposed to the browser** —
  Next.js only inlines `NEXT_PUBLIC_*` — but the file is now a single blast
  radius. It is gitignored, and production keeps its copy on the server only.
- Two API URLs are needed, not one: the browser reaches the API on the host
  port, while server-side rendering reaches it at `http://api:5000` on the
  compose network. Hence `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL`.

## Alternatives considered

- **Two repos as specified.** Correct for a team, premature for one developer.
- **Monorepo, separate env files per app.** Keeps the API secrets out of the web
  container, but reintroduces exactly the drift this decision removes, and the
  user asked for one file.
- **Turborepo / pnpm workspaces across both apps.** No benefit while the only
  Node package is `apps/web`; Go has its own module. Add it when `packages/`
  gets its first real member.

## Revisit when

A second developer joins full time, or the web and API deploy on different
cadences. Splitting later is mechanical — `git filter-repo` on `apps/*` — and
the layering here was chosen so nothing crosses the boundary except HTTP.
