resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-redis"
  subnet_ids = aws_subnet.private[*].id
}

# Single node, no replication group — cost-optimized tier (ADR 0004). A node
# failure means a cold cache (AI job state, SSE pubsub, rate limits, POI/fx
# cache) rebuilds from MySQL/the providers, not data loss of anything durable.
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  snapshot_retention_limit = 1
  maintenance_window       = "sun:19:30-sun:20:30" # 02:30-03:30 ICT Monday

  tags = { Name = "${var.project}-redis" }
}
