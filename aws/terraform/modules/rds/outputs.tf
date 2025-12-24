output "db_endpoint" {
  description = "Database endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.postgres.db_name
}

output "db_port" {
  description = "Database port"
  value       = aws_db_instance.postgres.port
}

output "connection_string" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${var.database_username}:${var.database_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
  sensitive   = true
}

output "security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}
