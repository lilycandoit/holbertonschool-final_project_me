# 🌸 Flora - Terraform Infrastructure

> **AWS Infrastructure as Code for Flora Marketplace**

This directory contains Terraform configurations for deploying Flora's infrastructure on AWS using best practices and cost-optimized resources.

---

## 📁 Structure

```
project-root/
├── terraform-backend/        # 📦 Backend Infrastructure (Bootstrap)
│   ├── main.tf               # Creates S3 + DynamoDB for remote state
│   ├── provider.tf           # NO backend (uses local state)
│   └── variables.tf          # Project settings
│
└── terraform/                # 🏗️ Main Infrastructure (Daily Use)
    ├── environments/
    │   ├── dev/              # Development environment (cost-optimized)
    │   └── prod/             # Production environment (Free Tier optimized)
    ├── modules/              # Reusable infrastructure modules
    │   ├── elastic_beanstalk/   # Backend API hosting
    │   ├── s3_cloudfront/       # Frontend static site hosting
    │   ├── iam/                 # IAM roles and policies
    │   ├── rds/                 # PostgreSQL database
    │   └── networking/          # VPC, subnets, security groups
    └── docs/                 # Documentation
        ├── SETUP.md                  # Fresh setup guide
        ├── IMPORT.md                 # Import existing infrastructure
        ├── AWS_COST_TIPS.md          # Cost optimization tips
        └── BACKEND_ARCHITECTURE.md   # Backend bootstrap pattern explained
```

**Note:** `terraform-backend/` is a **one-time bootstrap** that creates the S3 bucket and DynamoDB table for storing Terraform state remotely. See [BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) for details.

---

## 🚀 Quick Start

### I want to... → Read this guide

| Goal | Documentation |
|------|---------------|
| **Deploy code changes to AWS** | [**DEPLOYMENT.md**](docs/DEPLOYMENT.md) ⭐ (Dockerized app workflow) |
| **Create AWS infrastructure** (first time) | [**SETUP.md**](docs/SETUP.md) (Run Terraform to create EC2, RDS, S3, etc.) |
| **Migrate to 100% free hosting** (Low on AWS credits) | [**MIGRATION_TO_FREE_TIER.md**](docs/MIGRATION_TO_FREE_TIER.md) 🆓 (Vercel + Render + Supabase) |
| **Stop all AWS charges** (Free Tier expired) | [**SHUTDOWN.md**](docs/SHUTDOWN.md) 🛑 (Complete teardown guide) |
| Understand terraform-backend/ folder | [BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) (Remote state explained) |
| Modify existing AWS resources | [IMPORT.md](docs/IMPORT.md) (Import & update infrastructure) |
| Avoid unexpected AWS charges | [AWS_COST_TIPS.md](docs/AWS_COST_TIPS.md) ⚠️ (Free Tier tips) |
| Answer common questions | [FAQ.md](docs/FAQ.md) (Dev/prod, Console vs CLI) |

### Complete Workflow (New Team Member)

```bash
# ──────────────────────────────────────────────────────
# STEP 1: Create AWS Infrastructure (One-Time)
# ──────────────────────────────────────────────────────
# Follow: SETUP.md
cd terraform/environments/prod
terraform init
terraform apply                    # Creates EC2, RDS, S3, CloudFront (~15 min)

# ──────────────────────────────────────────────────────
# STEP 2: Deploy Dockerized App (Daily Workflow)
# ──────────────────────────────────────────────────────
# Follow: DEPLOYMENT.md
# One-time: Configure GitHub Secrets
# Then just:
git push origin li-dev             # Auto-deploys backend + frontend

# ──────────────────────────────────────────────────────
# STEP 3: Modify Infrastructure (As Needed)
# ──────────────────────────────────────────────────────
# Follow: IMPORT.md (if importing existing resources)
# Or just edit terraform/*.tf files and:
terraform plan
terraform apply
```

**If infrastructure already exists (current team):**
- ✅ Skip STEP 1 (infrastructure running)
- ✅ Use STEP 2 for daily deployments
- ✅ Use STEP 3 if changing AWS resources (instance types, RDS settings, etc.)

---

## 🏗️ Current Infrastructure

### Production Environment
- **Frontend**: S3 + CloudFront (Static hosting)
- **Backend**: Elastic Beanstalk (Single instance, t3.micro)
- **Database**: RDS PostgreSQL (Free Tier, t3.micro)
- **Storage**: S3 buckets for assets
- **Networking**: Default VPC (Free Tier)

### Key Changes from Original Setup
✅ **Removed Load Balancer** → Single instance (saves ~$16/month)
✅ **Modular structure** → Easier to maintain and reuse
✅ **Free Tier optimized** → t3.micro instances, gp3 storage
✅ **Separate environments** → Dev and Prod isolated

---

## 📋 Common Commands

```bash
# Initialize Terraform
cd environments/prod
terraform init

# Preview changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Destroy infrastructure (use with caution!)
terraform destroy

# Import existing resource
terraform import <resource_type>.<name> <aws_resource_id>
```

---

## 🔐 Secrets Management

Secrets are stored in **AWS Systems Manager Parameter Store**, NOT in Terraform files.

**Setup secrets before deploying:**
```bash
cd environments/prod
export AUTH0_CLIENT_SECRET="your-secret"
export STRIPE_SECRET_KEY="sk_test_..."
export STRIPE_WEBHOOK_SECRET="whsec_..."
export GEMINI_API_KEY="AIza..."
./setup-ssm-parameters.sh
```

---

## 📚 Documentation

- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** ⭐ - Deploy Dockerized Flora app to AWS (automated + manual workflows)
- **[SETUP.md](docs/SETUP.md)** - Complete guide for setting up infrastructure from scratch
- **[SHUTDOWN.md](docs/SHUTDOWN.md)** 🛑 - Stop all AWS charges (complete teardown after Free Tier)
- **[BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md)** - Understanding the two-folder bootstrap pattern
- **[IMPORT.md](docs/IMPORT.md)** - How to import and modify existing AWS resources
- **[AWS_COST_TIPS.md](docs/AWS_COST_TIPS.md)** ⚠️ - Critical tips to avoid AWS charges
- **[COST_AUDIT.md](docs/COST_AUDIT.md)** - Current infrastructure compliance audit
- **[IMPROVEMENTS_SUMMARY.md](docs/IMPROVEMENTS_SUMMARY.md)** - All cost optimizations applied
- **[SNAPSHOT_SAFETY.md](docs/SNAPSHOT_SAFETY.md)** - RDS snapshot protection explained
- **[FAQ.md](docs/FAQ.md)** - Common questions (dev/prod, Console vs CLI)

---

## ⚠️ Important Notes

1. **Never commit `terraform.tfvars`** - It contains secrets (already in .gitignore)
2. **Always run `terraform plan` first** - Preview changes before applying
3. **Use Free Tier resources** - See AWS_COST_TIPS.md for recommendations
4. **Destroy unused resources** - Stop charges when not needed
5. **Monitor AWS Billing** - Set up billing alerts in AWS Console

---

## 🆘 Troubleshooting

### State file conflicts
If you see "state lock" errors:
```bash
# Force unlock (use carefully!)
terraform force-unlock <lock_id>
```

### Import errors
If resources already exist in AWS:
```bash
# Import before modifying
terraform import module.s3_cloudfront.aws_s3_bucket.frontend <bucket-name>
```

### Cost alerts
If you see unexpected charges:
1. Check AWS Cost Explorer
2. Verify instance types (must be t3.micro for Free Tier)
3. Check for Load Balancers (expensive!)
4. See docs/AWS_COST_TIPS.md

---
