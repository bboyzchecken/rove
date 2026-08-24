# Architecture Decision Records

One file per decision, `NNNN-short-title.md`, never edited once accepted —
supersede it with a new record instead.

Write one whenever you decide something the spec does not already answer, or
when you deviate from it. Then add a one-line entry to DEV_SPEC §16 pointing
here. Order matters: **decide and record before writing the code** (DEV_SPEC §0).

| # | decision |
|---|---|
| [0001](0001-monorepo-single-env.md) | Monorepo with one root `.env` instead of two repos |
| [0002](0002-phase-0-stack-versions.md) | Pinned stack versions for Phase 0 |
| [0003](0003-phase-1-build-decisions.md) | Phase 1 build decisions (mock/live split, duplicated domain rules, no queue) |
| [0004](0004-aws-ecs-instead-of-lightsail.md) | ECS Fargate + ALB from day one, not a single Lightsail box |
