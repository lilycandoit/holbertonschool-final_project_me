# Flora Marketplace - AWS Infrastructure with Terraform
# Main configuration file

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "flora-terraform-state"
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

# VPC and Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

# Public Subnets (for EB instances)
resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet-2"
  }
}

# Private Subnets (for RDS)
resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "${var.project_name}-private-subnet-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "${var.project_name}-private-subnet-2"
  }
}

# Route Table for Public Subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# RDS Module
module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = aws_vpc.main.id
  private_subnet_ids    = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  database_name         = var.database_name
  database_username     = var.database_username
  database_password     = var.database_password
  allowed_security_group_id = module.elastic_beanstalk.security_group_id
}

# Elastic Beanstalk Module (Backend)
module "elastic_beanstalk" {
  source = "./modules/elastic_beanstalk"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = aws_vpc.main.id
  public_subnet_ids  = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  # Environment variables for backend
  env_vars = {
    DATABASE_URL          = module.rds.connection_string
    AUTH0_DOMAIN          = var.auth0_domain
    AUTH0_CLIENT_ID       = var.auth0_client_id
    AUTH0_CLIENT_SECRET   = var.auth0_client_secret
    AUTH0_AUDIENCE        = var.auth0_audience
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    GEMINI_API_KEY        = var.gemini_api_key
    SMTP_HOST             = var.smtp_host
    SMTP_PORT             = var.smtp_port
    SMTP_SECURE           = var.smtp_secure
    SMTP_USER             = var.smtp_user
    SMTP_PASS             = var.smtp_pass
    NODE_ENV              = "production"
  }
}

# S3 + CloudFront Module (Frontend)
module "s3_cloudfront" {
  source = "./modules/s3_cloudfront"

  project_name    = var.project_name
  environment     = var.environment
  backend_api_url = module.elastic_beanstalk.application_url
}
