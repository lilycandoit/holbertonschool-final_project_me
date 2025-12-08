# Flora AWS Deployment - Docker Workflow

> **📌 Note:** This document explains the Docker fundamentals and manual deployment process.
> **For automated CI/CD deployment** (recommended for daily development), see [`QUICK_START.md`](./QUICK_START.md).

## 🐳 Fully Dockerized Deployment Strategy

Since Flora is **fully Dockerized**, we maintain consistency across local dev, testing, and AWS production.

**Deployment Evolution:**
- **Manual (this doc):** Docker build → manual push → manual deploy
- **CI/CD (QUICK_START.md):** Git push → GitHub Actions → automatic deployment

## 🏗️ Architecture Recap

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                         │
│  docker-compose.yml runs:                                   │
│    - Frontend container (Vite dev server)                   │
│    - Backend container (Express API)                        │
│    - PostgreSQL container                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    AWS PRODUCTION                            │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────┐│
│  │   CloudFront     │  │ Elastic         │  │  RDS       ││
│  │   + S3           │  │ Beanstalk       │  │ PostgreSQL ││
│  │  (Frontend       │  │ (Backend Docker)│  │ (Managed)  ││
│  │   Static Files)  │  │                 │  │            ││
│  └──────────────────┘  └─────────────────┘  └────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 📦 Deployment Workflow

### 1️⃣ Backend Deployment (Elastic Beanstalk with Docker)

Elastic Beanstalk **runs your Docker container** directly.

#### Option A: Deploy from Dockerfile (Recommended)

```bash
cd apps/backend

# Create Dockerrun.aws.json
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
  ],
  "Volumes": [],
  "Logging": "/var/log/flora"
}
EOF

# Initialize EB CLI
eb init -p docker -r ap-southeast-2 flora-backend --interactive=false

# Set environment to the one Terraform created
eb use flora-backend-production

# Deploy (EB builds Docker image from your Dockerfile)
eb deploy

# ✅ EB will:
# 1. Upload your code + Dockerfile
# 2. Build Docker image on EC2 instance
# 3. Run container with environment variables from Terraform
# 4. Map container port 3001 → host port 80
```

#### Option B: Deploy from Docker Hub/ECR (Recommended for CI/CD)

```bash
cd apps/backend

# Build Docker image locally
docker build -t your-dockerhub-username/flora-backend:latest -f Dockerfile ../../

# Push to Docker Hub
docker login
docker push your-dockerhub-username/flora-backend:latest

# Create Dockerrun.aws.json pointing to your image
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

# Create .ebignore to prevent EB from building locally
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

# Deploy
eb deploy
```

**Why .ebignore?**
- Prevents EB from seeing the Dockerfile
- Forces EB to pull the pre-built image from DockerHub
- Avoids build failures from monorepo context issues

#### Running Migrations on EB

```bash
# SSH into EB instance
eb ssh

# Navigate to app directory
cd /var/app/current

# Run migrations
docker exec $(docker ps -q) npx prisma migrate deploy
docker exec $(docker ps -q) npx prisma db seed

# Exit
exit
```

**Or add to `.ebextensions/01_migrations.config`:**

```yaml
container_commands:
  01_migrate:
    command: "docker exec $(docker ps -q) npx prisma migrate deploy"
    leader_only: true
  02_seed:
    command: "docker exec $(docker ps -q) npx prisma db seed"
    leader_only: true
```

### 2️⃣ Frontend Deployment (S3 + CloudFront)

**Important:** Frontend static files don't need Docker to **run** in production (they're just HTML/CSS/JS), but we use Docker to **build** them for consistency.

#### Build with Docker (Consistent with project approach)

```bash
cd apps/frontend

# Get backend URL from Terraform
BACKEND_URL=$(cd ../../terraform && terraform output -raw backend_api_url)

# Build production bundle using Docker
docker build \
  --build-arg VITE_API_URL="${BACKEND_URL}/api" \
  --build-arg VITE_AUTH0_DOMAIN="dev-ijvur34mojpovh8e.us.auth0.com" \
  --build-arg VITE_AUTH0_CLIENT_ID="tegmEuc40IvXfYFDLIRnJmbsa1izkTVL" \
  --build-arg VITE_AUTH0_AUDIENCE="https://flora-api.com" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="${STRIPE_PK}" \
  -t flora-frontend-prod \
  -f Dockerfile \
  ../../

# Extract built files from Docker image
# Create a temporary container
docker create --name temp-flora-frontend flora-frontend-prod

# Copy dist folder from container
docker cp temp-flora-frontend:/app/apps/frontend/dist ./dist-production

# Clean up container
docker rm temp-flora-frontend

# Get S3 bucket from Terraform
S3_BUCKET=$(cd ../../terraform && terraform output -raw frontend_s3_bucket)

# Upload to S3
aws s3 sync dist-production/ s3://${S3_BUCKET}/ --delete

# Invalidate CloudFront cache
CLOUDFRONT_ID=$(cd ../../terraform && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id ${CLOUDFRONT_ID} \
  --paths "/*"

# Cleanup
rm -rf dist-production
```

## 🎯 Why This Approach?

### Backend: Docker Container on EB

✅ **Pros:**
- Consistent environment (local = production)
- All dependencies bundled
- Easy rollbacks
- Scales horizontally

❌ **Cons:**
- Slightly slower cold starts
- Need to rebuild image for changes

### Frontend: Static Files on S3

✅ **Pros:**
- Cheapest hosting (pennies per month)
- CDN built-in (CloudFront)
- Super fast (cached globally)
- No server management

