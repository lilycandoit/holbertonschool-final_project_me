# Elastic Beanstalk Module for Flora Backend (Docker)

# Security Group for EB instances
resource "aws_security_group" "eb" {
  name        = "${var.project_name}-eb-sg"
  description = "Security group for Elastic Beanstalk instances"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-eb-sg"
  }
}

# IAM Role for EB instances
resource "aws_iam_role" "eb_ec2_role" {
  name = "${var.project_name}-eb-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eb_web_tier" {
  role       = aws_iam_role.eb_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "eb_multicontainer_docker" {
  role       = aws_iam_role.eb_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker"
}

resource "aws_iam_instance_profile" "eb_ec2_profile" {
  name = "${var.project_name}-eb-ec2-profile"
  role = aws_iam_role.eb_ec2_role.name
}

# IAM Role for EB service
resource "aws_iam_role" "eb_service_role" {
  name = "${var.project_name}-eb-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "elasticbeanstalk.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eb_service" {
  role       = aws_iam_role.eb_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService"
}

resource "aws_iam_role_policy_attachment" "eb_enhanced_health" {
  role       = aws_iam_role.eb_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
}

# Elastic Beanstalk Application
resource "aws_elastic_beanstalk_application" "backend" {
  name        = "${var.project_name}-backend"
  description = "Flora Marketplace Backend API"
}

# Elastic Beanstalk Environment
resource "aws_elastic_beanstalk_environment" "backend" {
  name                = "${var.project_name}-backend-${var.environment}"
  application         = aws_elastic_beanstalk_application.backend.name
  solution_stack_name = "64bit Amazon Linux 2023 v4.7.3 running Docker"
  tier                = "WebServer"

  # VPC Configuration
  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = var.vpc_id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", var.public_subnet_ids)
  }

  # Environment Type - Single instance for free tier
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance"
  }

  # Health Reporting - Basic (enhanced requires load balancer)
  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "basic"
  }

  # Platform Configuration for Docker
  setting {
    namespace = "aws:elasticbeanstalk:environment:proxy"
    name      = "ProxyServer"
    value     = "nginx"
  }

  # Environment Variables
  dynamic "setting" {
    for_each = var.env_vars
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.key
      value     = setting.value
    }
  }

  # Container Port Mapping
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "PORT"
    value     = "3001"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "CORS_ALLOWED_ORIGINS"
    value     = "https://d1fgjrmf4cfwou.cloudfront.net"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "FRONTEND_URL"
    value     = "https://d1fgjrmf4cfwou.cloudfront.net"
  }
}

# CloudFront Distribution for Backend (HTTPS Support)
# This provides free HTTPS via CloudFront's certificate for Stripe webhooks
resource "aws_cloudfront_distribution" "backend" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Flora Marketplace Backend API - HTTPS for Stripe"
  price_class     = "PriceClass_100" # Use only North America & Europe (cheapest)

  # Use the Elastic Beanstalk environment's public DNS as origin
  origin {
    domain_name = aws_elastic_beanstalk_environment.backend.endpoint_url
    origin_id   = "EB-${aws_elastic_beanstalk_environment.backend.name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "EB-${aws_elastic_beanstalk_environment.backend.name}"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Accept", "Content-Type", "Origin"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https" # Force HTTPS for Stripe
    min_ttl                = 0
    default_ttl            = 0    # Don't cache API responses by default
    max_ttl                = 0
    compress               = true
  }

  # Don't cache POST requests (for Stripe webhooks)
  ordered_cache_behavior {
    path_pattern     = "/api/webhooks/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "EB-${aws_elastic_beanstalk_environment.backend.name}"

    forwarded_values {
      query_string = true
      headers      = ["*"] # Forward all headers for webhooks

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "https-only" # Stripe webhooks must be HTTPS
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Name = "${var.project_name}-backend-cdn"
  }
}
