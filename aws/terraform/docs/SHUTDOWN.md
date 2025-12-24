# 🛑 Flora AWS Shutdown Guide

> **Complete shutdown to avoid charges after Free Tier expires**

---

## When to Use This Guide

- ✅ Free Tier expired (after 6 months)
- ✅ Want to stop ALL AWS charges
- ✅ Graduating and no longer need Flora live
- ✅ Moving to different cloud provider

**⚠️ WARNING:** This is **IRREVERSIBLE** - all data will be deleted!

---

## Two Shutdown Options

### Option A: Terraform Destroy ✅ **Recommended** (Fast, 95% Complete)

**Advantages:**
- Fast (1 command destroys ~20 resources)
- Consistent (won't miss resources)
- Logs what was deleted

**Disadvantages:**
- Doesn't delete: snapshots, CloudWatch logs, S3 versions
- Need manual cleanup for 100% cost elimination

---

### Option B: AWS Console Manual ⚠️ (Slow, Error-Prone)

**Advantages:**
- Visual confirmation of each deletion
- Good for learning AWS

**Disadvantages:**
- Time-consuming (20+ individual deletions)
- Easy to miss resources (hidden charges)
- No audit trail

---

## Recommended Approach: Terraform + Manual Cleanup

### Step 1: Backup Important Data (Optional)

**Database backup (for migration to another provider):**

```bash
# Option A: Direct export from running RDS (fastest)
# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier flora-db \
  --query "DBInstances[0].Endpoint.Address" \
  --output text

# Export to SQL file (requires PostgreSQL client installed locally)
PGPASSWORD=your-db-password pg_dump \
  -h your-rds-endpoint.ap-southeast-2.rds.amazonaws.com \
  -U flora_admin \
  -d flora_db \
  -F c \
  -f flora_backup_$(date +%Y%m%d).dump

# This creates a compressed backup file: flora_backup_20251209.dump
# Size: ~5-50MB depending on data

# Option B: From RDS snapshot (if RDS already deleted)
# 1. Restore snapshot to temporary RDS instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier flora-db-temp \
  --db-snapshot-identifier flora-final-snapshot

# 2. Wait for instance to be available (~10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier flora-db-temp

# 3. Get endpoint and export
aws rds describe-db-instances \
  --db-instance-identifier flora-db-temp \
  --query "DBInstances[0].Endpoint.Address" \
  --output text

# 4. Export database
PGPASSWORD=your-password pg_dump \
  -h temp-endpoint.rds.amazonaws.com \
  -U flora_admin \
  -d flora_db \
  -F c \
  -f flora_backup.dump

# 5. Delete temporary instance (important!)
aws rds delete-db-instance \
  --db-instance-identifier flora-db-temp \
  --skip-final-snapshot
```

**Frontend content backup:**
```bash
# Download all frontend files from S3
aws s3 sync s3://YOUR_S3_BUCKET_NAME ./backup-frontend/
```

**Terraform state backup:**
```bash
cd terraform/environments/prod

# Download state file
aws s3 cp s3://flora-terraform-state-570006208612/production/terraform.tfstate ./backup/

# OR let Terraform create local backup automatically during destroy
```

---

### Step 2: Terraform Destroy (Main Cleanup)

```bash
cd terraform/environments/prod

# Preview what will be deleted
terraform plan -destroy

# Expected output: Plan to destroy ~20 resources
# ✅ Elastic Beanstalk environment
# ✅ RDS database instance
# ✅ S3 buckets (frontend)
# ✅ CloudFront distributions
# ✅ IAM roles and policies
# ✅ Security groups
# ✅ SSM parameters (secrets)
```

**Execute destroy:**
```bash
terraform destroy

# Type 'yes' to confirm
# Takes 5-10 minutes
```

**What gets deleted:**
- ✅ Elastic Beanstalk application + environment
- ✅ RDS PostgreSQL database (creates final snapshot first!)
- ✅ S3 buckets (frontend, assets)
- ✅ CloudFront distributions (CDN)
- ✅ IAM roles and instance profiles
- ✅ VPC security groups
- ✅ SSM Parameter Store secrets

**What does NOT get deleted:**
- ❌ RDS snapshots (manual + final snapshot)
- ❌ CloudWatch log groups
- ❌ S3 versioned objects (old versions)
- ❌ Terraform backend (S3 state bucket + DynamoDB)

---

### Step 3: Delete RDS Snapshots

**List snapshots:**
```bash
aws rds describe-db-snapshots \
  --query "DBSnapshots[?DBInstanceIdentifier=='flora-db'].[DBSnapshotIdentifier,SnapshotCreateTime,AllocatedStorage]" \
  --output table
```

**Expected output:**
```
┌────────────────────────────────────────────────────┐
│ DBSnapshotIdentifier       │ SnapshotCreateTime    │
├────────────────────────────┼───────────────────────┤
│ flora-final-snapshot       │ 2025-12-09T10:30:00Z  │
│ rds:flora-db-2025-12-08    │ 2025-12-08T03:00:00Z  │
└────────────────────────────────────────────────────┘
```

**Delete snapshots:**
```bash
# Delete final snapshot created by Terraform
aws rds delete-db-snapshot \
  --db-snapshot-identifier flora-final-snapshot

# Delete automated backups (if any)
aws rds delete-db-snapshot \
  --db-snapshot-identifier rds:flora-db-2025-12-08

# Verify all deleted
aws rds describe-db-snapshots \
  --query "DBSnapshots[?DBInstanceIdentifier=='flora-db']" \
  --output table
# Should return empty
```

**Cost savings:** ~$2/month per 20GB snapshot

---

### Step 4: Delete CloudWatch Logs

**List log groups:**
```bash
aws logs describe-log-groups \
  --query "logGroups[?contains(logGroupName, 'flora')].logGroupName" \
  --output table
```

**Expected log groups:**
```
/aws/elasticbeanstalk/flora-backend-production/var/log/eb-engine.log
/aws/elasticbeanstalk/flora-backend-production/var/log/web.stdout.log
/aws/lambda/flora-*  (if any)
```

**Delete log groups:**
```bash
# Delete Elastic Beanstalk logs
aws logs delete-log-group \
  --log-group-name /aws/elasticbeanstalk/flora-backend-production/var/log/eb-engine.log

aws logs delete-log-group \
  --log-group-name /aws/elasticbeanstalk/flora-backend-production/var/log/web.stdout.log

# Or delete all Flora-related logs at once
aws logs describe-log-groups \
  --query "logGroups[?contains(logGroupName, 'flora')].logGroupName" \
  --output text | \
  xargs -n1 aws logs delete-log-group --log-group-name
```

**Cost savings:** ~$0.50/month per GB stored

---

### Step 5: Empty S3 Versioned Objects (If Enabled)

**Check if versioning is enabled:**
```bash
aws s3api get-bucket-versioning \
  --bucket flora-frontend-production-b001bddb
```

**If output shows `"Status": "Enabled"`:**
```bash
# List all versions
aws s3api list-object-versions \
  --bucket flora-frontend-production-b001bddb

# Delete all versions (including delete markers)
aws s3api delete-objects \
  --bucket flora-frontend-production-b001bddb \
  --delete "$(aws s3api list-object-versions \
    --bucket flora-frontend-production-b001bddb \
    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
    --output json)"
```

**Note:** Terraform destroy should handle this, but verify manually

---

### Step 6: Delete Terraform Backend (LAST STEP!)

**⚠️ ONLY do this if you're 100% done with Terraform!**

This deletes the S3 bucket and DynamoDB table that store Terraform state.

**Before deleting:**
- ✅ All infrastructure destroyed (`terraform destroy` succeeded)
- ✅ No plans to recreate infrastructure
- ✅ State file backed up (if needed)

**Delete backend:**
```bash
cd terraform-backend/

# Preview deletion
terraform plan -destroy

# Execute (deletes S3 bucket + DynamoDB table)
terraform destroy

# Type 'yes' to confirm
```

**Cost savings:** ~$0.03/month

**Why delete last?**
- If you delete backend first, Terraform loses state
- Can't destroy main infrastructure without state
- Backend is cheap ($0.03/month), delete only when 100% done

---

## Complete Shutdown Checklist

Use this checklist to ensure 100% cost elimination:

### Main Resources (Terraform)
- [ ] `terraform destroy` completed successfully
- [ ] No errors in destroy output
- [ ] Verified in AWS Console: EC2 instances gone
- [ ] Verified in AWS Console: RDS instance terminated

### Manual Cleanup
- [ ] RDS snapshots deleted (check `rds describe-db-snapshots`)
- [ ] CloudWatch log groups deleted (check `logs describe-log-groups`)
- [ ] S3 versioned objects deleted (if versioning enabled)
- [ ] No unattached Elastic IPs ($3.60/month each)
- [ ] No NAT Gateways (~$32/month each)
- [ ] No Load Balancers ($18/month each)

### Backend Cleanup (Optional)
- [ ] Terraform backend destroyed (S3 + DynamoDB)
- [ ] State file backed up locally

### Verification
- [ ] AWS Cost Explorer shows $0 forecast
- [ ] Billing dashboard shows no active resources
- [ ] Set up billing alert for $1 (catch any missed charges)

---

## Verification Commands

**Check for remaining resources:**
```bash
# EC2 instances
aws ec2 describe-instances \
  --query "Reservations[].Instances[?State.Name=='running']" \
  --output table

# RDS databases
aws rds describe-db-instances \
  --query "DBInstances[].DBInstanceIdentifier" \
  --output table

# S3 buckets
aws s3 ls | grep flora

# CloudFront distributions
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='Flora*']" \
  --output table

# Elastic Beanstalk
aws elasticbeanstalk describe-environments \
  --query "Environments[?Status=='Ready']" \
  --output table
```

**Expected output:** All commands should return empty or "None"

---

## Cost After Shutdown

| Scenario | Monthly Cost |
|----------|--------------|
| **Complete shutdown** (all steps) | $0.00 ✅ |
| **Terraform destroy only** (skipped manual cleanup) | ~$2.50/month ⚠️ |
| **Kept RDS snapshots** (20GB × 2) | ~$4.00/month |
| **Kept CloudWatch logs** (5GB) | ~$2.50/month |
| **Kept backend** (S3 + DynamoDB) | ~$0.03/month (negligible) |

---

## Rollback / Restart Infrastructure

**If you want to bring Flora back online later:**

### Option A: Restore from Snapshot (Fastest)
```bash
# 1. Recreate infrastructure with Terraform
cd terraform/environments/prod
terraform init
terraform apply

# 2. Restore database from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier flora-db \
  --db-snapshot-identifier flora-final-snapshot

# 3. Import restored database into Terraform
terraform import module.rds.aws_db_instance.postgres flora-db

# 4. Redeploy code
git push origin li-dev  # GitHub Actions deploys
```

### Option B: Fresh Start (Clean Slate)
```bash
# 1. Recreate infrastructure
cd terraform/environments/prod
terraform init
terraform apply

# 2. Database will be empty, run migrations
# EB automatically runs: pnpm start:prod
# → prisma migrate deploy
# → prisma db seed

# 3. Deploy code
git push origin li-dev
```

---

## AWS Console Manual Shutdown (Alternative)

**If you prefer manual deletion via AWS Console:**

### 1. Elastic Beanstalk
- Go to: Elastic Beanstalk → Environments
- Select: `flora-backend-production`
- Actions → Terminate environment
- Confirm deletion

### 2. RDS Database
- Go to: RDS → Databases
- Select: `flora-db`
- Actions → Delete
- ⚠️ **Uncheck** "Create final snapshot" (or it will cost $2/month)
- Type: `delete me` to confirm

### 3. S3 Buckets
- Go to: S3 → Buckets
- Select: `flora-frontend-production-*`
- Empty bucket (delete all files)
- Delete bucket
- Repeat for all Flora buckets

### 4. CloudFront Distributions
- Go to: CloudFront → Distributions
- Select Flora distributions
- Disable → Wait 5 minutes → Delete

### 5. IAM Roles
- Go to: IAM → Roles
- Search: `flora`
- Delete all Flora-related roles

### 6. Security Groups
- Go to: EC2 → Security Groups
- Search: `flora`
- Delete all Flora security groups

### 7. SSM Parameter Store
- Go to: Systems Manager → Parameter Store
- Search: `/flora`
- Delete all parameters

### 8. CloudWatch Logs
- Go to: CloudWatch → Log groups
- Search: `flora`
- Delete all log groups

**Estimated time:** 30-45 minutes (vs 5 minutes with Terraform)

---

## Common Issues

### "Error deleting S3 bucket: BucketNotEmpty"

**Solution:**
```bash
# Empty bucket before deleting
aws s3 rm s3://YOUR_BUCKET_NAME --recursive

# Delete versioned objects if enabled
aws s3api delete-objects --bucket YOUR_BUCKET_NAME \
  --delete "$(aws s3api list-object-versions \
    --bucket YOUR_BUCKET_NAME \
    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}')"
```

---

### "Error deleting security group: DependencyViolation"

**Solution:** Security groups can't be deleted if still attached to resources
```bash
# Find what's using the security group
aws ec2 describe-network-interfaces \
  --filters Name=group-id,Values=sg-xxxxx

# Delete dependent resources first
# Then retry security group deletion
```

---

### "RDS snapshot still exists after destroy"

**Expected behavior:** Terraform creates final snapshot before deleting RDS

**Solution:** This is intentional (data protection), delete manually:
```bash
aws rds delete-db-snapshot \
  --db-snapshot-identifier flora-final-snapshot
```

---

## Summary

**Fastest shutdown (95% complete):**
```bash
cd terraform/environments/prod
terraform destroy    # 5 minutes, deletes ~20 resources
```

**Complete shutdown (100%, $0 charges):**
```bash
# 1. Terraform destroy (main cleanup)
terraform destroy

# 2. Delete snapshots
aws rds delete-db-snapshot --db-snapshot-identifier flora-final-snapshot

# 3. Delete CloudWatch logs
aws logs describe-log-groups --query "logGroups[?contains(logGroupName, 'flora')].logGroupName" --output text | \
  xargs -n1 aws logs delete-log-group --log-group-name

# 4. Verify $0 forecast in AWS Cost Explorer

# 5. (Optional) Delete backend
cd ../../terraform-backend
terraform destroy
```

**Time comparison:**
- Terraform destroy: ~5 minutes ✅
- AWS Console manual: ~45 minutes ⚠️

---

**Related Documentation:**
- [SETUP.md](SETUP.md) - Recreate infrastructure later
- [AWS_COST_TIPS.md](AWS_COST_TIPS.md) - Avoid charges in first place
- [DEPLOYMENT.md](DEPLOYMENT.md) - Redeploy code after recreation

---

**Flora Team:** Anthony, Bevan, Xiaoling, and Lily | **Holberton Final Project 2025**
