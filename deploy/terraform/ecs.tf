resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
  # Container Insights costs extra per metric — skip it in the cost-optimized
  # tier and lean on the CloudWatch alarms in cloudwatch.tf instead. Flip to
  # "enabled" later if per-task dashboards become worth the cost.
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # One on-demand task always up (stable baseline, never reclaimed), scale-out
  # capacity beyond that mostly on Spot (~70% cheaper, can be interrupted with
  # a 2-minute warning — fine for a stateless request handler behind an ALB).
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 1
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = 4
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project}-web"
  retention_in_days = 14
}

locals {
  api_secret_arn = aws_secretsmanager_secret.app.arn

  # RDS generates and rotates the master password itself into its own secret
  # ({"username":…,"password":…}), so it is never typed anywhere — not in
  # secrets.tf, not in a tfvars file, not in CI.
  db_password_secret = {
    name      = "MYSQL_PASSWORD"
    valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::"
  }

  api_secrets = concat([local.db_password_secret], [
    for key in [
      "JWT_SECRET_KEY", "ADMIN_EMAILS", "ANTHROPIC_API_KEY", "GOOGLE_MAPS_SERVER_KEY",
      "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
      "LINE_LOGIN_CHANNEL_ID", "LINE_LOGIN_CHANNEL_SECRET", "LINE_MESSAGING_TOKEN",
      "FX_API_URL", "FX_API_KEY",
      "R2_ENDPOINT", "R2_REGION", "R2_ACCESS_KEY", "R2_SECRET_KEY",
      "R2_EXPORT_BUCKET", "R2_IMAGE_BUCKET", "R2_DOCUMENT_BUCKET", "R2_PHOTO_BUCKET",
      "AFFILIATE_AGODA_ID", "AFFILIATE_BOOKING_AID", "AFFILIATE_KLOOK_AID",
      "AFFILIATE_KKDAY_ID", "AFFILIATE_RENTALCARS_ID", "AFFILIATE_AIRALO_ID",
    ] : { name = key, valueFrom = "${local.api_secret_arn}:${key}::" }
  ])
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
      essential = true
      portMappings = [{
        containerPort = var.api_container_port
        protocol      = "tcp"
      }]
      environment = [
        { name = "ENV", value = "production" },
        { name = "PORT", value = tostring(var.api_container_port) },
        { name = "MOCK_MODE", value = "false" },
        # Drafts go to the queue for the worker service (Phase 3 — worker.tf).
        # Set to "all" and scale worker_count to 0 to fold them back in here.
        { name = "ROVE_ROLE", value = var.worker_count > 0 ? "api" : "all" },
        { name = "APP_BASE_URL", value = "https://${var.api_subdomain}.${var.domain_name}" },
        { name = "WEB_BASE_URL", value = "https://${var.domain_name}" },
        { name = "AUTH_COOKIE_NAME", value = "rove_token" },
        { name = "AUTH_COOKIE_DOMAIN", value = ".${var.domain_name}" },
        { name = "MYSQL_HOST", value = aws_db_instance.main.address },
        { name = "MYSQL_PORT", value = "3306" },
        { name = "MYSQL_USERNAME", value = var.db_username },
        { name = "MYSQL_DATABASE", value = var.db_name },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.main.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_PASSWORD", value = "" },
        { name = "AI_MODEL_PLANNER", value = "claude-opus-5" },
        { name = "AI_MODEL_FAST", value = "claude-haiku-4-5-20251001" },
        { name = "AI_MAX_TOKENS", value = "8000" },
        { name = "AI_DAILY_COST_CAP_USD", value = "5" },
        { name = "OPEN_METEO_BASE", value = "https://api.open-meteo.com" },
      ]
      secrets = local.api_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:${var.api_container_port}/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  # No lifecycle.ignore_changes here on purpose: editing an env var below and
  # running `terraform apply` DOES register a new revision. It just does not
  # reach the running service by itself — see the note on aws_ecs_service.api.
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.web.repository_url}:${var.web_image_tag}"
      essential = true
      portMappings = [{
        containerPort = var.web_container_port
        protocol      = "tcp"
      }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.web_container_port) },
        { name = "NEXT_PUBLIC_API_URL", value = "https://${var.api_subdomain}.${var.domain_name}" },
        { name = "NEXT_PUBLIC_APP_URL", value = "https://${var.domain_name}" },
        # SSR fetches go back out through the ALB, same as the browser — no
        # private service-to-service networking in this cost-optimized tier.
        # Fine at this scale; revisit with ECS Service Connect if that extra
        # hop's latency ever matters.
        { name = "API_INTERNAL_URL", value = "https://${var.api_subdomain}.${var.domain_name}" },
        { name = "NEXT_PUBLIC_BRAND_NAME", value = "ROVE" },
        { name = "NEXT_PUBLIC_POSTHOG_HOST", value = "https://us.i.posthog.com" },
        { name = "AUTH_COOKIE_NAME", value = "rove_token" },
        { name = "AUTH_COOKIE_DOMAIN", value = ".${var.domain_name}" },
        { name = "NEXT_PUBLIC_DEV_LOGIN", value = "" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_min_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = 4
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  health_check_grace_period_seconds = 60

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # A deploy whose tasks never pass the health check rolls itself back to the
  # previous revision instead of retrying forever. Paired with
  # `wait-for-service-stability` in release.yml, a bad image fails the CI run
  # loudly and leaves production on the last good one.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # RDS and ElastiCache sit in private subnets with no bastion, so this is the
  # only way in: `aws ecs execute-command` opens a shell in a running task.
  # Needed for `/app/api seed`, for a mysql client, and for reading a stuck
  # migration. See AWS_DEPLOY.md step 9.
  enable_execute_command = true

  depends_on = [aws_lb_listener.https, aws_iam_role_policy.ecs_task_execution_secrets]

  lifecycle {
    # CI (release.yml) registers a new task-definition revision on every
    # release tag and points the service at it directly — ignoring
    # task_definition here stops the next `terraform apply` from reverting
    # that back to whatever revision Terraform last created. The flip side:
    # editing an env var in aws_ecs_task_definition.api and running
    # `terraform apply` registers a new revision but does NOT roll it out by
    # itself. Finish with:
    #   aws ecs update-service --cluster <cluster> --service rove-api --task-definition rove-api --force-new-deployment
    # (README step 8 covers both paths.) desired_count is likewise owned by
    # the autoscaling policies in autoscaling.tf after the first apply.
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_ecs_service" "web" {
  name            = "${var.project}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_min_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = 4
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_web.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = var.web_container_port
  }

  health_check_grace_period_seconds = 60

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # A deploy whose tasks never pass the health check rolls itself back to the
  # previous revision instead of retrying forever. Paired with
  # `wait-for-service-stability` in release.yml, a bad image fails the CI run
  # loudly and leaves production on the last good one.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]

  lifecycle {
    # Same reasoning as aws_ecs_service.api above — swap the service name in
    # the force-new-deployment command.
    ignore_changes = [task_definition, desired_count]
  }
}
