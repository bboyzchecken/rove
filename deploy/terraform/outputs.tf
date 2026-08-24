output "alb_dns_name" {
  description = "Point rovetravel.site, www and api at this — see README step 4."
  value       = aws_lb.main.dns_name
}

output "acm_validation_records" {
  description = "Add each of these as a CNAME at your DNS provider before the first full `terraform apply` — see README step 3."
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options :
    dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "ecr_repository_urls" {
  value = {
    api = aws_ecr_repository.api.repository_url
    web = aws_ecr_repository.web.repository_url
  }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "rds_master_secret_arn" {
  description = "MYSQL_PASSWORD lives here (RDS-managed) — read it with: aws secretsmanager get-secret-value --secret-id <this arn>"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "app_secrets_arn" {
  description = "Everything else (JWT_SECRET_KEY, ANTHROPIC_API_KEY, R2 keys, ...) — see README step 6."
  value       = aws_secretsmanager_secret.app.arn
}

output "github_actions_deploy_role_arn" {
  description = "Paste into the AWS_DEPLOY_ROLE_ARN GitHub Actions secret — see README step 7."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "nat_public_ip" {
  description = "Every outbound call from the api leaves from this IP — allowlist it with any partner that asks for one."
  value       = aws_eip.nat.public_ip
}

# `aws ecs run-task` needs the network config spelled out — these two save
# looking it up each time. See AWS_DEPLOY.md step 9 (seeding the POI data).
output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "api_security_group_id" {
  value = aws_security_group.ecs_api.id
}
