# Flora AWS Deployment - Quick Start Guide

## 📚 Documentation Overview

**Start here** → Quick deployment guide with CI/CD
**Deep dive** → See other docs for detailed explanations

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `QUICK_START.md` (this file) | Deploy to AWS with CI/CD | First time setup |
| `ARCHITECTURE.md` | How Terraform works, file connections | Understanding the system |
| `DOCKER_DEPLOYMENT.md` | Docker strategy for AWS | Understanding build process |
| `DOCKER_COMMANDS_EXPLAINED.md` | Local vs AWS Docker commands | Troubleshooting |
| `README.md` | Full reference documentation | Looking up specific tasks |

## 🎯 Deployment Strategy

This guide sets up **automated CI/CD pipelines** using GitHub Actions:

```
┌──────────────────────────────────────────────────────┐
│  Push to GitHub (li-dev branch)                      │
│         ↓                                             │
│  GitHub Actions Workflow Triggers                    │
│         ↓                                             │
│  ┌──────────────────┐    ┌──────────────────┐       │
│  │ Backend Pipeline │    │ Frontend Pipeline│       │
│  │ 1. Build Docker  │    │ 1. Build with    │       │
│  │ 2. Push to       │    │    Docker        │       │
│  │    DockerHub     │    │ 2. Upload to S3  │       │
│  │ 3. EB pulls &    │    │ 3. Invalidate    │       │
│  │    runs image    │    │    CloudFront    │       │
│  └──────────────────┘    └──────────────────┘       │
└──────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Push code → automatic deployment
- ✅ Consistent builds every time
- ✅ No manual build steps
- ✅ Production-ready workflow

## 📋 Prerequisites

### Required Tools

```bash
# Check what you have
aws --version        # Need: AWS CLI v2
terraform --version  # Need: v1.0+
git --version        # Need: Git

# Install missing tools
brew install awscli terraform
```

### Required Accounts

1. **AWS Account** - Use AWS Educate/Academy for free tier
2. **GitHub Account** - For repository and Actions
3. **DockerHub Account** - Free tier (for backend images)
   - Sign up at https://hub.docker.com

### AWS Account Setup

1. **Access Keys:** IAM → Users → Create access key
2. **Configure CLI:**
   ```bash
   aws configure
   # AWS Access Key ID: AKIA...
   # AWS Secret Access Key: ...
   # Default region: ap-southeast-2 (Sydney)
   # Default output format: json
   ```

## 🚀 Step-by-Step Deployment

### Step 1: Fork Repository (If Working on Personal Version)

```bash
# Fork the group repo on GitHub UI
# Then clone your fork:
git clone https://github.com/YOUR_USERNAME/holbertonschool-final_project_me.git
cd holbertonschool-final_project_me
```

**Important:** You'll use **two repositories**:
- **Original/Group Repo**: For running Terraform (infrastructure)
- **Your Forked Repo**: For code deployment via GitHub Actions

### Step 2: Configure Terraform Secrets

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your secrets:

```hcl
# Database - set strong password
database_username = "flora_admin"
database_password = "ChangeMe_SecurePassword123!"

# Auth0 (from backend .env file)
auth0_domain = "dev-ijvur34mojpovh8e.us.auth0.com"
auth0_client_id = "tegmEuc40IvXfYFDLIRnJmbsa1izkTVL"
auth0_client_secret = "YOUR_SECRET_FROM_AUTH0_DASHBOARD"
auth0_audience = "https://flora-api.com"

# Stripe (from your dashboard)
stripe_secret_key = "sk_test_YOUR_KEY_HERE"
stripe_webhook_secret = "whsec_YOUR_WEBHOOK_SECRET"
stripe_publishable_key = "pk_test_YOUR_KEY_HERE"

# Email/SMTP (optional, from backend .env)
smtp_user = "your_email@gmail.com"
smtp_pass = "your_app_password"

# Gemini AI (optional, from backend .env)
gemini_api_key = "your_gemini_key"
```

### Step 3: Create AWS Infrastructure

```bash
# Initialize Terraform (downloads AWS provider)
terraform init

# Preview what will be created
terraform plan

# Create infrastructure (takes ~10-15 minutes)
terraform apply
```

Type `yes` when prompted.

**What gets created:**
```
Creating infrastructure...
✅ VPC and networking (30 seconds)
✅ RDS PostgreSQL database (5 minutes)
✅ Elastic Beanstalk environment (4 minutes)
✅ S3 bucket + CloudFront (frontend) (1 minute)
✅ CloudFront distribution (backend HTTPS) (2 minutes)

