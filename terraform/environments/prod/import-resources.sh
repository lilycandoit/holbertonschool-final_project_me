#!/bin/bash
# Import existing AWS resources into Terraform state
# Run this from terraform/environments/prod/ directory

set -e  # Exit on error

echo "🚀 Starting Terraform import process..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to import and handle errors
import_resource() {
    local resource=$1
    local id=$2
    echo -e "${YELLOW}Importing: $resource${NC}"
    if terraform import "$resource" "$id" 2>&1 | tee /tmp/terraform-import.log | grep -q "Successfully imported\|already managed"; then
        echo -e "${GREEN}✓ Successfully imported: $resource${NC}"
    else
        echo -e "⚠️  Warning: $resource might already exist or failed"
    fi
    echo ""
}

echo "📋 Resource Import Plan:"
echo "========================"
echo "Networking Module:"
echo "  - VPC: vpc-0e33cfd0b9b01c432"
echo "  - Internet Gateway: igw-0d289d2b77201ebf4"
echo "  - Subnets: 4 subnets"
echo "  - Route Tables: 1 public RT"
echo ""
echo "IAM Module:"
echo "  - EC2 Role: flora-eb-ec2-role"
echo "  - Service Role: flora-eb-service-role"
echo "  - Instance Profile: flora-eb-ec2-profile"
echo ""
echo "RDS Module:"
echo "  - Database: flora-db"
echo "  - Subnet Group: flora-db-subnet-group"
echo "  - Security Group: sg-0687d34514ca2e4b2"
echo ""
echo "Elastic Beanstalk Module:"
echo "  - Application: flora-backend"
echo "  - Environment: e-j8uvxqctjj"
echo "  - Security Group: sg-06c980ac68d98e195"
echo "  - CloudFront: E3QUB1WQW82EW8"
echo ""
echo "S3/CloudFront Module:"
echo "  - S3 Bucket: flora-frontend-production-b001bddb"
echo "  - CloudFront: E1V7RQIMT2CEP4"
echo ""
read -p "Press Enter to start importing resources..."
echo ""

# ==================== NETWORKING MODULE ====================
echo "=== Importing Networking Resources ==="

import_resource "module.networking.aws_vpc.main" "vpc-0e33cfd0b9b01c432"
import_resource "module.networking.aws_internet_gateway.main" "igw-0d289d2b77201ebf4"
import_resource "module.networking.aws_subnet.public_1" "subnet-0d9f9c196f5f8cbb1"
import_resource "module.networking.aws_subnet.public_2" "subnet-08849304a01c77ecf"
import_resource "module.networking.aws_subnet.private_1" "subnet-0c346f7f843dfc407"
import_resource "module.networking.aws_subnet.private_2" "subnet-0004719bbf5a613b1"
import_resource "module.networking.aws_route_table.public" "rtb-090913748ccb9eb90"
import_resource "module.networking.aws_route_table_association.public_1" "subnet-0d9f9c196f5f8cbb1/rtb-090913748ccb9eb90"
import_resource "module.networking.aws_route_table_association.public_2" "subnet-08849304a01c77ecf/rtb-090913748ccb9eb90"

# ==================== IAM MODULE ====================
echo "=== Importing IAM Resources ==="

import_resource "module.iam.aws_iam_role.eb_ec2_role" "flora-eb-ec2-role"
import_resource "module.iam.aws_iam_role.eb_service_role" "flora-eb-service-role"
import_resource "module.iam.aws_iam_instance_profile.eb_ec2_profile" "flora-eb-ec2-profile"

# IAM role policy attachments
echo -e "${YELLOW}Importing IAM policy attachments...${NC}"
terraform import "module.iam.aws_iam_role_policy_attachment.eb_web_tier" "flora-eb-ec2-role/arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier" || true
terraform import "module.iam.aws_iam_role_policy_attachment.eb_multicontainer_docker" "flora-eb-ec2-role/arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker" || true
terraform import "module.iam.aws_iam_role_policy_attachment.eb_service" "flora-eb-service-role/arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService" || true
terraform import "module.iam.aws_iam_role_policy_attachment.eb_enhanced_health" "flora-eb-service-role/arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth" || true

# ==================== RDS MODULE ====================
echo "=== Importing RDS Resources ==="

import_resource "module.rds.aws_db_subnet_group.main" "flora-db-subnet-group"
import_resource "module.rds.aws_security_group.rds" "sg-0687d34514ca2e4b2"
import_resource "module.rds.aws_db_instance.postgres" "flora-db"

# ==================== ELASTIC BEANSTALK MODULE ====================
echo "=== Importing Elastic Beanstalk Resources ==="

import_resource "module.elastic_beanstalk.aws_security_group.eb" "sg-06c980ac68d98e195"
import_resource "module.elastic_beanstalk.aws_elastic_beanstalk_application.backend" "flora-backend"
import_resource "module.elastic_beanstalk.aws_elastic_beanstalk_environment.backend" "e-j8uvxqctjj"
import_resource "module.elastic_beanstalk.aws_cloudfront_distribution.backend" "E3QUB1WQW82EW8"

# ==================== S3/CLOUDFRONT MODULE ====================
echo "=== Importing S3/CloudFront Resources ==="

import_resource "module.s3_cloudfront.aws_s3_bucket.frontend" "flora-frontend-production-b001bddb"
import_resource "module.s3_cloudfront.aws_cloudfront_distribution.frontend" "E1V7RQIMT2CEP4"

# Try to import bucket policy and website configuration (might not exist as separate resources)
echo -e "${YELLOW}Note: Some S3 configurations might not import if they don't exist as separate resources${NC}"

echo ""
echo "==================================================================="
echo -e "${GREEN}✓ Import process complete!${NC}"
echo "==================================================================="
echo ""
echo "Next steps:"
echo "1. Run: terraform plan"
echo "2. Review the output for any differences"
echo "3. If everything looks good, you can apply changes"
echo ""
