# 🔄 Terraform Backend Architecture

> **Understanding the two-folder bootstrap pattern and remote state management**

---

## The Git Analogy

Think of Terraform backend infrastructure like **Git version control**:

| Component | Git Equivalent | Purpose |
|-----------|----------------|---------|
| **terraform-backend/** | GitHub/GitLab server | Stores history, enables collaboration |
| **terraform/** | Your local code | What you actually work on |
| **S3 state file** | `.git/` directory | Complete version history |
| **DynamoDB locks** | Git merge conflict prevention | Prevents concurrent changes |
| `terraform apply` | `git commit` | Records a change |
| `terraform plan` | `git diff` | Preview changes |

**Just like you need GitHub before you can `git push`, you need the backend infrastructure before Terraform can store state remotely.**

---

## Two-Folder Structure

```
project-root/
├── terraform-backend/          # 📦 Backend Infrastructure (Bootstrap)
│   ├── main.tf                 # Creates S3 bucket + DynamoDB table
│   ├── provider.tf             # NO backend configuration (uses local state)
│   └── variables.tf            # Project name, region
│
└── terraform/                  # 🏗️ Main Infrastructure (Daily Use)
    ├── environments/
    │   └── prod/
    │       └── main.tf         # USES backend (S3 + DynamoDB)
    └── modules/
```

---

## The Bootstrap Paradox

### ❌ Why You Can't Merge Into One Folder

```hcl
# ⚠️ THIS DOESN'T WORK - Circular Dependency!

terraform {
  backend "s3" {
    bucket = "my-terraform-state"  # ❌ Bucket doesn't exist yet!
  }
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "my-terraform-state"    # ❌ Can't create with backend enabled!
}
```

**What happens:**
```bash
$ terraform init
Error: Backend bucket does not exist
# Can't initialize because backend is missing
# Can't create backend because can't initialize!
```

### ✅ Solution: Two-Step Bootstrap

**Step 1: Create Backend (Local State)**
```bash
cd terraform-backend/
terraform init              # Uses LOCAL state (no backend configured)
terraform apply             # Creates S3 + DynamoDB
# ✅ Backend infrastructure exists now
```

**Step 2: Use Backend (Remote State)**
```bash
cd terraform/environments/prod/
terraform init              # Uses REMOTE state (S3 + DynamoDB)
terraform apply             # State stored in S3, locked via DynamoDB
# ✅ Team collaboration enabled
```

---

## terraform-backend/ - The "GitHub Server"

### What It Does

Creates two AWS resources that **enable remote state management**:

1. **S3 Bucket** (`flora-terraform-state-570006208612`)
   - Stores Terraform state files
   - Versioning enabled (state history)
   - Encrypted at rest (AES256)
   - `prevent_destroy = true` (can't accidentally delete)

2. **DynamoDB Table** (`flora-terraform-locks`)
   - State locking (prevents concurrent `terraform apply`)
   - `PAY_PER_REQUEST` billing (only pay when locking)
   - Hash key: `LockID` (unique per state file)

### Where State is Stored

```
terraform-backend/
└── terraform.tfstate       # ✅ LOCAL state (small, stable, low risk)
```

**Why local state is OK here:**
- Only 2 resources (S3 + DynamoDB)
- Created once, never modified
- `prevent_destroy = true` protects against accidents
- Low collaboration risk (one-time setup)

### When to Use

```bash
# ✅ Use for NEW PROJECTS (one-time setup)
cd terraform-backend/
terraform init
terraform apply

# ❌ DON'T use if backend already exists
# (Your scenario - backend was already created)

# ❌ NEVER run terraform destroy here
# (Would delete all your state files!)
```

---

## terraform/ - The "Working Code"

### What It Does

Creates and manages your **actual AWS infrastructure**:
- Elastic Beanstalk (backend API)
- RDS PostgreSQL (database)
- S3 + CloudFront (frontend hosting)
- IAM roles, networking, etc.

### Where State is Stored

```hcl
# terraform/environments/prod/main.tf
terraform {
  backend "s3" {
    bucket         = "flora-terraform-state-570006208612"  # Created by terraform-backend/
    key            = "production/terraform.tfstate"        # Path within bucket
    region         = "ap-southeast-2"
    dynamodb_table = "flora-terraform-locks"               # Created by terraform-backend/
  }
}
```

**State location:**
```
S3://flora-terraform-state-570006208612/
└── production/
    └── terraform.tfstate    # ✅ REMOTE state (shared, locked, versioned)
```

### Benefits of Remote State

| Feature | Local State | Remote State (S3) |
|---------|-------------|-------------------|
| **Team collaboration** | ❌ No (one computer) | ✅ Yes (shared in S3) |
| **State locking** | ❌ No (conflicts possible) | ✅ Yes (DynamoDB locks) |
| **Version history** | ❌ No (single file) | ✅ Yes (S3 versioning) |
| **Disaster recovery** | ❌ No (lost if computer dies) | ✅ Yes (durable in S3) |
| **Encryption** | ❌ No | ✅ Yes (AES256) |

---

## Real-World Workflows

### Scenario 1: New Project From Scratch

```bash
# One-time setup (by team lead)
cd terraform-backend/
terraform init              # Local state
terraform apply             # Creates S3 + DynamoDB
# ✅ Backend ready

# Daily work (all team members)
cd terraform/environments/prod/
terraform init              # Remote state
terraform apply             # Infrastructure changes
# ✅ State in S3, team can collaborate
```

---

### Scenario 2: Joining Existing Project (Your Case)

```bash
# Backend already exists (skip terraform-backend/)
cd terraform/environments/prod/
terraform init              # Downloads state from S3 ✅
terraform plan              # Sees same state as team ✅
terraform apply             # Contributes changes ✅
```

---

### Scenario 3: Multiple Environments

```hcl
# Prod environment
backend "s3" {
  bucket = "flora-terraform-state-570006208612"
  key    = "production/terraform.tfstate"      # 📁 Separate state
}

# Dev environment
backend "s3" {
  bucket = "flora-terraform-state-570006208612"
  key    = "development/terraform.tfstate"     # 📁 Separate state
}
```

**Same bucket, different state files** - Environments isolated! ✅

---

## How State Locking Works

### Without Locking (Disaster Scenario)

```
Developer A:                    Developer B:
terraform apply (starts)        terraform apply (starts)
  → Reads state from S3           → Reads SAME state from S3
  → Creates EC2 instance          → Creates RDS instance
  → Writes state to S3 ✅         → Writes state to S3 ✅
                                    ⚠️ OVERWRITES Developer A's changes!
```

**Result:** State file corrupted, resources lost! 💥

---

### With Locking (Safe Scenario)

```
Developer A:                    Developer B:
terraform apply                 terraform apply
  → Acquires lock ✅              → Tries to acquire lock
  → Reads state                   → ❌ ERROR: State locked by Developer A
  → Creates EC2                   → Waits...
  → Writes state
  → Releases lock ✅              → Acquires lock ✅
                                  → Reads updated state
                                  → Creates RDS
                                  → Writes state
                                  → Releases lock ✅
```

**Result:** Sequential changes, state consistent! ✅

---

## Flora's Backend Configuration

### Current Setup (Active in Production)

**Backend Resources (Created Dec 8, 2025):**
```bash
S3 Bucket: flora-terraform-state-570006208612
  ├── Region: ap-southeast-2
  ├── Versioning: Enabled ✅
  ├── Encryption: AES256 ✅
  ├── Lifecycle: prevent_destroy = true ✅
  └── Size: ~50KB (prod + dev states)

DynamoDB Table: flora-terraform-locks
  ├── Region: ap-southeast-2
  ├── Billing: PAY_PER_REQUEST (free for low usage)
  ├── Hash Key: LockID
  └── Cost: ~$0.03/month (negligible)
```

**State Files:**
```
S3://flora-terraform-state-570006208612/
├── production/terraform.tfstate       # Prod infrastructure
└── development/terraform.tfstate      # Dev infrastructure (if used)
```

---

## Cost Analysis

### Backend Infrastructure Costs

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| **S3 Bucket** | Standard storage, ~50KB | $0.00 (Free Tier) |
| **S3 Versioning** | Keep 10 versions (~500KB) | $0.00 (Free Tier) |
| **DynamoDB Table** | PAY_PER_REQUEST | ~$0.03 |
| **TOTAL** | | **~$0.03/month** ✅ |

**Why so cheap:**
- State files are tiny (50KB vs GB of data)
- DynamoDB only charged during `terraform apply` (seconds/day)
- S3 Free Tier covers first 5GB (state uses 0.001GB)

---

## Security Best Practices

### ✅ What Flora Does Right

1. **Encryption at rest** (S3 AES256)
2. **Versioning enabled** (recover from mistakes)
3. **Prevent destroy lifecycle** (can't accidentally delete)
4. **IAM-based access** (only authorized users)
5. **Separate state per environment** (prod/dev isolated)

### 🔒 Additional Hardening (Optional)

```hcl
# Add to terraform-backend/main.tf for extra security

# 1. Enable MFA delete
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  mfa_delete = "Enabled"  # Requires MFA to delete versions
}

# 2. Restrict bucket access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 3. Enable access logging
resource "aws_s3_bucket_logging" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "state-access-logs/"
}
```

---

## Disaster Recovery

### Scenario: Accidental `terraform destroy` on Backend

**⚠️ If someone runs `terraform destroy` in `terraform-backend/`:**

```bash
# ❌ This would delete S3 + DynamoDB!
cd terraform-backend/
terraform destroy  # DON'T DO THIS!
```

**Protection:**
```hcl
# terraform-backend/main.tf
lifecycle {
  prevent_destroy = true  # ✅ Terraform will refuse
}
```

**If protection is removed and backend is destroyed:**

1. **State files are LOST** (unless S3 versioning saves them)
2. **Team collaboration breaks** (no shared state)
3. **Recovery steps:**
   ```bash
   # Recreate backend
   cd terraform-backend/
   terraform apply  # Creates new S3 + DynamoDB

   # Restore state from S3 version history (if enabled)
   aws s3api list-object-versions \
     --bucket flora-terraform-state-570006208612 \
     --prefix production/terraform.tfstate

   # Download previous version
   aws s3api get-object \
     --bucket flora-terraform-state-570006208612 \
     --key production/terraform.tfstate \
     --version-id <VERSION_ID> \
     terraform.tfstate.backup
   ```

**Best Practice:** NEVER run `terraform destroy` on backend infrastructure! 🚫

---

## Alternative Approaches

### Option A: Terraform Cloud (Free Tier)

**Pros:**
- No need for `terraform-backend/` folder
- Free remote state (up to 5 users)
- Built-in locking, versioning, UI

**Cons:**
- State stored with 3rd party (not in your AWS)
- Internet dependency (can't work offline)
- Vendor lock-in

**Setup:**
```hcl
# terraform/environments/prod/main.tf
terraform {
  cloud {
    organization = "flora-marketplace"
    workspaces {
      name = "production"
    }
  }
}
```

---

### Option B: Manual Backend Creation (AWS Console)

**Pros:**
- Skip `terraform-backend/` folder
- One-time manual setup

**Cons:**
- Not Infrastructure as Code ❌
- Manual steps error-prone ❌
- No version control of backend config ❌

**Setup:**
```bash
# Manual AWS Console steps:
1. Create S3 bucket: flora-terraform-state
2. Enable versioning
3. Enable encryption (AES256)
4. Create DynamoDB table: flora-terraform-locks
   - Hash key: LockID (String)
   - Billing: PAY_PER_REQUEST

# Then use in Terraform
cd terraform/environments/prod/
terraform init  # Uses manually created backend
```

---

### Option C: Keep Backend Local (Small Teams)

**Pros:**
- Simplest (no backend setup)
- No AWS costs for S3/DynamoDB

**Cons:**
- No team collaboration ❌
- No state locking ❌
- State lost if computer dies ❌

**Not recommended** unless:
- Solo developer
- Temporary infrastructure (< 1 week)
- Learning/testing only

---

## FAQ

### Q: Can I use one backend for multiple projects?

**A:** Yes! Use different keys:
```hcl
# Project 1
backend "s3" {
  bucket = "my-terraform-state"
  key    = "project1/terraform.tfstate"
}

# Project 2
backend "s3" {
  bucket = "my-terraform-state"
  key    = "project2/terraform.tfstate"
}
```

---

### Q: What if DynamoDB locking fails?

**A:** Force unlock (use carefully):
```bash
terraform force-unlock <LOCK_ID>
```

**Only use if:**
- Previous `terraform apply` crashed
- Lock is stuck (confirm no one else is running Terraform)
- You understand the risks

---

### Q: Can I migrate from local state to S3 backend?

**A:** Yes! Terraform handles migration:
```bash
# 1. Add backend configuration
# 2. Run terraform init
terraform init

# Terraform asks:
# "Do you want to copy existing state to the new backend?"
# Answer: yes

# ✅ State migrated to S3, local state becomes backup
```

---

### Q: How do I see what's in the state file?

```bash
# Via Terraform
terraform show

# Via AWS CLI
cd ..
# ⚠️ State files contain SENSITIVE DATA (passwords, keys)
# Never commit state files to Git!
```

---

## Summary

### Key Takeaways

1. **terraform-backend/** = "GitHub server" (stores state, enables collaboration)
2. **terraform/** = "Your code" (infrastructure you work on daily)
3. **Two folders needed** due to bootstrap paradox (can't use backend to create backend)
4. **Remote state benefits:**
   - ✅ Team collaboration (shared state)
   - ✅ State locking (prevents conflicts)
   - ✅ Version history (recover from mistakes)
   - ✅ Disaster recovery (durable in S3)
5. **Cost:** ~$0.03/month (negligible)
6. **One-time setup:** Run `terraform-backend/` once, then forget it

### Decision Matrix: When to Use What

| Scenario | Use terraform-backend/ | Use Terraform Cloud | Use Local State |
|----------|------------------------|---------------------|-----------------|
| **New solo project** | ✅ Recommended | ✅ Also good | ⚠️ OK for learning |
| **Team project** | ✅ REQUIRED | ✅ Also good | ❌ No collaboration |
| **Existing backend** | ❌ Skip (already exists) | - | - |
| **Production** | ✅ REQUIRED | ✅ Also good | ❌ Too risky |
| **Learning Terraform** | ⚠️ Optional | ⚠️ Optional | ✅ Simplest |

---

**Related Documentation:**
- [SETUP.md](SETUP.md) - Full infrastructure setup guide
- [IMPORT.md](IMPORT.md) - Import existing resources
- [AWS_COST_TIPS.md](AWS_COST_TIPS.md) - Cost optimization

---

**Flora Team:** Anthony, Bevan, Xiaoling, and Lily | **Holberton Final Project 2025**
