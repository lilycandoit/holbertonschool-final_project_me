variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for EB instances"
  type        = list(string)
}

variable "env_vars" {
  description = "Environment variables for the application"
  type        = map(string)
  default     = {}
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name for EB EC2 instances"
  type        = string
}

variable "iam_service_role_arn" {
  description = "IAM service role ARN for Elastic Beanstalk"
  type        = string
}
