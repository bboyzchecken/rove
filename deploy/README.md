# deploy/

Production runs on **AWS ECS Fargate behind an ALB, with autoscaling** —
provisioned by Terraform, deployed by GitHub Actions.

```
Cloudflare DNS → ALB :443 ─┬→ web target group → ECS web (1–10 tasks)
                           └→ api target group → ECS api (1–10 tasks)
                                                      ├→ RDS MySQL 8
                                                      ├→ ElastiCache Redis
                                                      └→ NAT instance → Anthropic / Google / LINE
```

| | |
|---|---|
| **Step-by-step deploy guide** | [AWS_DEPLOY.md](AWS_DEPLOY.md) |
| **Why this and not Lightsail** | [ADR 0004](../docs/adr/0004-aws-ecs-instead-of-lightsail.md) |
| **Terraform reference** | [terraform/README.md](terraform/README.md) |

Start with AWS_DEPLOY.md — it is written to be followed top to bottom on a
fresh AWS account.

## Superseded — kept only as reference

`docker-compose.prod.yml`, `Caddyfile`, `deploy.sh` and `backup.sh` describe
the single-Lightsail-box topology from DEV_SPEC §8 that ADR 0004 replaced.
Nothing runs them any more:

- TLS moved from Caddy to ACM
- routing moved from the Caddyfile to ALB listener rules
- `deploy.sh`'s ssh-and-compose-pull became `release.yml` → ECR → `UpdateService`
- `backup.sh`'s nightly mysqldump became RDS automated backups

They are safe to delete once the AWS stack is live and proven. **The root
`docker-compose.yml` is a different thing entirely** — that is local
development and is unaffected.
