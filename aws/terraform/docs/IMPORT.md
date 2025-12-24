# 🔄 Import Existing Infrastructure Guide

> **How to manage AWS resources created outside Terraform or from another repository**

This guide covers the **exact scenario you faced**: importing infrastructure from an upstream repo and making changes (like removing Load Balancer).

---

## When Do You Need This Guide?

✅ You cloned/forked a repo with existing AWS resources
✅ Resources were created manually in AWS Console
✅ You want to modify existing infrastructure (e.g., remove Load Balancer)
✅ Terraform says "already exists" when you try to apply
✅ You're switching from someone else's Terraform state

---

## Understanding the Problem

**The Issue:**
- AWS has resources running (created by upstream repo or manually)
- Your local Terraform doesn't know about them (no state file)
- Running `terraform apply` tries to create duplicates → ERROR

**The Solution:**
1. **Import** existing resources into Terraform state
2. **Modify** Terraform config to match desired state
3. **Apply** changes to update infrastructure

---

## Scenario 1: Import Everything (Fresh Fork)

### Step 1: Identify What Exists in AWS

```bash
# List all Elastic Beanstalk environments
aws elasticbeanstalk describe-environments \
  --query "Environments[?ApplicationName=='flora-backend'].EnvironmentName"

# List S3 buckets
aws s3 ls | grep flora

# List RDS databases
aws rds describe-db-instances \
  --query "DBInstances[?DBName=='flora_db'].DBInstanceIdentifier"

# List CloudFront distributions
aws cloudfront list-distributions \
  --query "DistributionList.Items[*].Id"
```

### Step 2: Use the Import Script

We've created a helper script for you:

```bash
cd terraform/environments/prod

# Make executable
chmod +x import-resources.sh

# Run import script
./import-resources.sh
```

**What the script does:**
1. Lists all Flora resources in AWS
2. Generates `terraform import` commands
3. Imports each resource into Terraform state
4. Verifies import success

**Example output:**
```
🔍 Discovering existing AWS resources...

Found Elastic Beanstalk: flora-backend-prod
Found S3 Bucket: flora-frontend-bucket
Found RDS Instance: flora-db
Found CloudFront: E1234567890ABC

📥 Importing resources into Terraform state...

✅ Imported: aws_elastic_beanstalk_environment.backend
✅ Imported: aws_s3_bucket.frontend
✅ Imported: aws_db_instance.main
✅ Imported: aws_cloudfront_distribution.frontend

🎉 Import complete! Run 'terraform plan' to verify.
```

### Step 3: Verify Import

```bash
# Check state file has resources
terraform state list

# Should show:
# module.elastic_beanstalk.aws_elastic_beanstalk_environment.backend
# module.s3_cloudfront.aws_s3_bucket.frontend
# module.rds.aws_db_instance.main
# ...
```

### Step 4: Align Configuration

```bash
# Compare current AWS state vs your Terraform config
terraform plan

# Expected output:
# No changes. Infrastructure is up-to-date.
```

**If you see changes**, your Terraform config doesn't match AWS:

```
~ aws_instance.backend
    instance_type: "t2.small" => "t3.micro"
```

**Fix by updating your `.tf` files** to match current AWS state:
```hcl
instance_type = "t2.small"  # Match what's in AWS
```

Then run `terraform plan` again until you see "No changes."

---

## Scenario 2: Remove Load Balancer (Your Exact Case)

### Problem
- Upstream repo used Application Load Balancer
- Load Balancer costs ~$16/month (NOT Free Tier)
- You want single instance instead (Free Tier eligible)

### Step 1: Import Current State (If Not Done)

```bash
cd terraform/environments/prod
./import-resources.sh
```

### Step 2: Modify Terraform Config

**Before (with Load Balancer):**
```hcl
# modules/elastic_beanstalk/main.tf
resource "aws_elastic_beanstalk_environment" "backend" {
  application = aws_elastic_beanstalk_application.app.name

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "LoadBalanced"  # ❌ Expensive!
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = "t3.micro"
  }

  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MinSize"
    value     = "1"
  }

  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MaxSize"
    value     = "4"
  }
}
```

**After (Single Instance):**
```hcl
resource "aws_elastic_beanstalk_environment" "backend" {
  application = aws_elastic_beanstalk_application.app.name

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance"  # ✅ Free Tier!
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = "t3.micro"
  }

  # Remove MinSize and MaxSize (not needed for single instance)
}
```

### Step 3: Preview Changes

```bash
terraform plan

# Expected output:
# ~ aws_elastic_beanstalk_environment.backend
#     setting.*.value: "LoadBalanced" => "SingleInstance"
#     setting.*.value: "4" => (removed)  # MaxSize
#
# - aws_lb.main (will be destroyed)
# - aws_lb_listener.main (will be destroyed)
# - aws_lb_target_group.main (will be destroyed)
```

**⚠️ IMPORTANT:** This will cause downtime! The environment will be rebuilt.

### Step 4: Apply Changes

