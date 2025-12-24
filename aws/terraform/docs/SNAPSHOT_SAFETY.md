# 🛡️ RDS Final Snapshot Safety Guide

> **Understanding `skip_final_snapshot` and safe database destruction**

---

## What is a Final Snapshot?

When you destroy an RDS database with `terraform destroy`, AWS gives you one last chance to save your data by creating a **final snapshot** (backup).

**Think of it like:**
- Deleting a file on your computer
- System asks: "Move to Trash or Delete Permanently?"
- Final snapshot = "Move to Trash" (can recover later)
- No snapshot = "Delete Permanently" (gone forever!)

---

## The Two Settings Explained

### Option 1: `skip_final_snapshot = true` ❌

**What happens when you run `terraform destroy`:**

```
┌─────────────────────────────────────┐
│  terraform destroy                  │
├─────────────────────────────────────┤
│  ⚠️  Destroying RDS database...     │
│  ⚠️  skip_final_snapshot = true     │
│  ⚠️  NO BACKUP CREATED              │
│  ✅ Database deleted                │
│  💀 ALL DATA PERMANENTLY LOST!      │
└─────────────────────────────────────┘
```

**Use case:** Temporary test databases you don't care about

---

### Option 2: `skip_final_snapshot = false` ✅

**What happens when you run `terraform destroy`:**

```
┌─────────────────────────────────────┐
│  terraform destroy                  │
├─────────────────────────────────────┤
│  ⚠️  Destroying RDS database...     │
│  ✅ Creating final snapshot first   │
│     Name: flora-final-snapshot-...  │
│  ✅ Snapshot saved                  │
│  ✅ Database deleted                │
│  🎉 DATA SAFE! Can restore later    │
└─────────────────────────────────────┘
```

**Use case:** Production databases with valuable data

---

## Your Current Configuration

```hcl
skip_final_snapshot       = false  ✅
final_snapshot_identifier = "${var.project_name}-final-snapshot-${formatdate("YYYY-MM-DD", timestamp())}"
```

### ⚠️ PROBLEM: Using `timestamp()` is DANGEROUS!

**Why this causes issues:**

#### Problem 1: Changes Every Time You Run Terraform

```bash
# First time
terraform plan
# Snapshot name: flora-final-snapshot-2025-01-09

# 5 minutes later
terraform plan
# Snapshot name: flora-final-snapshot-2025-01-09  (different timestamp!)
# Terraform thinks config changed!
```

**Result:** Terraform will show "changes" on every `terraform plan` even though nothing actually changed.

#### Problem 2: Snapshot Name Collision on Destroy → Recreate

```bash
# Day 1: Destroy database
terraform destroy
# Creates: flora-final-snapshot-2025-01-09-10:30:00

# Day 1 (later): Recreate database
terraform apply
# Config says: flora-final-snapshot-2025-01-09-14:00:00  (new timestamp)

# Day 2: Destroy again
terraform destroy
# Tries to create: flora-final-snapshot-2025-01-09-...
# ERROR: Snapshot name collision!
```

---

## ✅ RECOMMENDED FIX

### Option A: Static Identifier (Simplest)

**Best for:** Projects you'll destroy once (at graduation)

```hcl
skip_final_snapshot       = false
final_snapshot_identifier = "${var.project_name}-final-snapshot"
```

**Pros:**
- ✅ Consistent name
- ✅ No spurious "changes" in terraform plan
- ✅ Works for one-time destroy

**Cons:**
- ❌ Can't destroy → recreate → destroy again (name conflict)

**Solution for name conflict:**
```bash
# If you need to destroy again, delete old snapshot first:
aws rds delete-db-snapshot --db-snapshot-identifier flora-final-snapshot

# Then destroy
terraform destroy
```

---

### Option B: Manual Override (Most Flexible)

**Best for:** Multiple destroy/recreate cycles

```hcl
# In variables.tf
variable "final_snapshot_identifier" {
  description = "Name for final snapshot (override when destroying)"
  type        = string
  default     = null  # Don't create snapshot by default
}

# In main.tf
skip_final_snapshot       = var.final_snapshot_identifier == null
final_snapshot_identifier = var.final_snapshot_identifier
```

**Usage:**

```bash
# Regular apply (no snapshot needed)
terraform apply

# When destroying (create snapshot)
terraform destroy -var="final_snapshot_identifier=flora-final-2025-01-09"

# Destroy again later (different name)
terraform destroy -var="final_snapshot_identifier=flora-final-2025-02-15"
```

