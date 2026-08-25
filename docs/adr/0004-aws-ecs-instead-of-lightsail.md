# ADR 0004 — ECS Fargate + ALB from day one, not a single Lightsail box

Status: accepted · 2026-08-23
Supersedes the deployment row of DEV_SPEC §2.3 and all of §8.

## Context

DEV_SPEC §8 planned one Lightsail instance (2 vCPU / 2 GB, ~$12/mo) running
`deploy/docker-compose.prod.yml` behind Caddy, with §8.4 recording the escape
hatch: *"2GB → 4GB → managed DB → ECS Fargate + RDS + ElastiCache เมื่อ
trips/วัน > ~2k"*. That was written on the assumption that nobody would show
up. The domain `rovetravel.site` is now bought and the launch channel is an
influencer audience — the traffic curve for that is a step, not a ramp.

Migrating Lightsail → ECS is not a resize. It is a different network, a
different secret store, a different CI target and a database move, and the
moment you would have to do it is the exact moment the site is on fire and a
launch post is live.

## Decision

Skip the Lightsail phase. Provision ECS Fargate + ALB + RDS + ElastiCache
directly, via Terraform in `deploy/terraform/`, but configure every knob at
its cheapest setting rather than its most resilient one.

**Load balancing** — one ALB, host-based routing: `rovetravel.site` → web
target group, `api.rovetravel.site` → api target group. It replaces Caddy
(TLS moves to ACM, which auto-renews and needs no volume) and is the thing
autoscaling measures against.

**Autoscaling** — target tracking on *both* `ALBRequestCountPerTarget` and
CPU, per service, 1→10 tasks. Request count is the primary signal: CPU lags a
sudden spike by a cooldown or two, which is the case this stack exists for.
60s scale-out cooldown, 300s scale-in — cheap to be wrong upward, expensive
to be wrong downward mid-spike.

**Cost-optimized settings, chosen deliberately:**

| knob | chosen | the resilient alternative | why the cheap one, for now |
|---|---|---|---|
| Fargate capacity | 1 on-demand base + Spot beyond (weight 1:4) | all on-demand | Spot is ~70% cheaper and can be reclaimed with a 2-minute warning. The baseline task is never reclaimed; a stateless handler behind an ALB drains and gets replaced. |
| Outbound internet | `t4g.nano` NAT **instance** | NAT Gateway | ~$3/mo vs ~$32/mo. Single point of failure for *outbound only* — the site and the ALB keep serving; what breaks is the api calling Anthropic/Google/LINE. |
| RDS | `db.t4g.micro`, single AZ | Multi-AZ | Multi-AZ roughly doubles the DB line for automatic failover. Single AZ still has 7-day automated backups and a final snapshot. |
| ElastiCache | one `cache.t4g.micro` node | replication group | Redis holds cache, SSE pubsub, rate limits and AI job state — a node loss is a cold cache rebuilt from MySQL, not data loss. |
| Container Insights | off | on | Per-metric cost with no per-task dashboard need yet; the CloudWatch alarms cover the questions actually being asked. |

Roughly $50–70/month with no traffic, most of it the ALB and RDS minimums.
That is 2–3× the Lightsail plan and buys the ability to absorb a spike
without a migration.

**Every one of those trade-offs is a variable, not a rewrite.** `db_multi_az
= true`, dropping the `FARGATE_SPOT` block, or swapping `nat.tf` for a NAT
Gateway are each a single `terraform apply` on the day the traffic justifies
the cost. That is the actual point of choosing Terraform over console
clicking.

## Consequences

**`deploy/docker-compose.prod.yml`, `Caddyfile` and `deploy.sh` are dead.**
They describe a topology that no longer exists. `docker-compose.yml` at the
repo root — local development — is untouched and stays the way the project is
run day to day.

**CI owns deploys, Terraform owns everything else.** `release.yml` pushes to
ECR and calls `UpdateService` through a GitHub OIDC role (no long-lived AWS
keys). `aws_ecs_service` sets `ignore_changes = [task_definition,
desired_count]` so Terraform stops fighting CI and the autoscaler. The cost:
editing an env var in `ecs.tf` registers a new revision but does not roll it
out — that needs `--force-new-deployment`, and AWS_DEPLOY.md step 8 says so
in both directions.

**Migrations now run concurrently.** `main.go` runs gormigrate on every boot,
which was safe when "every boot" meant one container. Under autoscaling, N
tasks can boot at once and race on the same migration table. It has not been
hit — Phase 1 migrations are additive `AutoMigrate` calls — but it is a real
edge and the mitigation is recorded in AWS_DEPLOY.md step 9 rather than
pretended away.

**The autoscaling ceiling and the DB connection pool disagree.**
`database.go` opens up to 25 MySQL connections per api task
(`SetMaxOpenConns(25)`); `api_max_count = 10` means the fleet can ask for 250.
`db.t4g.micro`'s default `max_connections` (~85, formula-derived from its 1
GiB) runs out around the 4th task — the 5th–10th tasks ECS is proud of having
started would be failing every query. `rds.tf` raises the parameter to 150,
which buys roughly 6 tasks instead of 3–4 and is a plain `terraform apply`,
not a fix: the actual fix is sizing the per-task pool to `150 /
api_max_count` (or lower) in `database.go`, which this ADR deliberately does
not touch — it is application code, not infrastructure. Recorded here so it
does not read as solved.

**Two more things left as-is on purpose.** Object storage stays on Cloudflare
R2 (egress is free, S3 is not) — the ECS task role is deliberately empty.
And SSR fetches from the web task go back out through the public ALB rather
than over private networking; it is one extra hop that nothing currently
notices, and ECS Service Connect is there if it ever does.
