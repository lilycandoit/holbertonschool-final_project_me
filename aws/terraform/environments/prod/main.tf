# Flora Marketplace - AWS Infrastructure with Terraform
# Main configuration file for the 'prod' environment

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "flora-terraform-state-570006208612"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "flora-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Flora Marketplace"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Team        = "Holberton Final Project"
    }
  }
}

data "aws_ssm_parameter" "db_password" {
  name            = "/${var.project_name}/${var.environment}/database_password"
  with_decryption = true
}

data "aws_ssm_parameter" "auth0_client_secret" {
  name            = "/${var.project_name}/${var.environment}/auth0_client_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "stripe_secret_key" {
  name            = "/${var.project_name}/${var.environment}/stripe_secret_key"
  with_decryption = true
}

data "aws_ssm_parameter" "stripe_webhook_secret" {
  name            = "/${var.project_name}/${var.environment}/stripe_webhook_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "gemini_api_key" {
  name            = "/${var.project_name}/${var.environment}/gemini_api_key"
  with_decryption = true
}

data "aws_ssm_parameter" "smtp_user" {
  name            = "/${var.project_name}/${var.environment}/smtp_user"
  with_decryption = true
}

data "aws_ssm_parameter" "smtp_pass" {
  name            = "/${var.project_name}/${var.environment}/smtp_pass"
  with_decryption = true
}

module "networking" {
  source       = "../../modules/networking"
  project_name = var.project_name
}

# IAM Module
module "iam" {
  source = "../../modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

# RDS Module
module "rds" {
  source = "../../modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  database_name         = var.database_name
  database_username     = var.database_username
  database_password     = data.aws_ssm_parameter.db_password.value
  allowed_security_group_id = module.elastic_beanstalk.security_group_id
}

# Elastic Beanstalk Module (Backend)
module "elastic_beanstalk" {
  source = "../../modules/elastic_beanstalk"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids

  # IAM roles from IAM module
  iam_instance_profile_name = module.iam.eb_ec2_instance_profile_name
  iam_service_role_arn      = module.iam.eb_service_role_arn

  # Environment variables for backend
  env_vars = {
    DATABASE_URL          = module.rds.connection_string
    AUTH0_DOMAIN          = var.auth0_domain
    AUTH0_CLIENT_ID       = var.auth0_client_id
    AUTH0_CLIENT_SECRET   = data.aws_ssm_parameter.auth0_client_secret.value
    AUTH0_AUDIENCE        = var.auth0_audience
    STRIPE_SECRET_KEY     = data.aws_ssm_parameter.stripe_secret_key.value
    STRIPE_WEBHOOK_SECRET = data.aws_ssm_parameter.stripe_webhook_secret.value
    GEMINI_API_KEY        = data.aws_ssm_parameter.gemini_api_key.value
    SMTP_HOST             = var.smtp_host
    SMTP_PORT             = var.smtp_port
    SMTP_SECURE           = var.smtp_secure
    SMTP_USER             = data.aws_ssm_parameter.smtp_user.value
    SMTP_PASS             = data.aws_ssm_parameter.smtp_pass.value
    NODE_ENV              = "production"
  }
}

# S3 + CloudFront Module (Frontend)
module "s3_cloudfront" {
  source = "../../modules/s3_cloudfront"

  project_name    = var.project_name
  environment     = var.environment
  backend_api_url = module.elastic_beanstalk.application_url
}
