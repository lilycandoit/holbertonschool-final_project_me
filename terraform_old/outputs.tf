# Outputs for Flora Marketplace Infrastructure

output "frontend_cloudfront_url" {
  description = "CloudFront distribution URL for frontend"
  value       = module.s3_cloudfront.cloudfront_url
}

output "frontend_s3_bucket" {
  description = "S3 bucket name for frontend static files"
  value       = module.s3_cloudfront.s3_bucket_name
}

output "backend_api_url" {
  description = "Elastic Beanstalk application URL (HTTP only)"
  value       = module.elastic_beanstalk.application_url
}

output "backend_cloudfront_url" {
  description = "Backend CloudFront URL (HTTPS - use this for Stripe webhooks)"
  value       = module.elastic_beanstalk.cloudfront_url
}

output "backend_environment_name" {
  description = "Elastic Beanstalk environment name"
  value       = module.elastic_beanstalk.environment_name
}

output "database_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "database_name" {
  description = "Database name"
  value       = module.rds.db_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

# Summary output
output "deployment_summary" {
  description = "Summary of deployed resources"
  value = <<-EOT

    ========================================
    Flora Marketplace - AWS Deployment
    ========================================

    Frontend:
      CloudFront URL: ${module.s3_cloudfront.cloudfront_url}
      S3 Bucket:      ${module.s3_cloudfront.s3_bucket_name}

    Backend:
      API URL (HTTP):  ${module.elastic_beanstalk.application_url}
      HTTPS URL:       ${module.elastic_beanstalk.cloudfront_url}
      Environment:     ${module.elastic_beanstalk.environment_name}

      ⚠️  Use HTTPS URL for Stripe webhooks

    Database:
      Endpoint:       ${module.rds.db_endpoint}
      Name:           ${module.rds.db_name}

    Next Steps:
      1. Deploy backend: cd apps/backend && eb deploy
      2. Build frontend: cd apps/frontend && pnpm build
      3. Upload frontend: aws s3 sync dist/ s3://${module.s3_cloudfront.s3_bucket_name}
      4. Invalidate cache: aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"

    ========================================
  EOT
}