Total: ~10-15 minutes
```

**Save the outputs:**
```bash
terraform output > ../deployment-urls.txt
cat ../deployment-urls.txt
```

You'll see:
```
backend_api_url = "http://flora-backend-production.xxx.elasticbeanstalk.com"
backend_cloudfront_url = "https://d15olm8n2z7b5h.cloudfront.net"
frontend_cloudfront_url = "https://d1fgjrmf4cfwou.cloudfront.net"
frontend_s3_bucket = "flora-frontend-production-abc123"
cloudfront_distribution_id = "E1V7RQIMT2CEP4"
```

### Step 4: Set Up GitHub Secrets (For CI/CD)

Go to your **forked repository** on GitHub:
1. **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**

Add these secrets:

**AWS Credentials (4 secrets):**
- `AWS_ACCESS_KEY_ID` = Your AWS access key
- `AWS_SECRET_ACCESS_KEY` = Your AWS secret key

**DockerHub Credentials (2 secrets):**
- `DOCKERHUB_USERNAME` = Your DockerHub username
- `DOCKERHUB_TOKEN` = DockerHub access token (create at hub.docker.com → Account Settings → Security)

**Frontend Build Variables (4 secrets):**
- `VITE_AUTH0_DOMAIN` = `dev-ijvur34mojpovh8e.us.auth0.com`
- `VITE_AUTH0_CLIENT_ID` = `tegmEuc40IvXfYFDLIRnJambsa1izkTVL`
- `VITE_AUTH0_AUDIENCE` = `https://flora-api.com`
- `VITE_STRIPE_PUBLISHABLE_KEY` = `pk_test_YOUR_KEY_HERE`

**Total: 10 GitHub Secrets**

### Step 5: Update Dockerrun.aws.json with Your DockerHub Image

```bash
cd ../apps/backend

# Edit Dockerrun.aws.json
nano Dockerrun.aws.json
```

Change the image name to your DockerHub username:

```json
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "YOUR_DOCKERHUB_USERNAME/flora-backend:latest",
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
```

### Step 6: Create .ebignore File (Important!)

```bash
cd apps/backend

# Create .ebignore to exclude Dockerfile from EB deployment
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
```

**Why?** EB should pull the pre-built image from DockerHub, not try to build from Dockerfile.

### Step 7: Commit and Push to Trigger CI/CD

```bash
cd ../..  # Back to project root

git add .
git commit -m "Setup CI/CD with GitHub Actions"
git push origin li-dev
```

**This automatically triggers:**
1. **Backend Workflow** (`.github/workflows/deploy-backend.yml`):
   - Builds Docker image
   - Pushes to DockerHub
   - Deploys to Elastic Beanstalk

2. **Frontend Workflow** (`.github/workflows/deploy-frontend.yml`):
   - Builds frontend with Docker
   - Uploads to S3
   - Invalidates CloudFront cache

**Check Progress:**
- Go to GitHub → Your repo → **Actions** tab
- Watch the workflows run (takes ~5-10 minutes)

### Step 8: Run Database Migrations (One-Time Setup)

**Note:** Migrations run automatically on container startup via `package.json` script:
```json
"start:prod": "prisma migrate deploy && prisma db seed && node dist/index.js"
```

But you can manually verify:

```bash
cd apps/backend

# SSH into EB instance
eb ssh

# Check if migrations ran
docker logs $(docker ps -q) | grep "prisma"

# If needed, run manually:
docker exec $(docker ps -q) npx prisma migrate deploy
docker exec $(docker ps -q) npx prisma db seed

exit
```

### Step 9: Test Your Deployment

```bash
# Get URLs
cd ../../terraform
terraform output

# Test backend health
curl $(terraform output -raw backend_cloudfront_url)/api/health
# Expected: {"status":"ok","environment":"production"}

# Test backend products
curl $(terraform output -raw backend_cloudfront_url)/api/products
# Expected: [{"id":"...","name":"..."}, ...]

# Visit frontend
# Open the frontend CloudFront URL in browser
open $(terraform output -raw frontend_cloudfront_url)
```

## 🔄 Daily Development Workflow

### Making Code Changes

```bash
# 1. Make your code changes locally
# 2. Test locally with Docker
pnpm docker:dev

# 3. Commit and push
git add .
git commit -m "Your change description"
git push origin li-dev

# 4. GitHub Actions automatically deploys! ✅
# Check progress: GitHub → Actions tab
```

### Workflow Triggers

**Backend deploys when you change:**
- `apps/backend/**`
- `pnpm-workspace.yaml`
- `package.json`
- `.github/workflows/deploy-backend.yml`
- `.dockerignore`

**Frontend deploys when you change:**
- `apps/frontend/**`
- `pnpm-workspace.yaml`
- `.github/workflows/deploy-frontend.yml`
- `.dockerignore`

### Manual Deployment (Fallback)

If GitHub Actions is down, deploy manually:

**Backend:**
```bash
# Build and push to DockerHub
cd apps/backend
docker build -t YOUR_USERNAME/flora-backend:latest -f Dockerfile ../../
docker push YOUR_USERNAME/flora-backend:latest

# Deploy to EB
eb init flora-backend --platform docker --region ap-southeast-2
eb use flora-backend-production
eb deploy
```