```bash
# Save plan
terraform plan -out=tfplan

# Apply (this takes 10-15 minutes)
terraform apply tfplan
```

**What happens:**
1. Load Balancer deleted (~2 min)
2. Target groups deleted (~1 min)
3. Environment updated to SingleInstance (~10 min)
4. New instance launched

### Step 5: Verify Cost Savings

```bash
# Check AWS Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE

# Should see Load Balancer costs drop to $0
```

---

## Scenario 3: Import Individual Resource

Sometimes you only need to import one resource.

### Example: Import an S3 Bucket

```bash
# 1. Find bucket name in AWS
aws s3 ls | grep flora-frontend

# Output: flora-frontend-bucket-prod

# 2. Import into Terraform
terraform import \
  module.s3_cloudfront.aws_s3_bucket.frontend \
  flora-frontend-bucket-prod

# 3. Verify
terraform state show module.s3_cloudfront.aws_s3_bucket.frontend
```

### Common Import Commands

```bash
# S3 Bucket
terraform import module.s3_cloudfront.aws_s3_bucket.frontend <bucket-name>

# CloudFront Distribution
terraform import module.s3_cloudfront.aws_cloudfront_distribution.frontend <distribution-id>

# RDS Instance
terraform import module.rds.aws_db_instance.main <db-instance-id>

# Elastic Beanstalk Environment
terraform import module.elastic_beanstalk.aws_elastic_beanstalk_environment.backend <env-name>

# Elastic Beanstalk Application
terraform import module.elastic_beanstalk.aws_elastic_beanstalk_application.app <app-name>

# IAM Role
terraform import module.iam.aws_iam_role.backend_role <role-name>

# VPC
terraform import module.networking.aws_vpc.main <vpc-id>
```

---

## Handling State File Conflicts

### Problem: Multiple People with Different States

**Symptom:**
```
Error: state file conflict
```

**Solution: Use Remote State (S3 Backend)**

1. Create S3 bucket for state:
```bash
aws s3 mb s3://flora-terraform-state-prod
```

2. Enable versioning:
```bash
aws s3api put-bucket-versioning \
  --bucket flora-terraform-state-prod \
  --versioning-configuration Status=Enabled
```

3. Create DynamoDB table for locking:
```bash
aws dynamodb create-table \
  --table-name flora-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

4. Add backend config to `main.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "flora-terraform-state-prod"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "flora-terraform-locks"
  }
}
```

5. Migrate existing state:
```bash
terraform init -migrate-state
```

---

## Dealing with Drift (Manual Changes)

**Scenario:** Someone made changes in AWS Console, Terraform doesn't know about them.

### Detect Drift

```bash
# Refresh Terraform state from AWS
terraform refresh

# Compare state vs config
terraform plan

# If you see unexpected changes, someone modified AWS manually
```

### Resolve Drift

**Option 1: Accept AWS Changes (Update Terraform)**
```bash
# Update your .tf files to match AWS
# Then run:
terraform plan  # Should show "No changes"
```

**Option 2: Revert AWS to Terraform State**
```bash
# Force AWS to match Terraform config
terraform apply

# ⚠️ This will undo manual changes!
```

---

## Migration Checklist

When importing from upstream repo:

- [ ] List all AWS resources
- [ ] Run import script
- [ ] Verify state: `terraform state list`
- [ ] Check alignment: `terraform plan` (should show no changes)
- [ ] Make desired modifications to `.tf` files
- [ ] Preview changes: `terraform plan -out=tfplan`
- [ ] Apply changes: `terraform apply tfplan`
- [ ] Verify in AWS Console
- [ ] Test application still works
- [ ] Commit updated `.tf` files to git
- [ ] Update team on changes

---

## Pro Tips

1. **Always import before destroying**
   - Import existing resources first
   - Then modify Terraform config
   - Prevents accidentally creating duplicates

2. **Use modules**
   - Import into modules: `module.name.resource.id`
   - Keeps state organized

3. **Backup state file**
   ```bash
   cp terraform.tfstate terraform.tfstate.backup
   ```

4. **Test in dev first**
   - Try imports in dev environment
   - Verify workflow
   - Then apply to prod

5. **Document your changes**
   - Keep notes of what you imported
   - Document why you made changes
   - Helps future you (and teammates)

---

## Troubleshooting

### "Error: resource already managed by Terraform"
**Solution:** Resource is already in state. Check with:
```bash
terraform state list | grep <resource-name>
```

### "Error: resource not found"
**Solution:** Wrong resource ID. Get correct ID from AWS:
```bash
aws elasticbeanstalk describe-environments --query "Environments[*].[EnvironmentName,EnvironmentId]"
```

### "Cannot import: no configuration"
**Solution:** Add resource block to `.tf` file BEFORE importing:
```hcl
resource "aws_s3_bucket" "frontend" {
  # Will be populated by import
}
```

---

**Need help with fresh setup?** See [SETUP.md](SETUP.md)
**Want to save costs?** See [AWS_COST_TIPS.md](AWS_COST_TIPS.md)
