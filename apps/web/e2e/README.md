# e2e

Playwright specs that run against a live stack.

```bash
docker compose up --build -d       # api + web + mysql + redis
pnpm e2e                           # all three projects
pnpm e2e --project=ios             # just the iOS engine
```

`E2E_BASE_URL` points the suite at an already-running app instead of starting
its own dev server.

## Status

| spec | covers | state |
|---|---|---|
| `entry.spec.ts` | X1.1 — three entry flows reach a trip in ≤3 screens | runs |
| `timeline.spec.ts` | X5.1 — touch drag on iOS Safari and Android Chrome | needs a seeded fixture |

The full X.1 journey — create → invite 2 users → wishlist → generate → edit →
budget → expense → share → booking click — needs two things this suite does not
have yet: a way to sign in without a real LINE account, and a recorded AI
response so a generate does not cost money on every run. Both are tracked as
X.1 in DEV_SPEC §10.
