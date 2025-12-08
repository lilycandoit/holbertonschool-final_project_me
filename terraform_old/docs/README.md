# Flora Marketplace - AWS Deployment with Terraform

This directory contains Terraform infrastructure as code (IaC) for deploying Flora Marketplace to AWS.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│         CloudFront CDN (Frontend)                   │
│         https://xxxx.cloudfront.net                 │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │   S3 Bucket        │
        │  (Static Files)    │
        └────────────────────┘

┌─────────────────────────────────────────────────────┐
│    Elastic Beanstalk (Docker Backend)               │
│    http://flora-backend-prod.xxx.elasticbeanstalk   │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │  RDS PostgreSQL    │
        │   (Database)       │
        └────────────────────┘
```

## 🚀 Deployment Approach: CI/CD vs Manual

This project supports **two deployment methods**:

### ✅ Recommended: CI/CD with GitHub Actions (Automated)

**Best for:** Daily development, team collaboration, production deployments

- Push code to GitHub → Automatic deployment
- Workflows defined in `.github/workflows/`
- Backend: Build → DockerHub → Elastic Beanstalk
- Frontend: Build → S3 → CloudFront invalidation

**Setup:**
1. Configure GitHub Secrets (10 total)
2. Push to `li-dev` branch
3. Monitor deployment in GitHub Actions tab

**See:** [`QUICK_START.md`](./QUICK_START.md) for full CI/CD setup guide

### 🔧 Manual Deployment (Fallback)

**Best for:** Initial setup, troubleshooting, GitHub Actions downtime

- Run deployment scripts or commands locally
- Requires: AWS CLI, EB CLI, Docker
- Manual `eb deploy` and `aws s3 sync` commands

**See:** Instructions below in this README

---

## 📋 Prerequisites

1. **AWS Account** (with student/free tier access)
2. **AWS CLI** installed and configured
3. **Terraform** installed (v1.0+)
4. **EB CLI** for Elastic Beanstalk deployments
5. **Docker** for building backend image

### Install Tools

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Install Terraform
brew install terraform

# Install EB CLI
pip install awsebcli

# Verify installations
aws --version
terraform --version
eb --version
```

### Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: ap-southeast-2 (Sydney)
# Default output format: json
```

**Note:**: Check if AWS CLI is Already Configured

  AWS CLI configuration is stored globally on your machine (not per-project). If you configured it before for another
  project, it's likely still there!

```
  # Check if AWS CLI is installed and configured
  aws --version

  # Check current AWS configuration
  aws configure list

  # Verify your credentials work (this will show your AWS account info)
  aws sts get-caller-identity
```


## 🚀 Deployment Steps

### Step 1: Configure Terraform Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual values
nano terraform.tfvars
```

**Important:** Update these values in `terraform.tfvars`:
- `database_password` - Strong password for PostgreSQL
- `auth0_client_secret` - From Auth0 dashboard
- `stripe_secret_key` - From Stripe dashboard
- `stripe_publishable_key` - From Stripe dashboard

### Step 2: Initialize Terraform (download AWS provider)

Quick test before initializing:
```bash
  # Validate syntax
  terraform validate
  # Expected: "Success! The configuration is valid."
```

Then:
```bash
terraform init
```

This will:
- Download AWS provider plugins
- Initialize backend configuration
- Prepare modules

### Step 3: Plan Infrastructure - Preview what will be created (IMPORTANT!)

```bash
terraform plan
# Expected: "Plan: ~20 to add, 0 to change, 0 to destroy."
```

Review the plan to see what resources will be created:
- VPC with public/private subnets
- RDS PostgreSQL database
- Elastic Beanstalk application & environment
- S3 bucket for frontend
- CloudFront distribution

**Note**: In some cases which we don't apply rightaway, like:

  1. CI/CD pipelines - Plan and apply happen at different times
  2. Team approval workflows - Need to review plan before applying
  3. Multi-day deployments - Plan today, apply tomorrow

Then, we can save the plan to a file so you can apply that exact plan later:
```bash
  # Save plan to file
  terraform plan -out=tfplan

  # Review the saved plan
  terraform show tfplan

  # Apply the saved plan (no confirmation needed)
  terraform apply tfplan
```

### Step 4: Deploy Infrastructure

```bash
terraform apply
```

Type `yes` to confirm. This will take **10-15 minutes** to complete.

**What gets created:**
- ✅ VPC, subnets, security groups
- ✅ RDS PostgreSQL (db.t3.micro - free tier)
- ✅ Elastic Beanstalk environment (t2.micro - free tier)
- ✅ S3 bucket + CloudFront distribution
- ✅ IAM roles and policies

### Step 5: Deploy Backend to Elastic Beanstalk

After Terraform completes, deploy your Docker backend.

**⚠️ Note:** This is the **manual deployment method**. For automated CI/CD, see [`QUICK_START.md`](./QUICK_START.md).

#### Option A: Deploy with DockerHub (Recommended for CI/CD)

```bash
cd ../apps/backend

# 1. Build and push to DockerHub
docker build -t your-dockerhub-username/flora-backend:latest -f Dockerfile ../../
docker push your-dockerhub-username/flora-backend:latest

# 2. Create Dockerrun.aws.json pointing to DockerHub image
cat > Dockerrun.aws.json <<'EOF'
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "your-dockerhub-username/flora-backend:latest",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 3001,
      "HostPort": 80
    }
  ],
  "Logging": "/var/log/flora-backend"
}
EOF

# 3. Create .ebignore to exclude Dockerfile
cat > .ebignore <<'EOF'
Dockerfile
Dockerfile.*
node_modules/
src/
*.test.ts
coverage/
.env*
!.env.example
dist/
*.md
.vscode/
EOF

# 4. Initialize EB CLI (only first time)
eb init -p docker -r ap-southeast-2 flora-backend
eb use flora-backend-production

# 5. Deploy
eb deploy
```

