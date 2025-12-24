output "application_name" {
  description = "Elastic Beanstalk application name"
  value       = aws_elastic_beanstalk_application.backend.name
}

output "environment_name" {
  description = "Elastic Beanstalk environment name"
  value       = aws_elastic_beanstalk_environment.backend.name
}

output "application_url" {
  description = "Application URL"
  value       = aws_elastic_beanstalk_environment.backend.endpoint_url
}

output "security_group_id" {
  description = "Security group ID for EB instances"
  value       = aws_security_group.eb.id
}

output "cloudfront_url" {
  description = "CloudFront HTTPS URL for backend API (use this for Stripe webhooks)"
  value       = "https://${aws_cloudfront_distribution.backend.domain_name}"
}

output "cloudfront_domain" {
  description = "CloudFront domain name"
  value       = aws_cloudfront_distribution.backend.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.backend.id
}
