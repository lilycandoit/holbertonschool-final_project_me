# 🤔 Terraform FAQ - Frequently Asked Questions

> **Common questions about Flora's Terraform setup**

---

## Question 1: Do We Really Need a Dev Environment?

### TL;DR: **No, not really for a solo student project!**

### The Theory (Enterprise Best Practice)
In professional teams, you'd have:
```
dev → staging → production
```
- **Dev:** Developers test changes before merging
- **Staging:** QA tests before production deployment
- **Production:** Live customer-facing environment

### The Reality (Flora Project)

**You don't need dev environment because:**

1. **Cost:** Running 2 environments doubles your AWS bill
   - Dev: $21/month (after Free Tier)
   - Prod: $21/month (after Free Tier)
   - **Total: $42/month** just for infrastructure!

2. **Docker handles testing:** You already test locally with Docker
   ```bash
   pnpm docker:dev:bg  # Local testing
   ```

3. **GitHub Actions is your staging:** Tests run in CI before deployment

4. **Low traffic:** With < 100 users, prod environment is stable enough

### When You WOULD Need Dev Environment

✅ If you had a team of 5+ developers making changes simultaneously
✅ If you had paying customers who'd be affected by downtime
✅ If you needed to test database migrations on real-size data
✅ If you were testing infrastructure changes (like adding Load Balancer)

### Recommendation for Flora

**Option 1: Delete Dev Environment** (Recommended for students)
```bash
cd terraform/environments/dev
terraform destroy

# Or just don't run terraform apply on dev at all
```

**Option 2: Use Dev for Terraform Testing Only**
- Only spin up dev when testing Terraform changes
- Destroy it immediately after testing
- **Never leave it running 24/7**

Example workflow:
```bash
# Testing a Terraform change
cd terraform/environments/dev
terraform apply  # Test the change

# Verify it works
curl http://dev-backend-url/health

# Destroy immediately
terraform destroy

# Then apply to prod with confidence
cd ../prod
terraform apply
```

**Cost Comparison:**
| Scenario | Monthly Cost |
|----------|--------------|
| Prod only | $0 (Free Tier) or $21 (after) |
| Dev + Prod (both running 24/7) | $0 (first 12 months) then $42 |
| Dev on-demand (10 hours/month) | $0.31 extra |

---

## Question 2: Auto-Shutdown - Dev Only or Prod Too?

### TL;DR: **Dev only! NEVER auto-shutdown production!**

### Why Dev Can Auto-Shutdown

**Dev environment is for testing, not serving real users:**
- Developers work 9-5, no need to run at night
- Can afford downtime for testing
- Saves ~50% of costs

**Example schedule:**
```
Monday-Friday:
- 9 AM: Auto-start (when you wake up)
- 6 PM: Auto-shutdown (after work)
- Savings: 15 hours/day × 5 days = 75 hours/week saved
```

### Why Prod Should NEVER Auto-Shutdown

**❌ BAD IDEAS:**
1. "Let's shutdown prod at night to save money"
   - **Problem:** Portfolio link is dead when recruiters check it
   - **Cost of missed opportunity:** > any AWS savings

2. "Shutdown during weekends"
   - **Problem:** Demo Day judges check projects on weekends
   - **Result:** Looks like your project is broken

3. "Only run 12 hours/day"
   - **Problem:** You can't control when people visit your portfolio
   - **Free Tier:** 750 hours/month = 24/7 for one instance anyway!

### The Economics

