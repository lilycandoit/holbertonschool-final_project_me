# 🚀 Flora Deployment Guide

> **Deploy Dockerized Flora app code to AWS**

---

## Overview

This guide covers **STEP 2** of the deployment process (deploying code).

```
┌─────────────────────────────────────────────────────┐
│ STEP 1: Infrastructure Setup (One-Time)            │
│ Follow: SETUP.md                                    │
│ Creates: EC2, RDS, S3, CloudFront via Terraform    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ STEP 2: Code Deployment (Daily) ← YOU ARE HERE     │
│ Follow: DEPLOYMENT.md (this guide)                  │
│ Deploys: Docker images → DockerHub → AWS           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ STEP 3: Infrastructure Changes (As Needed)         │
│ Follow: IMPORT.md                                   │
│ Modifies: Instance types, RDS settings, etc.       │
└─────────────────────────────────────────────────────┘
```

**Daily workflow once set up:**
```bash
git push origin li-dev    # That's it! GitHub Actions handles the rest
```

---

## Prerequisites

**Before deploying code, you need:**

1. ✅ **AWS infrastructure running** → Follow [SETUP.md](SETUP.md) if not done yet
2. ✅ **DockerHub account** → Create at [hub.docker.com](https://hub.docker.com)
3. ✅ **GitHub Secrets configured** → See [Setup GitHub Actions](#setup-github-actions-one-time) below

**If infrastructure doesn't exist yet:**
- Stop here and follow [**SETUP.md**](SETUP.md) first (creates EC2, RDS, S3, CloudFront)
- Come back to this guide after `terraform apply` succeeds

**If infrastructure already exists:**
- You're ready to deploy code! Continue below ⬇️

---

## Setup GitHub Actions (One-Time)

**Get infrastructure outputs from Terraform:**
```bash
cd terraform/environments/prod
terraform output

# You'll need these values for GitHub Secrets:
# - cloudfront_frontend_domain
# - s3_bucket_name
# - cloudfront_distribution_id
```

**Add GitHub Secrets:**

Go to: **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value | Where to Get It |
|-------------|-------|-----------------|
| `DOCKERHUB_USERNAME` | Your DockerHub username | hub.docker.com |
| `DOCKERHUB_TOKEN` | DockerHub access token | Account Settings → Security |
| `AWS_ACCESS_KEY_ID` | AWS credentials | `aws configure get aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | `aws configure get aws_secret_access_key` |
| `VITE_AUTH0_DOMAIN` | Auth0 domain | Auth0 Dashboard |
| `VITE_AUTH0_CLIENT_ID` | Auth0 client ID | Auth0 Dashboard |
| `VITE_AUTH0_AUDIENCE` | Auth0 API identifier | Auth0 Dashboard |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe public key | Stripe Dashboard |

**Update workflow files with your values:**
```bash
# Edit .github/workflows/deploy-backend.yml
DOCKER_IMAGE: YOUR_USERNAME/flora-backend    # Line 17

# Edit .github/workflows/deploy-frontend.yml
S3_BUCKET: your-s3-bucket-name               # Line 16 (from terraform output)
CLOUDFRONT_DISTRIBUTION_ID: YOUR_CF_ID       # Line 17 (from terraform output)
VITE_API_URL: https://YOUR_BACKEND_CF_URL/api # Line 20 (from terraform output)
```

---

## Deployment Workflows

### Option A: Automated (GitHub Actions) ✅ **Recommended**

**Deploy code:**
```bash
git add .
git commit -m "feat: your changes"
git push origin li-dev    # Triggers both workflows
```

**Workflows automatically:**
1. **Backend** (`.github/workflows/deploy-backend.yml`)
   - Builds Docker image
   - Pushes to DockerHub: `YOUR_USERNAME/flora-backend:latest`
   - Deploys to Elastic Beanstalk
   - EB pulls image and runs container

2. **Frontend** (`.github/workflows/deploy-frontend.yml`)
   - Builds with Docker (production optimized)
   - Extracts `dist/` folder
   - Uploads to S3
   - Invalidates CloudFront cache

**Monitor:**
```bash
# Watch GitHub Actions
# Go to: https://github.com/YOUR_REPO/actions

# Check deployment status
aws elasticbeanstalk describe-environments \
  --environment-names flora-backend-production

# View backend logs
eb logs -e flora-backend-production
```

---

### Option B: Manual Deployment

#### Backend (Docker → DockerHub → Elastic Beanstalk)

```bash
# 1. Build Docker image
docker build \
  -t YOUR_USERNAME/flora-backend:latest \
  -f apps/backend/Dockerfile \
  .

# 2. Push to DockerHub
docker login
docker push YOUR_USERNAME/flora-backend:latest

# 3. Deploy to Elastic Beanstalk
cd apps/backend
eb init -p docker flora-backend --region ap-southeast-2
eb use flora-backend-production
eb deploy

# 4. Verify deployment
eb open    # Opens app in browser
eb logs    # View logs
```

#### Frontend (Docker Build → S3 → CloudFront)

```bash
# 1. Build with Docker (uses production env vars)
docker build \
  --build-arg VITE_API_URL="https://YOUR_BACKEND_CF_URL/api" \
  --build-arg VITE_AUTH0_DOMAIN="YOUR_DOMAIN" \
  --build-arg VITE_AUTH0_CLIENT_ID="YOUR_CLIENT_ID" \
  --build-arg VITE_AUTH0_AUDIENCE="YOUR_AUDIENCE" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="pk_test_..." \
  -t flora-frontend-prod \
  -f apps/frontend/Dockerfile \
  .

# 2. Extract dist folder from Docker image
docker create --name temp flora-frontend-prod
docker cp temp:/app/apps/frontend/dist ./dist-aws
docker rm temp

# 3. Upload to S3
aws s3 sync ./dist-aws s3://YOUR_S3_BUCKET_NAME --delete

# 4. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_CF_DISTRIBUTION_ID \
  --paths "/*"

# 5. Verify
# Visit: https://YOUR_FRONTEND_CF_URL
```

---

## Database Migrations

**Automatic (on backend deployment):**
```bash
# Backend container runs on startup (Dockerfile CMD):
pnpm start:prod
# → prisma migrate deploy  (applies migrations)
# → prisma db seed         (seeds test data if empty)
# → node dist/index.js     (starts API)
```

**Manual (if needed):**
```bash
# SSH into EB instance
eb ssh flora-backend-production

# Run migrations
cd /var/app/current
npx prisma migrate deploy
npx prisma db seed
exit
```

---

## Docker Image Architecture

### Development vs Production Dockerfiles

Flora uses **different Docker setups** for development and production:

| Aspect | Development (`docker-compose.yml`) | Production (`apps/backend/Dockerfile`) |
|--------|-----------------------------------|---------------------------------------|
| **Purpose** | Local testing with hot reload | Optimized for AWS deployment |
| **Command** | `pnpm docker:dev:bg` | Built by GitHub Actions |
| **Database** | Local PostgreSQL container | AWS RDS (remote) |
| **Environment** | `.env` files (local secrets) | AWS SSM Parameter Store |
| **Node modules** | Mounted from host (faster) | Copied into image (isolated) |
| **Startup** | `pnpm dev` (tsx watch) | `pnpm start:prod` (node dist/) |
| **Testing** | ✅ Full stack testing | ❌ Can't run alone (needs AWS) |

**Your normal workflow:**
```bash
# Local development (what you do daily)
pnpm docker:dev:bg              # Start dev stack
# → Test at http://localhost:5173
# → Backend at http://localhost:3001
docker logs flora-backend       # View logs

# Deploy to production (automated)
git push origin li-dev          # GitHub Actions builds production Docker
```

### Why Pre-Build Docker Images?

**❌ DON'T:** Let Elastic Beanstalk build from Dockerfile
- Slow (10+ min builds on t3.micro)
- Unreliable (out of memory errors)
- No caching (rebuilds every time)

**✅ DO:** Push pre-built images to DockerHub
- Fast (EB just pulls image, ~2 min)
- Reliable (built on GitHub Actions with 7GB RAM)
- Cached (only rebuild changed layers)

### Image Size Optimization

```
Without .dockerignore:  ~1.2GB
With .dockerignore:     ~400MB  (✅ 66% smaller)

Excludes:
  ├── terraform/      # Infrastructure code (not needed in container)
  ├── .git/           # Version control (649MB saved!)
  ├── node_modules/   # Reinstalled during build
  ├── docs/           # Documentation
  └── *.test.ts       # Tests
```

---

## Deployment Checklist

### Before First Deployment

- [ ] Terraform infrastructure applied
- [ ] SSM parameters uploaded (secrets)
- [ ] DockerHub repository created
- [ ] GitHub Secrets configured
- [ ] Stripe webhook configured

### Before Each Deployment

- [ ] App works locally (`pnpm docker:dev:bg` → test at http://localhost:5173)
- [ ] Tests passing (`docker exec flora-backend pnpm test`)
- [ ] No secrets in code (`git diff` before commit)
- [ ] Migrations created if schema changed (`pnpm db:migrate`)

**Optional:** Test production Docker build locally (GitHub Actions does this automatically)
```bash
# Only if you want to verify production Dockerfile works
docker build -t flora-backend-test -f apps/backend/Dockerfile .
docker run -p 3001:3001 flora-backend-test  # Should fail (no DB connection)
```

### After Deployment

- [ ] Backend health check: `https://BACKEND_CF_URL/health`
- [ ] Frontend loads: `https://FRONTEND_CF_URL`
- [ ] Database migrations applied (check logs)
- [ ] Stripe webhooks receiving events (Stripe Dashboard)

---

## Common Issues

### Backend Deployment Fails

```bash
# Check EB health
aws elasticbeanstalk describe-environment-health \
  --environment-name flora-backend-production \
  --attribute-names All

# View detailed logs
eb logs -e flora-backend-production

# Common fixes:
# 1. Wrong DockerHub image name in Dockerrun.aws.json
# 2. Missing environment variables (check SSM)
# 3. Database connection failed (check security groups)
```

### Frontend Shows 404 Errors

```bash
# Verify S3 upload
aws s3 ls s3://YOUR_S3_BUCKET_NAME/

# Verify CloudFront invalidation
aws cloudfront get-invalidation \
  --distribution-id YOUR_CF_DISTRIBUTION_ID \
  --id INVALIDATION_ID

# Common fixes:
# 1. CloudFront cache not invalidated (wait 5-10 min or invalidate)
# 2. Wrong API URL in VITE_API_URL
# 3. index.html missing (check Docker build)
```

### Docker Build Out of Memory

```bash
# Increase Docker memory (Docker Desktop → Settings → Resources)
# Or use GitHub Actions (automated, 7GB RAM)

# If local build fails:
docker system prune -a    # Free up space
docker build --no-cache   # Force clean build
```

---

## Cost Monitoring

```bash
# Check current month costs
aws ce get-cost-and-usage \
  --time-period Start=2025-12-01,End=2025-12-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# Expected costs:
# Within Free Tier:     $0/month ✅
# After Free Tier:      ~$23/month
# DockerHub:            Free (public repo)
# GitHub Actions:       Free (2000 min/month)
```

---

## Rollback Procedure

### Backend (Elastic Beanstalk)

```bash
# List recent deployments
eb appversion

# Rollback to previous version
eb deploy --version <VERSION_NUMBER>

# Verify
eb status
```

### Frontend (S3 + CloudFront)

```bash
# S3 versioning enabled (restore previous version)
aws s3api list-object-versions \
  --bucket YOUR_S3_BUCKET_NAME \
  --prefix index.html

# Restore specific version
aws s3api copy-object \
  --copy-source YOUR_S3_BUCKET_NAME/index.html?versionId=VERSION_ID \
  --bucket YOUR_S3_BUCKET_NAME \
  --key index.html

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id YOUR_CF_DISTRIBUTION_ID \
  --paths "/*"
```

---

### Key Commands
```bash
# Infrastructure
terraform plan                    # Preview changes
terraform apply                   # Deploy infrastructure

# Backend
docker build -t USER/flora-backend:latest -f apps/backend/Dockerfile .
docker push USER/flora-backend:latest
eb deploy

# Frontend
docker build -t flora-frontend-prod -f apps/frontend/Dockerfile .
aws s3 sync ./dist-aws s3://BUCKET --delete
aws cloudfront create-invalidation --distribution-id ID --paths "/*"

# Logs
eb logs                          # Backend logs
aws s3 ls s3://BUCKET           # Frontend files
```

---

**Related Documentation:**
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Remote state setup
- [SETUP.md](SETUP.md) - Infrastructure from scratch
- [AWS_COST_TIPS.md](AWS_COST_TIPS.md) - Cost optimization
- [FAQ.md](FAQ.md) - Common questions

---