**Why not Docker for serving frontend in production?**
- S3 + CloudFront is specifically designed for static sites
- Much cheaper than running a container 24/7
- Better performance (global CDN)
- **But we still use Docker for building** to maintain consistency!

## 🔄 Complete Deployment Script

Create `terraform/scripts/deploy-all.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Flora Full Deployment to AWS"
echo "================================"

# Navigate to terraform directory
cd "$(dirname "$0")/.."

# Get infrastructure outputs
echo "📋 Getting infrastructure details..."
BACKEND_URL=$(terraform output -raw backend_api_url)
S3_BUCKET=$(terraform output -raw frontend_s3_bucket)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
EB_ENV=$(terraform output -raw backend_environment_name)

echo "✅ Backend URL: $BACKEND_URL"
echo "✅ S3 Bucket: $S3_BUCKET"
echo "✅ CloudFront ID: $CLOUDFRONT_ID"
echo ""

# Deploy Backend
echo "🐳 Deploying Backend to Elastic Beanstalk..."
cd ../apps/backend

# Initialize EB if needed
if [ ! -d ".elasticbeanstalk" ]; then
  eb init -p docker -r ap-southeast-2 flora-backend --interactive=false
  eb use $EB_ENV
fi

eb deploy

echo "✅ Backend deployed!"
echo ""

# Build and Deploy Frontend
echo "🏗️  Building Frontend with Docker..."
cd ../frontend

# Read Stripe key from .env or environment
if [ -f "../../.env.production" ]; then
  source ../../.env.production
fi

# Build with Docker
docker build \
  --build-arg VITE_API_URL="${BACKEND_URL}/api" \
  --build-arg VITE_AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN:-dev-ijvur34mojpovh8e.us.auth0.com}" \
  --build-arg VITE_AUTH0_CLIENT_ID="${VITE_AUTH0_CLIENT_ID:-tegmEuc40IvXfYFDLIRnJmbsa1izkTVL}" \
  --build-arg VITE_AUTH0_AUDIENCE="${VITE_AUTH0_AUDIENCE:-https://flora-api.com}" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="${VITE_STRIPE_PUBLISHABLE_KEY}" \
  -t flora-frontend-prod \
  -f Dockerfile \
  ../../

# Extract dist
echo "📦 Extracting build artifacts..."
docker create --name temp-flora-frontend flora-frontend-prod
docker cp temp-flora-frontend:/app/apps/frontend/dist ./dist-aws
docker rm temp-flora-frontend

# Upload to S3
echo "☁️  Uploading to S3..."
aws s3 sync dist-aws/ s3://${S3_BUCKET}/ --delete

# Invalidate CloudFront
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id ${CLOUDFRONT_ID} \
  --paths "/*" \
  > /dev/null

# Cleanup
rm -rf dist-aws

echo ""
echo "🎉 Deployment Complete!"
echo "================================"
echo "🌐 Frontend: https://$(cd ../../terraform && terraform output -raw cloudfront_domain)"
echo "🔧 Backend:  $BACKEND_URL"
echo ""
echo "⏱️  Note: CloudFront cache invalidation takes 1-3 minutes"
```

## 🛠️ Helper Scripts

### Backend Only

```bash
#!/bin/bash
cd apps/backend
eb deploy
```

### Frontend Only

```bash
#!/bin/bash
cd apps/frontend

# Build with Docker
docker build \
  --build-arg VITE_API_URL="$(cd ../../terraform && terraform output -raw backend_api_url)/api" \
  -t flora-frontend-prod \
  -f Dockerfile \
  ../../

# Extract and upload
docker create --name temp-frontend flora-frontend-prod
docker cp temp-frontend:/app/apps/frontend/dist ./dist-aws
docker rm temp-frontend

aws s3 sync dist-aws/ s3://$(cd ../../terraform && terraform output -raw frontend_s3_bucket)/ --delete

aws cloudfront create-invalidation \
  --distribution-id $(cd ../../terraform && terraform output -raw cloudfront_distribution_id) \
  --paths "/*"

rm -rf dist-aws
```

## 🔐 Environment Variables

### Backend (Set by Terraform in EB)

These are automatically set via `modules/elastic_beanstalk/main.tf`:

```hcl
env_vars = {
  DATABASE_URL            = module.rds.connection_string
  AUTH0_DOMAIN            = var.auth0_domain
  AUTH0_CLIENT_ID         = var.auth0_client_id
  AUTH0_CLIENT_SECRET     = var.auth0_client_secret
  AUTH0_AUDIENCE          = var.auth0_audience
  STRIPE_SECRET_KEY       = var.stripe_secret_key
  NODE_ENV                = "production"
}
```

Your Docker container reads them via `process.env.DATABASE_URL`, etc.

### Frontend (Build-time only)

Frontend env vars are **baked into the build** (not runtime):

```bash
VITE_API_URL              # Points to backend
VITE_AUTH0_DOMAIN         # Auth0 config
VITE_AUTH0_CLIENT_ID      # Public client ID
VITE_AUTH0_AUDIENCE       # API audience
VITE_STRIPE_PUBLISHABLE_KEY  # Stripe public key
```

## 📝 Summary

**The Key Difference:**

| Component | Docker Used For | Runs In Production As |
|-----------|----------------|----------------------|
| **Backend** | Build + Run | Docker container on EC2 (via EB) |
| **Frontend** | Build only | Static files on S3 + CloudFront |
| **Database** | Not used | Managed RDS PostgreSQL |

**Why this is the best approach:**
1. ✅ Consistent builds (Docker everywhere)
2. ✅ Backend gets Docker's isolation benefits
3. ✅ Frontend gets CDN's performance + cost benefits
4. ✅ Database gets AWS's reliability + backups
5. ✅ Free tier compatible!
