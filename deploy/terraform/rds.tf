resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project}-db-subnet-group" }
}

# Matches the utf8mb4 / UTC settings the local docker-compose mysql already
# runs with (docker-compose.yml) so behaviour doesn't shift between envs.
resource "aws_db_parameter_group" "mysql8" {
  name   = "${var.project}-mysql8"
  family = "mysql8.0"

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_0900_ai_ci"
  }

  # db.t4g.micro's default (DBInstanceClassMemory/12582880 ≈ 85) is lower than
  # the fleet needs, so it is raised here. The other half of the deal lives in
  # database.go: SetMaxOpenConns(12) × api_max_count (10) = 120, which fits
  # under this with room left for the migration on boot and an
  # `aws ecs execute-command` shell.
  #
  # Keep api_max_count × SetMaxOpenConns < max_connections. Raising either
  # number on its own is how the 7th task starts answering "too many
  # connections" while ECS reports a healthy scale-out (ADR 0004).
  parameter {
    name  = "max_connections"
    value = "150"
  }

  parameter {
    name  = "time_zone"
    value = "UTC"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-mysql"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  # RDS creates and rotates the master password in Secrets Manager itself —
  # the api task reads it via master_user_secret[0].secret_arn (ecs.tf), so
  # it never needs to be typed anywhere, including deploy/terraform/secrets.tf.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.mysql8.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = var.db_multi_az
  publicly_accessible    = false

  backup_retention_period = 7
  backup_window           = "18:00-19:00"         # 01:00-02:00 ICT
  maintenance_window      = "sun:19:00-sun:20:00" # 02:00-03:00 ICT Monday

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-mysql-final-snapshot"

  tags = { Name = "${var.project}-mysql" }
}
