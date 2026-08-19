# deploy/

Phase 1 topology: **one AWS Lightsail instance** (2 vCPU / 2 GB, ~$12/mo)
running everything under Docker Compose behind Caddy. Target: ≤ $25/month
excluding the AI and Google Maps APIs (DEV_SPEC §8).

```
Cloudflare DNS → Lightsail :443 → Caddy → ┬→ web  (Next.js :3000)
                                          └→ api  (Go :5000) → mysql + redis
```

| file | purpose |
|---|---|
| `docker-compose.prod.yml` | the production stack; pulls images, never builds |
| `Caddyfile` | TLS + routing; SSE buffering is disabled for the API |
| `deploy.sh` | backup → pull → restart → wait for `/readyz` |
| `backup.sh` | nightly `mysqldump` → R2 |

## First-time setup (A0.10 — not done yet)

1. Create the Lightsail instance and open 80/443
2. Install Docker + Compose plugin
3. Point the domain at it through Cloudflare, set `API_DOMAIN` / `WEB_DOMAIN`
4. Copy `.env` to the box (never commit it)
5. `./deploy.sh`
6. Turn on Lightsail auto-snapshots and add `backup.sh` to cron

## Scaling path (recorded, not to be built now — DEV_SPEC §8.4)

Lightsail 4 GB → managed database → ECS Fargate + RDS + ElastiCache.
