# deploy/terraform/

AWS infra for rove — ECS Fargate (api + web) behind one ALB, RDS MySQL,
ElastiCache Redis, autoscaling on both services. Full walkthrough with the
reasoning behind every choice: [../AWS_DEPLOY.md](../AWS_DEPLOY.md). This file
is just the command reference once you've read that.

## Layout

| file | purpose |
|---|---|
| `backend-bootstrap.sh` | one-time: S3 bucket + DynamoDB table for terraform state |
| `versions.tf` / `providers.tf` | provider pins, backend, default tags |
| `variables.tf` / `terraform.tfvars.example` | every knob, cost-optimized-tier defaults |
| `vpc.tf` | VPC, 2 public + 2 private subnets, route tables |
| `nat.tf` | self-managed NAT instance (not a NAT Gateway — see ADR 0004) |
| `security_groups.tf` | least-privilege SGs, one per tier |
| `ecr.tf` | image repos + lifecycle policy |
| `secrets.tf` | the one Secrets Manager blob holding real config (README step 6) |
| `acm.tf` | TLS cert, DNS-validated against your existing DNS provider |
| `alb.tf` | listeners, target groups, host-based routing |
| `iam.tf` | task execution/task roles + GitHub OIDC deploy role |
| `ecs.tf` | cluster, task defs, services |
| `autoscaling.tf` | target tracking on request count + CPU, both services |
| `cloudwatch.tf` | log groups, alarms, SNS topic |
| `budget.tf` | AWS Budgets tripwire |
| `outputs.tf` | everything the next step needs (DNS records, ARNs, endpoints) |

## Commands

```bash
# one-time
./backend-bootstrap.sh ap-southeast-1
cp backend.hcl.example backend.hcl        # fill in the bucket name it printed
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl

# stage A — ECR only, so there is something to push images to
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.web

# (build + push v0 images here — AWS_DEPLOY.md step 2)

# stage B — the ACM cert, so you can add its DNS validation records
terraform apply -target=aws_acm_certificate.main

# (add the CNAMEs from `terraform output acm_validation_records` — step 3)

# stage C — everything else
terraform plan -out=tfplan
terraform apply tfplan
```

Routine changes after that are just `terraform plan` / `terraform apply`. See
AWS_DEPLOY.md step 8 for the one thing that is NOT automatic: an env var
change needs a manual `--force-new-deployment` to actually roll out, because
`aws_ecs_service` intentionally ignores `task_definition` drift from CI
deploys.