**Frontend:**
```bash
cd apps/frontend

# Build with Docker
docker build \
  --build-arg VITE_API_URL="https://BACKEND_CLOUDFRONT_URL/api" \
  --build-arg VITE_AUTH0_DOMAIN="dev-ijvur34mojpovh8e.us.auth0.com" \
  --build-arg VITE_AUTH0_CLIENT_ID="tegmEuc40IvXfYFDLIRnJmbsa1izkTVL" \
  --build-arg VITE_AUTH0_AUDIENCE="https://flora-api.com" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="pk_test_..." \
  -t flora-frontend-manual \
  -f Dockerfile \
  ../../

# Extract dist
docker create --name temp flora-frontend-manual
docker cp temp:/app/apps/frontend/dist ./dist-manual
docker rm temp

# Upload to S3
S3_BUCKET=$(cd ../../terraform && terraform output -raw frontend_s3_bucket)
aws s3 sync dist-manual/ s3://$S3_BUCKET/ --delete

# Override cache for index.html
aws s3 cp s3://$S3_BUCKET/index.html s3://$S3_BUCKET/index.html \
  --metadata-directive REPLACE \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html"

# Invalidate CloudFront
CLOUDFRONT_ID=$(cd ../../terraform && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

# Cleanup
rm -rf dist-manual
docker rmi flora-frontend-manual
```

## 🧹 Cleanup / Delete Everything

**WARNING:** This deletes ALL resources and data!

```bash
cd terraform
terraform destroy
# Type 'yes' to confirm
```

**What gets deleted:**
- All EC2 instances
- RDS database (and all data!)
- S3 bucket (and all files!)
- Both CloudFront distributions
- VPC and networking

Takes ~10 minutes.

## 💰 Cost Breakdown

### Free Tier (First 12 Months)

| Resource | Free Tier | Your Usage | Cost |
|----------|-----------|------------|------|
| EC2 (t2.micro) | 750 hrs/month | 1 instance 24/7 = 720 hrs | $0 |
| RDS (db.t3.micro) | 750 hrs/month | 1 instance 24/7 = 720 hrs | $0 |
| S3 | 5 GB storage | ~500 MB | $0 |
| CloudFront (2 distros) | 50 GB transfer | ~10 GB | $0 |
| **Total** | | | **$0/month** |

### After Free Tier

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t2.micro | ~$8 |
| RDS db.t3.micro | ~$15 |
| S3 + CloudFront | ~$3 |
| **Total** | **~$26/month** |

## ❓ Troubleshooting

### GitHub Actions Workflow Fails

```bash
# Check workflow logs
# GitHub → Your repo → Actions → Click failed workflow

# Common issues:
# 1. Missing GitHub Secrets → Add them in Settings
# 2. DockerHub credentials wrong → Regenerate token
# 3. AWS credentials expired → Update in GitHub Secrets
```

### Backend Deployment Fails

```bash
# Check EB logs
cd apps/backend
eb logs

# Check environment health
eb health

# SSH and debug
eb ssh
docker ps  # Check if container is running
docker logs $(docker ps -q)  # Check container logs
```

### Frontend CSS/Assets Not Loading

```bash
# Check if files uploaded to S3
aws s3 ls s3://$(terraform output -raw frontend_s3_bucket)

# Check CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_distribution_id) \
  --paths "/*"

# Wait 1-3 minutes for cache to clear
```

### Database Connection Fails

```bash
# Get RDS endpoint
terraform output database_endpoint

# Check from EB instance
eb ssh
docker exec -it $(docker ps -q) sh
env | grep DATABASE_URL
```

## 📞 Need Help?

1. **GitHub Actions Docs:** https://docs.github.com/en/actions
2. **DockerHub Docs:** https://docs.docker.com/docker-hub/
3. **Terraform Docs:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs
4. **EB CLI Docs:** https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html

## ✅ Deployment Checklist

Before presenting/demoing:

- [ ] Terraform apply completed successfully
- [ ] GitHub Secrets configured (all 10)
- [ ] Dockerrun.aws.json updated with your DockerHub username
- [ ] .ebignore file created in apps/backend
- [ ] Pushed to GitHub and workflows succeeded (green checkmarks)
- [ ] Backend API responds: `curl BACKEND_CLOUDFRONT_URL/api/health`
- [ ] Frontend loads in browser
- [ ] Can log in with Auth0
- [ ] Can add items to cart
- [ ] Payment form appears (Stripe integration)

## 🎓 For Your Portfolio

Mention in interviews:

- ✅ Infrastructure as Code (Terraform)
- ✅ **CI/CD Pipelines (GitHub Actions)** ← This is impressive!
- ✅ Docker containerization (consistent dev → prod)
- ✅ Multi-service AWS architecture (RDS, EB, S3, CloudFront)
- ✅ Automated testing and deployment
- ✅ Security best practices (secrets management, private subnets)
- ✅ Cost optimization (free tier usage)

This demonstrates strong **DevOps**, **Cloud Engineering**, and **Automation** skills!
