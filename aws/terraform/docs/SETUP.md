# 🚀 Fresh Terraform Setup Guide

> **Complete workflow for deploying Flora infrastructure from scratch**

This guide assumes you're starting fresh with no existing AWS resources.

---

## Prerequisites Checklist

- [ ] AWS Account created (Free Tier eligible)
- [ ] AWS CLI installed (`aws --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] Terraform installed (`terraform version`)
- [ ] Git repository cloned
- [ ] Environment secrets ready (Auth0, Stripe, Gemini API keys)

---

## Step 1: Configure AWS CLI

```bash
# Configure your AWS credentials
aws configure

# You'll be prompted for:
# AWS Access Key ID: [Your access key]
# AWS Secret Access Key: [Your secret key]
# Default region: us-east-1 (or your preferred region)
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

**Expected output:**
```json
{
    "UserId": "AIDAXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

---

## Step 2: Prepare Terraform Variables

### 2.1 Copy the example file

```bash
cd terraform/environments/prod
cp terraform.tfvars.example terraform.tfvars
```

### 2.2 Edit `terraform.tfvars` with your values

```hcl
# Project identification
project_name = "flora"
environment  = "production"

# AWS Region (use us-east-1 for Free Tier benefits)
aws_region = "us-east-1"

# Backend Configuration
backend_instance_type = "t3.micro"  # Free Tier eligible
backend_app_name      = "flora-backend"
backend_env_name      = "flora-backend-prod"

# Database Configuration
db_instance_class = "db.t3.micro"  # Free Tier eligible
db_name          = "flora_db"
db_username      = "flora_admin"
# db_password will be in SSM Parameter Store

# Frontend Configuration
frontend_domain = "your-domain.com"  # Optional: your custom domain
```

**⚠️ IMPORTANT:** Never commit this file! It's already in `.gitignore`.

---

## Step 3: Store Secrets in AWS Parameter Store

Terraform reads secrets from AWS Systems Manager Parameter Store, not from files.

### 3.1 Export your secrets

```bash
# Auth0 credentials
export AUTH0_CLIENT_SECRET="your-auth0-secret"

# Stripe credentials
export STRIPE_SECRET_KEY="sk_test_xxxxx"
export STRIPE_WEBHOOK_SECRET="whsec_xxxxx"

# Google Gemini AI
export GEMINI_API_KEY="AIzaxxxxx"

# Database password (strong password!)
export DB_PASSWORD="YourStrong123Password!"

# Email credentials
export SMTP_PASSWORD="your-smtp-password"
```

### 3.2 Run the setup script

```bash
# This creates SSM parameters from your environment variables
./setup-ssm-parameters.sh
```

**Expected output:**
```
🔐 Creating SSM Parameters for Flora Production...

Creating: /flora/production/database_password
✅ Created successfully

Creating: /flora/production/auth0_client_secret
✅ Created successfully

...
```

### 3.3 Verify parameters were created

```bash
aws ssm get-parameters \
  --names "/flora/production/stripe_secret_key" \
  --with-decryption

# You should see your encrypted value
```

---

## Step 4: Initialize Terraform

```bash
# Navigate to production environment
cd terraform/environments/prod

# Initialize Terraform (downloads provider plugins)
terraform init
```

**Expected output:**
```
Initializing modules...
Initializing the backend...
Initializing provider plugins...
- terraform.io/hashicorp/aws v5.100.0

Terraform has been successfully initialized!
```

**Files created:**
- `.terraform/` - Provider binaries (ignored by git)
- `.terraform.lock.hcl` - Dependency lock file (should be committed)

---

## Step 5: Plan Your Infrastructure

```bash
# Preview what Terraform will create
terraform plan -out=tfplan
```

**What to look for:**
```
Plan: 25 to add, 0 to change, 0 to destroy.
```

**Review the output carefully:**
- ✅ All instance types are `t3.micro` (Free Tier)
- ✅ No Load Balancers (expensive!)
- ✅ RDS is `db.t3.micro` (Free Tier)
- ✅ Storage is `gp3` type (cost-effective)

**⚠️ WARNING:** If you see `alb` or `elb` (Load Balancers), STOP and check your config!

---

## Step 6: Apply Infrastructure

```bash
# Create the infrastructure
terraform apply tfplan
```

**This will take 10-15 minutes.** Resources are created in this order:

1. **IAM Roles** (1 min) - Permissions for services
2. **S3 Buckets** (1 min) - Frontend hosting + assets
3. **RDS Database** (5-8 min) - PostgreSQL instance
4. **Elastic Beanstalk** (5-8 min) - Backend API
5. **CloudFront Distribution** (3-5 min) - CDN for frontend

**Expected output:**
```
Apply complete! Resources: 25 added, 0 changed, 0 destroyed.

Outputs:

backend_url = "http://flora-backend-prod.us-east-1.elasticbeanstalk.com"
cloudfront_url = "https://d1234567890abc.cloudfront.net"
database_endpoint = "flora-db.xxxxxx.us-east-1.rds.amazonaws.com:5432"
```

---

## Step 7: Verify Deployment

### 7.1 Check Backend

```bash
# Test backend health endpoint
curl https://your-backend-url.elasticbeanstalk.com/api/health

# Expected: {"status":"ok"}
```

### 7.2 Check Frontend

```bash
# Get CloudFront URL from outputs
terraform output cloudfront_url

# Visit in browser - you should see Flora homepage
```

### 7.3 Check Database

```bash
# Get database endpoint
DB_ENDPOINT=$(terraform output -raw database_endpoint)

# Connect using psql (if installed)
psql -h $DB_ENDPOINT -U flora_admin -d flora_db

# Enter password from SSM Parameter Store
```

---

## Step 8: Deploy Application Code

Terraform creates the infrastructure, but you need to deploy your application code separately.

### 8.1 Deploy Backend

```bash
# From project root
cd apps/backend

# Create deployment package
zip -r deploy.zip . -x "node_modules/*" -x ".env"

# Upload to Elastic Beanstalk
aws elasticbeanstalk create-application-version \
  --application-name flora-backend \
  --version-label v1.0.0 \
  --source-bundle S3Bucket="your-deployment-bucket",S3Key="deploy.zip"

aws elasticbeanstalk update-environment \
  --environment-name flora-backend-prod \
  --version-label v1.0.0
```

**Or use GitHub Actions** (recommended - see `.github/workflows/deploy-backend.yml`)

### 8.2 Deploy Frontend

```bash
cd apps/frontend

# Build for production
pnpm build:prod

# Sync to S3
aws s3 sync dist/ s3://flora-frontend-bucket/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <your-distribution-id> \
  --paths "/*"
```

---

## Step 9: Run Database Migrations

```bash
# SSH into Elastic Beanstalk instance
eb ssh flora-backend-prod

# Or use SSM Session Manager
aws ssm start-session --target <instance-id>

# Run Prisma migrations
cd /var/app/current
pnpm prisma migrate deploy
pnpm prisma db:seed
```

---

## Step 10: Test Everything

- [ ] Visit CloudFront URL - frontend loads
- [ ] Login with Google - Auth0 works
- [ ] Browse products - backend API works
- [ ] Add to cart - database writes work
- [ ] Complete checkout - Stripe integration works
- [ ] Check email - Email service works

---

## 📁 Files Involved

| File | Purpose | Commit to Git? |
|------|---------|----------------|
| `terraform.tfvars` | Your variable values | ❌ NO (secrets!) |
| `terraform.tfvars.example` | Template for variables | ✅ YES |
| `.terraform.lock.hcl` | Dependency versions | ✅ YES |
| `tfplan` | Generated plan file | ❌ NO (binary) |
| `.terraform/` | Provider binaries | ❌ NO (large!) |
| `main.tf`, `*.tf` | Infrastructure code | ✅ YES |

---

## 🎯 Next Steps

1. **Set up billing alerts** - AWS Console → Billing → Create Alert ($1, $5, $10 thresholds)
2. **Enable CloudWatch logs** - Monitor application errors
3. **Set up backups** - RDS automated backups (Free Tier includes 7 days)
4. **Configure custom domain** - Route53 or external DNS
5. **Review cost optimization** - See [AWS_COST_TIPS.md](AWS_COST_TIPS.md)

---

## 🆘 Common Issues

### "Error creating S3 bucket: BucketAlreadyExists"
**Solution:** S3 bucket names must be globally unique. Change `frontend_bucket_name` in terraform.tfvars.

### "Error launching instance: InsufficientInstanceCapacity"
**Solution:** AWS doesn't have capacity for t3.micro. Try a different availability zone:
```hcl
availability_zones = ["us-east-1b"]  # Try different zone
```

### "Error creating RDS: InvalidParameterValue"
**Solution:** Free Tier requires:
- Instance type: `db.t3.micro`
- Storage: 20-30 GB (Free Tier limit)
- Multi-AZ: `false`

### Terraform state file conflicts
**Solution:** If working in a team, use S3 backend for shared state (see Advanced Setup).

---

**Need help?** Check [IMPORT.md](IMPORT.md) if you're modifying existing infrastructure.
