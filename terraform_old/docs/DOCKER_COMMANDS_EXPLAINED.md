# Docker Commands Explained - Local vs AWS

## 🏠 Local Development (Your Current Setup)

### Commands from `package.json`

```bash
# Start development environment
pnpm docker:dev
# ↓ Runs:
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Start production-like environment locally
pnpm docker:prod
# ↓ Runs:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

### What Happens?

```
docker-compose.yml (base config)
├── postgres: Database service
├── backend: Builds from apps/backend/Dockerfile
└── frontend: Builds from apps/frontend/Dockerfile

docker-compose.dev.yml (overrides for dev)
├── Adds volume mounts (hot reload)
└── Uses development env vars

docker-compose.prod.yml (overrides for prod-like testing)
├── Removes volume mounts
└── Uses production env vars
```

### Dockerfiles Behavior

**Backend Dockerfile (`apps/backend/Dockerfile`):**
```dockerfile
# What it does:
1. Install pnpm
2. Copy workspace files (pnpm-workspace.yaml, package.json)
3. Copy apps/ folder
4. Install dependencies
5. Generate Prisma client
6. Build TypeScript (pnpm run build)
7. CMD ["pnpm", "start:prod"]  # Runs the built code
```

**Frontend Dockerfile (`apps/frontend/Dockerfile`):**
```dockerfile
# What it does:
1. Install pnpm
2. Copy workspace files
3. Copy frontend app
4. Install dependencies
5. Build Vite (pnpm run build) → creates dist/ folder
6. Install 'serve' package
7. CMD ["serve", "-s", "dist", "-l", "5173"]  # Serves static files
```

## ☁️ AWS Deployment (Different Approach)

### Backend on Elastic Beanstalk

**Uses the SAME Dockerfile!** No changes needed.

```bash
# EB uploads your Dockerfile to AWS
# AWS builds the image on EC2 instance
# Runs the container

# The exact same Dockerfile works because:
✅ Dockerfile is self-contained
✅ All dependencies installed inside
✅ Prisma generates client during build
✅ TypeScript compiles during build
```

**EB CLI Commands:**
```bash
cd apps/backend

# Initialize (one time)
eb init -p docker -r ap-southeast-2 flora-backend

# Deploy (every update)
eb deploy
# ↓ What happens:
# 1. Zips your code + Dockerfile
# 2. Uploads to S3
# 3. EC2 pulls zip, builds Docker image
# 4. Runs container with env vars from Terraform
```

### Frontend on S3 + CloudFront

**Different approach - We DON'T run Docker in production!**

**Why?** S3 + CloudFront is cheaper and faster than running a container 24/7 just to serve static files.

**But we still use Docker for building:**

```bash
# Step 1: Build inside Docker (consistent environment)
docker build -t flora-frontend-production -f apps/frontend/Dockerfile .

# Step 2: Image now contains:
/app/apps/frontend/dist/
├── index.html
├── assets/
│   ├── index-abc123.js
│   └── index-xyz789.css
└── images/...

# Step 3: Extract the dist/ folder to host machine
docker create --name temp-container flora-frontend-production
docker cp temp-container:/app/apps/frontend/dist ./dist-aws
docker rm temp-container

# Step 4: Upload ONLY the dist/ files to S3
aws s3 sync dist-aws/ s3://my-bucket/

# Step 5: CloudFront serves these files globally (CDN)
```

## 🤔 Why Different Approaches?

| Component | Local Dev | AWS Production | Why Different? |
|-----------|-----------|----------------|----------------|
| **Backend** | Docker compose | Docker on EB | Same! Both run containers |
| **Frontend** | Docker serve | S3 static files | Static files don't need a server running 24/7 |
| **Database** | Docker postgres | RDS PostgreSQL | RDS is managed (backups, scaling, etc.) |

## 🎯 The Temp Container Pattern

### Problem:
```bash
# This doesn't work:
docker build -t my-image .
cp my-image:/path/to/file ./   # ❌ Images aren't folders!
```

### Solution:
```bash
# Create a container (like unpacking a box, but not opening it)
docker create --name temp my-image

# Copy files from container to host
docker cp temp:/path/to/file ./

# Remove the temporary container
docker rm temp
```

### Visual Analogy:

```
┌─────────────────────────────────────────────────┐
│         Docker Image (Read-only Template)       │
│  Like a factory blueprint - can't touch files   │
└─────────────────────────────────────────────────┘
                    ↓ docker create
┌─────────────────────────────────────────────────┐
│      Container Instance (Stopped)               │
│  Like a car built from blueprint - can access   │
└─────────────────────────────────────────────────┘
                    ↓ docker cp
┌─────────────────────────────────────────────────┐
│      Files on Host Machine                      │
│  ./dist-aws/ (ready to upload to S3)            │
└─────────────────────────────────────────────────┘
```

## 🔄 Complete Workflow Comparison

### Local Development Flow:

```bash
# 1. Start everything with Docker Compose
pnpm docker:dev

# What runs:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  postgres   │  │   backend   │  │  frontend   │
│  container  │←─│  container  │←─│  container  │
│  (port 5432)│  │  (port 3001)│  │  (port 5173)│
└─────────────┘  └─────────────┘  └─────────────┘
                      ↑                   ↑
                   Dockerfile         Dockerfile

# 2. Visit http://localhost:5173
# 3. Make changes → hot reload ✅
```

### AWS Production Flow:

```bash
# 1. Deploy infrastructure
terraform apply
# Creates: VPC, RDS, EB, S3, CloudFront

# 2. Deploy backend
cd apps/backend
eb deploy
# Uploads Dockerfile → AWS builds image → Runs container

# 3. Build frontend with Docker (locally)
docker build -t frontend-prod -f apps/frontend/Dockerfile .
docker create --name temp frontend-prod
docker cp temp:/app/apps/frontend/dist ./dist-aws
docker rm temp

# 4. Upload frontend to S3
aws s3 sync dist-aws/ s3://bucket/

# 5. CloudFront distributes globally

# Production:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│     RDS     │  │ EB (Docker) │  │ CloudFront  │
│ PostgreSQL  │←─│   Backend   │  │  + S3       │
│  (managed)  │  │  Container  │  │ (static CDN)│
└─────────────┘  └─────────────┘  └─────────────┘
```

## ✅ Summary

1. **Your Docker setup is correct** ✅
2. **Backend:** Same Dockerfile works locally and on AWS
3. **Frontend:** Docker builds locally, static files uploaded to S3
4. **Temp container:** Necessary to extract files from Docker image
5. **No changes needed** to your existing Dockerfiles or docker-compose files

The Terraform deployment scripts **respect** your Docker-first approach while optimizing for AWS services (RDS for database, S3/CloudFront for static frontend).
