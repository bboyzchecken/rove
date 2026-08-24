# ------------------------------------------------------------------ project
variable "project" {
  description = "Short name used as a prefix for every resource (rove)."
  type        = string
  default     = "rove"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "aws_region" {
  description = "ap-southeast-1 (Singapore) — lowest latency to Thailand of the regions AWS offers."
  type        = string
  default     = "ap-southeast-1"
}

# ------------------------------------------------------------------ domain
variable "domain_name" {
  description = "Apex domain, already purchased outside AWS. DNS stays wherever it is today (e.g. Cloudflare) — see README step 3."
  type        = string
  default     = "rovetravel.site"
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

# ------------------------------------------------------------------ network
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "2 AZs — ALB + the NAT instance live here."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "2 AZs — ECS tasks, RDS and ElastiCache live here, no direct internet route."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "nat_instance_type" {
  description = "Self-managed NAT instance instead of a NAT Gateway — ~$3/mo vs ~$32/mo. Single instance = single point of failure for OUTBOUND internet only; inbound traffic through the ALB is unaffected. See ADR 0004."
  type        = string
  default     = "t4g.nano"
}

# ------------------------------------------------------------------ ecs — api
variable "api_container_port" {
  type    = number
  default = 5000
}

variable "api_cpu" {
  description = "Fargate task vCPU units (256 = 0.25 vCPU, the smallest size)."
  type        = number
  default     = 256
}

variable "api_memory" {
  type    = number
  default = 512
}

variable "api_min_count" {
  type    = number
  default = 1
}

variable "api_max_count" {
  description = "Ceiling for the traffic-spike scenario this whole stack exists for. Raise it (and check RDS/ElastiCache headroom) if a real launch is coming."
  type        = number
  default     = 10
}

# ------------------------------------------------------------------ ecs — web
variable "web_container_port" {
  type    = number
  default = 3000
}

variable "web_cpu" {
  type    = number
  default = 256
}

variable "web_memory" {
  type    = number
  default = 512
}

variable "web_min_count" {
  type    = number
  default = 1
}

variable "web_max_count" {
  type    = number
  default = 10
}

# ------------------------------------------------------------------ rds
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "GB, starting size."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "GB — RDS storage autoscaling ceiling so a traffic spike can't fill the disk unnoticed."
  type        = number
  default     = 100
}

variable "db_name" {
  type    = string
  default = "rovedb"
}

variable "db_username" {
  type    = string
  default = "rove"
}

variable "db_multi_az" {
  description = "false = cost-optimized tier (single AZ, no automatic failover). Flip to true later with a single `terraform apply` — see ADR 0004 upgrade path."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

# ------------------------------------------------------------------ elasticache
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

# ------------------------------------------------------------------ images
variable "api_image_tag" {
  description = "Only used for the very first `terraform apply` that creates the ECS service. Every deploy after that is owned by CI (see .github/workflows/release.yml) and Terraform is told to ignore it — see the lifecycle block on aws_ecs_service.api."
  type        = string
  default     = "latest"
}

variable "web_image_tag" {
  type    = string
  default = "latest"
}

# ------------------------------------------------------------------ github oidc (CI deploy role)
variable "create_github_oidc_provider" {
  description = "false if the AWS account already has a token.actions.githubusercontent.com OIDC provider (only one is allowed per account) — set the existing ARN in github_oidc_provider_arn instead."
  type        = bool
  default     = true
}

variable "github_oidc_provider_arn" {
  description = "Only read when create_github_oidc_provider = false."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "owner/repo, used to scope the GitHub Actions deploy role's trust policy."
  type        = string
  default     = "bboyzchecken/rove"
}

# ------------------------------------------------------------------ alerts / budget
variable "notification_email" {
  description = "Leave blank to skip alarm/budget e-mail subscriptions and add them later."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "AWS Budgets alert threshold — a tripwire, not a hard cap (AWS Budgets cannot stop spend by itself)."
  type        = number
  default     = 70
}