**Pros:**
- ✅ Full control over snapshot name
- ✅ Can destroy multiple times
- ✅ Don't create snapshot during normal operations

**Cons:**
- ❌ Requires remembering to pass variable

---

### Option C: Lifecycle Prevent Destroy (Safest for Prod)

**Best for:** Production databases you never want to accidentally destroy

```hcl
resource "aws_db_instance" "postgres" {
  # ... existing config ...

  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-final-snapshot"

  # Prevent accidental destruction
  lifecycle {
    prevent_destroy = true
  }
}
```

**What happens:**

```bash
terraform destroy

# ERROR: Instance cannot be destroyed due to prevent_destroy lifecycle rule
# This protects against accidents!
```

**To actually destroy (when you're sure):**

```hcl
# Temporarily comment out prevent_destroy
lifecycle {
  # prevent_destroy = true  # COMMENTED OUT
}
```

Then run `terraform destroy`

---

## Recommended for Flora

### For Development/Learning Phase

```hcl
skip_final_snapshot       = false
final_snapshot_identifier = "flora-final-snapshot"
```

**Simple, safe, works for one-time destroy at graduation.**

---

### For Production (After Graduation)

```hcl
skip_final_snapshot       = false
final_snapshot_identifier = "flora-final-snapshot"

lifecycle {
  prevent_destroy = true  # Can't accidentally destroy!
}
```

**Requires explicit action to destroy, prevents mistakes.**

---

## How to Recover Data from Snapshot

If you destroyed the database but have a snapshot:

### Method 1: Restore via AWS Console

1. Go to RDS → Snapshots
2. Select `flora-final-snapshot`
3. Click "Actions" → "Restore snapshot"
4. Configure new database instance
5. Update Terraform to import restored instance

### Method 2: Restore via CLI

```bash
# Restore snapshot to new database
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier flora-db-restored \
  --db-snapshot-identifier flora-final-snapshot

# Wait for restore to complete (10-15 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier flora-db-restored

# Import into Terraform
terraform import module.rds.aws_db_instance.postgres flora-db-restored
```

### Method 3: Restore via Terraform

```hcl
resource "aws_db_instance" "postgres" {
  snapshot_identifier = "flora-final-snapshot"  # Add this line

  # Keep all other settings the same
  # ...
}
```

Then run:
```bash
terraform apply
# Creates new database from snapshot
```

---

## Snapshot Costs

**Good news:** Snapshots are cheap!

| Type | Storage Size | Monthly Cost |
|------|--------------|--------------|
| Manual snapshot | 20 GB | $2.00/month (after Free Tier) |
| Automated backup | 20 GB | FREE (within Free Tier) |

**Free Tier includes:**
- 20 GB of backup storage (automated backups)
- Manual snapshots count separately

**To avoid costs:**
- Delete manual snapshots after you've verified you don't need them
- Keep automated backups (they're free within 20GB)

```bash
# List all snapshots
aws rds describe-db-snapshots \
  --query "DBSnapshots[?DBInstanceIdentifier=='flora-db'].[DBSnapshotIdentifier,SnapshotCreateTime,AllocatedStorage]" \
  --output table

# Delete old manual snapshot
aws rds delete-db-snapshot \
  --db-snapshot-identifier flora-final-snapshot
```

---

## Summary Table

| Setting | Destroy Behavior | Data Safety | Use Case |
|---------|------------------|-------------|----------|
| `skip_final_snapshot = true` | Delete immediately | ❌ LOST FOREVER | Temp/test databases |
| `skip_final_snapshot = false` + static name | Create snapshot first | ✅ SAFE | One-time destroy (graduation) |
| `skip_final_snapshot = false` + timestamp() | Create snapshot | ⚠️ CAUSES ISSUES | DON'T USE |
| `skip_final_snapshot = false` + prevent_destroy | CAN'T DESTROY | ✅ VERY SAFE | Production |


---

## Questions?

**Q: When would I run `terraform destroy`?**
A: When you're done with the project (after graduation) or moving to different infrastructure.

**Q: Will this snapshot cost money?**
A: $2/month after Free Tier (12 months). Delete it after confirming you don't need the data.

**Q: Can I have multiple snapshots?**
A: Yes! Each destroy creates one. But they all cost $2/month each.

**Q: What if I forget to set `skip_final_snapshot = false`?**
A: Your data is GONE. Always set it to `false` for production.

---

**Related Docs:**
- [SETUP.md](SETUP.md) - Database setup guide
- [AWS_COST_TIPS.md](AWS_COST_TIPS.md) - Snapshot cost details
- [FAQ.md](FAQ.md) - General questions
