output "eb_ec2_instance_profile_name" {
  description = "Name of the IAM instance profile for EB EC2 instances"
  value       = aws_iam_instance_profile.eb_ec2_profile.name
}

output "eb_ec2_role_name" {
  description = "Name of the IAM role for EB EC2 instances"
  value       = aws_iam_role.eb_ec2_role.name
}

output "eb_service_role_arn" {
  description = "ARN of the IAM service role for Elastic Beanstalk"
  value       = aws_iam_role.eb_service_role.arn
}

output "eb_service_role_name" {
  description = "Name of the IAM service role for Elastic Beanstalk"
  value       = aws_iam_role.eb_service_role.name
}
