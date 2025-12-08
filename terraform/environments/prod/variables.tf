# Variables for Flora Marketplace Infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
}

# Database Variables
variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "database_username" {
  description = "PostgreSQL master username"
  type        = string
}

# Auth0 Variables
variable "auth0_domain" {
  description = "Auth0 domain"
  type        = string
}

variable "auth0_client_id" {
  description = "Auth0 client ID"
  type        = string
}

variable "auth0_audience" {
  description = "Auth0 API audience"
  type        = string
}

# Stripe Variables
variable "stripe_publishable_key" {
  description = "Stripe publishable key (for frontend)"
  type        = string
}

# Email/SMTP Variables
variable "smtp_host" {
  description = "SMTP server host (e.g., smtp.gmail.com)"
  type        = string
}

variable "smtp_port" {
  description = "SMTP server port"
  type        = string
}

variable "smtp_secure" {
  description = "SMTP secure connection (true/false)"
  type        = string
}
