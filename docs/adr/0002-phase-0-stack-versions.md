# 0002 — Pinned stack versions for Phase 0

- **Date:** 2026-08-19
- **Status:** accepted
- **Relates to:** DEV_SPEC §2 (which deliberately does not pin version numbers)

## Context

DEV_SPEC picks the stack but leaves versions open, with a note to record the
real ones at init time. These are the versions the scaffold was built and
verified against.

## Decision

### apps/api

| | version | note |
|---|---|---|
| Go | **1.25** | `go mod tidy` raised the directive from 1.23 to 1.25.0 because of a transitive requirement; the Docker base image is `golang:1.25-alpine` |
| Echo | v4.15.4 | |
| GORM | v1.31.2 + driver/mysql v1.6.0 | |
| Uber FX | v1.24.0 | |
| gormigrate | v2.1.6 | |
| go-redis | v9.22.0 | |
| golang-jwt | v5.3.1 | |
| air (dev hot reload) | **v1.67.0, pinned** | `air@latest` requires Go 1.26 |

### apps/web

| | version | note |
|---|---|---|
| Next.js | **16.3.1** | App Router, Turbopack dev, `output: 'standalone'` |
| React | 19.2.8 | |
| TypeScript | **5.9.3** | TS 7.0.2 is out but the toolchain around it (eslint-config-next, type packages) is not settled; not worth the risk on a prototype foundation |
| Tailwind CSS | 4.3.3 | v4 config-in-CSS: `@theme` in `styles/globals.css`, no `tailwind.config.js` |
| TanStack Query | 5.101.4 | |
| Zustand | 5.0.15 | |
| ESLint | **9.39.5, held back** | `eslint-config-next@16` depends on `eslint-plugin-react@7.x`, which crashes on ESLint 10 (`context.getFilename` was removed) |
| Node (runtime) | 22-alpine | |
| pnpm | via corepack | |

## Consequences

- Two version holds exist for real, documented reasons: **air** and **ESLint**.
  Recheck both when Go 1.26 lands in the base image and when
  `eslint-plugin-react` ships ESLint 10 support.
- TypeScript 7 is a deliberate deferral, not an oversight. Revisit once
  `eslint-config-next` declares support.
- Tailwind v4 means there is no `tailwind.config.js`; anyone looking for the
  theme should open `styles/globals.css` and `styles/brand.css`.

## Verified

`docker compose up --build -d` on macOS (Apple Silicon, Docker 27.3.1): all four
containers healthy, migrations applied, `/readyz` reports mysql and redis ok,
`go test ./...` and `tsc --noEmit` both pass.
