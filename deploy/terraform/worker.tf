# The AI worker (DEV_SPEC Phase 3 — INFRA: แยก AI worker เป็น service แยก).
#
# Same image as the API, same environment, one variable different: ROVE_ROLE.
# The API hands drafts to a Redis list and this service drains it
# (apps/api/pkg/services/ai/queue.go).
#
# Why it is its own service and not more API tasks: a draft takes up to three
# minutes and a deploy takes seconds, so every release either waits for the
# drafts or kills them. Split, the web tier restarts on its own schedule and
# the worker drains at its own pace — and the two scale on different signals,
# because a queue is not a request rate.

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project}-worker"
  retention_in_days = 14
}

# No ingress at all: nothing connects to a worker. It reaches out to MySQL,
# Redis and the model, and nothing reaches in.
resource "aws_security_group" "ecs_worker" {
  name_prefix = "${var.project}-ecs-worker-"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-ecs-worker-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
      essential = true
      # No portMappings: this process never listens.
      environment = [
        { name = "ENV", value = "production" },
        { name = "ROVE_ROLE", value = "worker" },
        { name = "STUB_PROVIDERS", value = "false" },
        { name = "DEV_LOGIN", value = "false" },
        { name = "APP_BASE_URL", value = "https://${var.api_subdomain}.${var.domain_name}" },
        { name = "WEB_BASE_URL", value = "https://${var.domain_name}" },
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
        # M26 (A26.6): drafting is unmetered under a Trip Pass, so the old $5 —
        # about 80 free trips of model time — would have been spent inside the
        # first hour of a busy day and taken the feature down with it.
        #
        # $20 is roughly 330 free trips or 65 heavy paid ones per day. At that
        # volume the revenue on one day dwarfs the cap several times over, so
        # the number is not rationing anything: it is the stop that keeps a
        # runaway loop or an abusive account from becoming an open tab.
        #
        # Deliberately above the monthly budget alarm when sustained (see
        # variables.tf). Hitting this ceiling every day for a month *should*
        # send an e-mail — that is a business event, not a quiet cost.
        { name = "AI_DAILY_COST_CAP_USD", value = "20" },
        { name = "OPEN_METEO_BASE", value = "https://api.open-meteo.com" },
      ]
      # The same secret set as the API: the worker runs the whole pipeline, so
      # it needs the model key, Maps, weather and the storage credentials.
      secrets = local.api_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_count

  # All Spot. A reclaimed worker loses at most the draft in flight, which stays
  # `queued` in `ai_jobs` and is picked up again — the one workload here that
  # can genuinely afford a two-minute eviction notice.
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = 1
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_worker.id]
    assign_public_ip = false
  }

  # A draft has three minutes to finish; ECS is told to wait for it rather than
  # SIGKILL a job somebody paid a credit for.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  enable_execute_command = true

  lifecycle {
    ignore_changes = [desired_count]
  }
}