**Within Free Tier (First 12 Months):**
- Running 24/7: **$0**
- Running 12 hours/day: **$0**
- **Savings: $0** (you're already free!)

**After Free Tier:**
- Running 24/7: $7.50/month
- Running 12 hours/day: $3.75/month
- **Savings: $3.75/month = $45/year**

**Worth it?**
- **NO!** Having your portfolio down when a recruiter checks it could cost you a $100k+ job offer
- $45/year savings vs potential $100k+ job = terrible risk/reward

### Recommendation

**For Flora Production:**
```
✅ Run 24/7
✅ Enable Auto-Scaling (stays at 1 instance)
✅ Set up CloudWatch alarms for downtime
❌ NEVER auto-shutdown
❌ NEVER reduce availability
```

**If you MUST save money after Free Tier expires:**
1. Add a "Wake Up" button on your website that starts the instance
2. Use CloudFront caching to serve static content when backend is down
3. Or just pay the $21/month - it's cheaper than Netflix!

---

## Question 3: AWS Console vs AWS CLI - When to Use Which?

### TL;DR: **Use Console for exploration, CLI for automation**

### AWS Console ✅ Good For:

#### 1. Browsing and Learning
```
✅ Viewing all resources in one place
✅ Understanding service options
✅ Checking current configuration
✅ Debugging issues visually
```

**Example:** "I want to see why my RDS is slow"
- Console: Click RDS → Performance Insights → See graphs
- CLI: Would need multiple commands and JSON parsing

#### 2. One-Time Manual Tasks
```
✅ Creating IAM user accounts
✅ Setting up billing alerts
✅ Viewing Cost Explorer
✅ Checking CloudWatch logs
```

#### 3. Quick Fixes
```
✅ Restarting a stopped instance
✅ Emptying an S3 bucket
✅ Checking security group rules
```

### AWS CLI ✅ Good For:

#### 1. Automation and Scripts
```bash
# Good: Automated backup script
aws rds create-db-snapshot \
  --db-instance-identifier flora-db \
  --db-snapshot-identifier backup-$(date +%Y%m%d)
```

**Why CLI is better:** Can run in cron, GitHub Actions, or scripts

#### 2. Bulk Operations
```bash
# Good: Delete all snapshots older than 7 days
aws rds describe-db-snapshots \
  --query "DBSnapshots[?SnapshotCreateTime<'2025-01-02'].DBSnapshotIdentifier" \
  --output text | xargs -n1 aws rds delete-db-snapshot --db-snapshot-identifier
```

**Why CLI is better:** Console requires clicking each snapshot individually

#### 3. Documentation and Reproducibility
```bash
# Good: Documented commands in docs
aws s3 sync dist/ s3://flora-frontend/ --delete
```

**Why CLI is better:** Team members can copy-paste exact commands

### ❌ AWS Console CANNOT Do (Must Use Terraform/CLI)

#### 1. **Change Elastic Beanstalk Environment Type** ❌

**Your exact question!**

**Why Console fails:**
```
Console lets you:
✅ Create new environment (choose LoadBalanced or SingleInstance)
❌ Change existing environment type
```

**The Problem:**
- Elastic Beanstalk environment type is an **immutable property**
- Once created as `LoadBalanced`, it cannot be changed to `SingleInstance`
- AWS Console only lets you:
  - Rebuild the environment (creates new one, loses data)
  - Clone the environment (creates duplicate)

**The Terraform Solution:**
```hcl
# Terraform can update the environment type
setting {
  namespace = "aws:elasticbeanstalk:environment"
  name      = "EnvironmentType"
  value     = "SingleInstance"  # Changed from "LoadBalanced"
}
```

**What Terraform does behind the scenes:**
1. Detects environment type changed
2. Plans to replace the environment
3. Creates new SingleInstance environment
4. Migrates traffic
5. Destroys old LoadBalanced environment

**Console equivalent:** Would require manual steps:
1. Create new environment with SingleInstance
2. Deploy application to new environment
3. Update DNS/CloudFront to point to new environment
4. Terminate old environment
5. Fix all hardcoded references

**Terraform does this in one command:** `terraform apply`

#### 2. **Manage Infrastructure State** ❌

**What Terraform tracks:**
```
✅ What resources exist
✅ What their configuration is
✅ Dependencies between resources
✅ History of changes
```

**What Console shows:**
```
✅ Current state only
❌ No history
❌ No dependencies
❌ No drift detection
```

**Example Problem:**
```
Day 1: Created S3 bucket via Console
Day 30: Someone deletes it manually
Result: No record of what the configuration was!

With Terraform:
Day 1: terraform apply (state saved)
Day 30: terraform plan (detects bucket missing, offers to recreate)
```

#### 3. **Atomic Multi-Resource Changes** ❌

**Scenario:** Change database password + update all apps

**Console:** Manual coordination required
```
1. Change RDS password in Console
2. Update Elastic Beanstalk env vars in Console
3. Update Lambda functions in Console
4. Hope nothing breaks in between!
```

**Terraform:** Atomic update
```hcl
# One command updates everything
terraform apply
```

**If anything fails:** Terraform rolls back all changes

#### 4. **Drift Detection** ❌

**Terraform can detect manual changes:**
```bash
terraform plan

# Output:
# ~ aws_security_group.backend
#     ingress: [...] => [...]  (changed manually in Console)
```

**Console:** No way to know if someone made manual changes

#### 5. **Cost Estimation Before Changes** ❌

**Terraform (with third-party tools):**
```bash
# Preview cost impact
terraform plan | infracost breakdown

# Shows: This change will cost +$18/month
```

**Console:** You only find out when the bill arrives!

---

## When Each Approach is Best

### Scenario Matrix

| Task | Console | CLI | Terraform | Best Choice |
|------|---------|-----|-----------|-------------|
| View current costs | ✅ | ✅ | ❌ | **Console** (graphs!) |
| Change instance type | ✅ | ✅ | ✅ | **Terraform** (tracked) |
| Change environment type | ❌ | ❌ | ✅ | **Terraform** (only option) |
| Restart instance | ✅ | ✅ | ❌ | **Console** (quickest) |
| Bulk delete snapshots | ❌ | ✅ | ✅ | **CLI** (automation) |
| Review security groups | ✅ | ✅ | ✅ | **Console** (visual) |
| Create new infrastructure | ✅ | ✅ | ✅ | **Terraform** (documented) |
| Emergency fix | ✅ | ✅ | ❌ | **Console** (fastest) |
| Team collaboration | ❌ | ❌ | ✅ | **Terraform** (version control) |
| One-time experiment | ✅ | ✅ | ❌ | **Console** (quick & dirty) |

---

## Real-World Workflow

### Daily Development
```bash
# Check logs
AWS Console → CloudWatch → Logs

# Check costs
AWS Console → Billing → Cost Explorer

# Deploy code
GitHub Actions (automated)
```

### Infrastructure Changes
```bash
# Plan change
cd terraform/environments/prod
terraform plan

# Review in Console
AWS Console → verify current state

# Apply change
terraform apply

# Verify in Console
AWS Console → confirm change worked
```

### Emergency Response
```bash
# Quick fix in Console
AWS Console → restart instance

# Document fix in Terraform (later)
vim terraform/environments/prod/main.tf
terraform apply
```

---

## Pro Tips

### 1. **Console for Understanding, Terraform for Doing**
```
AWS Console: "What instance types are available?"
Terraform: Apply the instance type you chose
```

### 2. **CLI for One-Liners, Terraform for Infrastructure**
```bash
# Good: CLI for quick check
aws ec2 describe-instances --query 'Reservations[*].Instances[*].InstanceType'

# Good: Terraform for changing instance type
terraform apply
```

### 3. **Always Update Terraform After Manual Console Changes**
```bash
# If you changed something in Console (emergency)
1. Fix immediate issue in Console
2. Update Terraform to match
3. Run terraform plan (should show "no changes")
4. Document what you did in git commit
```

### 4. **Use Console to Discover, CLI to Document**
```
1. Explore service in Console
2. Find AWS CLI command that does same thing
3. Add CLI command to docs
4. Later, convert to Terraform if needed
```

---

## Summary

### Dev Environment
- **Not needed** for solo student projects
- Use Docker for local testing instead
- Only create dev for testing Terraform changes
- **Destroy immediately after testing**

### Auto-Shutdown
- **Dev:** Yes, save 50% costs when testing
- **Prod:** NEVER! Portfolio must be always available
- Free Tier gives 750 hours anyway (24/7 for one instance)

### Console vs CLI vs Terraform
- **Console:** Exploration, learning, emergencies
- **CLI:** Automation, documentation, bulk operations
- **Terraform:** Infrastructure changes, team collaboration, immutable changes like environment type

**Golden Rule:**
> **If it's important enough to keep, manage it with Terraform.**
> **If it's a quick experiment, use Console.**
> **If it's automation, use CLI.**

---

**Questions?** Open an issue or check other docs:
- [SETUP.md](SETUP.md) - Fresh infrastructure setup
- [IMPORT.md](IMPORT.md) - Import existing resources
- [AWS_COST_TIPS.md](AWS_COST_TIPS.md) - Cost optimization