**Why .ebignore?** Prevents EB from trying to build locally from Dockerfile. EB should pull the pre-built image from DockerHub.

#### Option B: Build on EB Instance (Local development)

```bash
cd ../apps/backend

# Create Dockerrun.aws.json (build locally)
cat > Dockerrun.aws.json <<'EOF'
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": ".",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 3001,
      "HostPort": 80
    }
  ]
}
EOF

# Initialize and deploy
eb init -p docker -r ap-southeast-2 flora-backend
eb use flora-backend-production
eb deploy
```

### Step 6: Run Database Migrations

```bash
# SSH into EB instance
eb ssh

# Run Prisma migrations
cd /var/app/current
npx prisma migrate deploy
npx prisma db seed

# Exit
exit
```

**Or run migrations via EB environment variables:**

Set environment variable in EB:
```bash
eb setenv RUN_MIGRATIONS=true
```

### Step 7: Build and Deploy Frontend

```bash
# Navigate to frontend
cd ../../apps/frontend

# Get backend URL from Terraform output
cd ../../terraform
terraform output backend_api_url
# Copy the URL (e.g., http://flora-backend-production.xxx.elasticbeanstalk.com)

# Build frontend with production env vars
cd ../apps/frontend
export VITE_API_URL="<YOUR_BACKEND_URL>/api"
export VITE_AUTH0_DOMAIN="dev-ijvur34mojpovh8e.us.auth0.com"
export VITE_AUTH0_CLIENT_ID="tegmEuc40IvXfYFDLIRnJmbsa1izkTVL"
export VITE_AUTH0_AUDIENCE="https://flora-api.com"
export VITE_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_KEY"

# Build
pnpm run build

# Get S3 bucket name from Terraform
cd ../../terraform
terraform output frontend_s3_bucket
# Copy the bucket name

# Upload to S3
cd ../apps/frontend
aws s3 sync dist/ s3://<YOUR_BUCKET_NAME> --delete

# Invalidate CloudFront cache
cd ../../terraform
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### Step 8: Get Your URLs

```bash
cd terraform
terraform output deployment_summary
```

**Your application is now live!** 🎉

- **Frontend:** `https://xxxx.cloudfront.net`
- **Backend API:** `http://flora-backend-production.xxx.elasticbeanstalk.com`

## 📝 Common Commands

### View Terraform Outputs

```bash
terraform output
terraform output backend_api_url
terraform output frontend_cloudfront_url
```

### Update Infrastructure

```bash
# Make changes to .tf files
terraform plan  # Review changes
terraform apply # Apply changes
```

### Deploy Backend Updates

```bash
cd apps/backend
eb deploy
```

### Deploy Frontend Updates

```bash
cd apps/frontend
pnpm run build
aws s3 sync dist/ s3://$(cd ../../terraform && terraform output -raw frontend_s3_bucket) --delete
aws cloudfront create-invalidation --distribution-id $(cd ../../terraform && terraform output -raw cloudfront_distribution_id) --paths "/*"
```

### View Backend Logs

```bash
cd apps/backend
eb logs
```

### SSH to Backend

```bash
cd apps/backend
eb ssh
```

## 🧹 Cleanup / Destroy

**WARNING:** This will delete ALL resources and data!

```bash
cd terraform
terraform destroy
```

Type `yes` to confirm.

## 💰 Cost Optimization (Free Tier)

Current configuration uses:
- ✅ **RDS:** db.t3.micro (750 hours/month free)
- ✅ **EC2:** t2.micro (750 hours/month free)
- ✅ **S3:** 5GB storage (free)
- ✅ **CloudFront:** 50GB transfer (free)

**Total cost:** $0/month (within free tier limits)

**After 12 months:**
- RDS: ~$15/month
- EC2: ~$8/month
- S3+CloudFront: ~$2/month
- **Total:** ~$25/month

## 🔒 Security Best Practices

1. ✅ Database in private subnet (not publicly accessible)
2. ✅ Security groups restrict access
3. ✅ HTTPS for frontend (CloudFront)
4. ✅ Secrets in Terraform variables (not hardcoded)
5. ⚠️ Enable RDS encryption for production (costs extra)
6. ⚠️ Use ACM for custom domain SSL certificate

## 🐛 Troubleshooting

### Terraform apply fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Re-initialize
terraform init -upgrade
```

### Backend deployment fails
```bash
# Check EB logs
eb logs

# Check environment health
eb health
```

### Frontend not loading
```bash
# Check S3 upload
aws s3 ls s3://$(terraform output -raw frontend_s3_bucket)

# Check CloudFront distribution
aws cloudfront get-distribution --id $(terraform output -raw cloudfront_distribution_id)
```

### Database connection fails
```bash
# Check RDS endpoint
terraform output database_endpoint

# Check security groups allow EB to RDS
```

## 📚 Resources

- [AWS Free Tier](https://aws.amazon.com/free/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Elastic Beanstalk Docker Guide](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/single-container-docker.html)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)

## 🎓 For Your Portfolio

This Terraform setup demonstrates:
- ✅ Infrastructure as Code (IaC)
- ✅ AWS multi-service architecture
- ✅ Docker containerization
- ✅ Cloud security best practices
- ✅ DevOps automation
- ✅ Scalable architecture design

Great for interviews and showcasing cloud engineering skills!
