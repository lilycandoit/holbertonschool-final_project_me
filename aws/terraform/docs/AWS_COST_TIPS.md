# 💰 AWS Cost Optimization for Students

> **Critical tips to keep your AWS bill FREE or near-zero**

**Based on real mistakes:** This guide includes lessons learned from Flora team's actual AWS billing surprises.

---

## ⚠️ THE #1 MOST EXPENSIVE MISTAKE

### ❌ Application Load Balancer (ALB) = ~$16-22/month

**Our Story:**
- Used Load Balancer in initial setup (seemed like "best practice")
- **Cost: $16.20/month** just for the Load Balancer
- Plus $0.008 per LCU-hour (Load Balancer Capacity Units)
- **Total unexpected cost: $18-22/month**

**The Fix:**
```hcl
# ❌ EXPENSIVE - Load Balanced
setting {
  namespace = "aws:elasticbeanstalk:environment"
  name      = "EnvironmentType"
  value     = "LoadBalanced"  # ~$18-22/month!
}

# ✅ FREE TIER - Single Instance
setting {
  namespace = "aws:elasticbeanstalk:environment"
  name      = "EnvironmentType"
  value     = "SingleInstance"  # $0/month
}
```

**When you actually need a Load Balancer:**
- Production app with 1000+ concurrent users
- High availability requirement (99.99% uptime SLA)
- Auto-scaling across multiple instances
- Blue-green deployments

**For student projects:** Single instance is plenty for demos and portfolios!

---

## 🎓 AWS Free Tier Limits (12 Months)

### Compute (EC2 / Elastic Beanstalk)
✅ **750 hours/month** of t2.micro or **t3.micro**
- Enough for **1 instance running 24/7**
- Or **2 instances running 12 hours/day each**

❌ **Exceeds Free Tier:**
- t2.small, t3.small (costs ~$15/month)
- Running 2+ instances 24/7
- Using Load Balancer

**Flora Configuration:**
```hcl
instance_type = "t3.micro"  # ✅ Free Tier
environment_type = "SingleInstance"  # ✅ No Load Balancer
```

---

### Database (RDS)
✅ **750 hours/month** of db.t3.micro
✅ **20 GB** of storage (SSD)
✅ **20 GB** of backup storage

❌ **Exceeds Free Tier:**
- db.t3.small or larger (~$25/month)
- Multi-AZ deployment (double cost)
- > 20GB storage ($0.10/GB-month extra)

**Flora Configuration:**
```hcl
instance_class = "db.t3.micro"  # ✅ Free Tier
allocated_storage = 20  # ✅ Free Tier
multi_az = false  # ✅ Free Tier
```

**Cost Trap:** RDS snapshots count against 20GB backup limit!
- Automated snapshots: FREE (within 20GB)
- Manual snapshots: $0.095/GB-month

---

### Storage (S3)
✅ **5 GB** of Standard storage
✅ **20,000 GET requests**
✅ **2,000 PUT requests**

**Flora Usage:**
- Frontend build: ~5-10 MB
- Product images: ~500 MB (if optimized)
- **Total: < 1 GB** ✅

**Cost Trap:** Requester Pays buckets
```hcl
# ❌ Can cause unexpected charges
request_payer = "Requester"

# ✅ Keep it simple
request_payer = "BucketOwner"
```

---

### CDN (CloudFront)
✅ **1 TB** of data transfer out
✅ **10,000,000 HTTP/HTTPS requests**

**Flora Usage:** ~5GB/month (well within Free Tier)

**Always Free** (even after 12 months):
- Data transfer between CloudFront and S3

---

### Network (Data Transfer)
✅ **100 GB/month** outbound to internet (EC2)
❌ **Data IN:** Always free!
❌ **Data OUT:** $0.09/GB after 100GB

**Cost Traps:**
1. **Cross-Region transfer:** $0.02/GB
   ```hcl
   # Keep everything in same region!
   region = "us-east-1"  # Frontend, backend, DB all here
   ```

2. **NAT Gateway:** $0.045/hour = ~$32/month
   ```hcl
   # ❌ Expensive for demos
   enable_nat_gateway = true  # ~$32/month

   # ✅ For student projects
   enable_nat_gateway = false  # Use public subnets
   ```

---

## 🚨 Hidden Costs That Surprised Us

### 1. Elastic IPs (When Not Attached)
**Cost:** $0.005/hour = **$3.60/month** per unattached IP

**Mistake:**
```bash
# Created Elastic IP
aws ec2 allocate-address

# Forgot to attach it → $3.60/month charge!
```

**Solution:**
- Only create IPs you immediately attach
- Or use Elastic Beanstalk's auto-assigned IPs

---

### 2. EBS Volumes (Stopped Instances)
**Cost:** **$0.10/GB-month** even when instance is stopped!

**Mistake:**
```bash
# Stopped instance to save money
aws ec2 stop-instances --instance-ids i-xxxxx

# ❌ Still paying for 20GB volume = $2/month
```

**Solution:**
- Create AMI (snapshot) before terminating
- Terminate instance fully when not needed
- Snapshots cost $0.05/GB (half the price of volumes)

---

### 3. RDS Snapshots
**Cost:** $0.095/GB-month (manual snapshots)

**Mistake:**
```bash
# Created manual snapshot "just in case"
aws rds create-db-snapshot --db-snapshot-identifier backup-2025-01-01

# Left 5 snapshots → 5 × 20GB × $0.095 = $9.50/month
```

**Solution:**
- Use automated backups (FREE within 20GB)
- Delete old manual snapshots
```bash
aws rds delete-db-snapshot --db-snapshot-identifier old-backup
```

---

### 4. CloudWatch Logs
**Free Tier:**
- 5GB ingestion
- 5GB storage
- 3 dashboards

**Cost after limits:**
- Ingestion: $0.50/GB
- Storage: $0.03/GB

**Mistake:**
- Enabled detailed logging for everything
- 10GB logs/month = $5/month

**Solution:**
```hcl
# Only log errors, not INFO
log_level = "ERROR"

# Set retention policy
retention_in_days = 7  # Not forever!
```

---

### 5. Route 53 (Custom Domain)
**Cost:** $0.50/month per hosted zone
- NOT included in Free Tier
- Even if you don't use it!

**For students:**
- Use CloudFront default domain (free)
- Or use external DNS (Cloudflare = free)
- Only use Route 53 if you need AWS integration

---

## 💡 Best Practices for Free Tier

### 1. Set Billing Alarms FIRST
```bash
# Create SNS topic for alerts
aws sns create-topic --name billing-alerts

# Subscribe your email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:billing-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Create CloudWatch alarm for $1
aws cloudwatch put-metric-alarm \
  --alarm-name billing-alert-1usd \
  --alarm-description "Alert at $1 spend" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

**Set multiple thresholds:**
- $1 (warning)
- $5 (investigate)
- $10 (urgent!)

---

### 2. Tag Everything

```hcl
tags = {
  Project     = "flora"
  Environment = "production"
  ManagedBy   = "terraform"
  Purpose     = "student-project"
  Owner       = "lily@holbertonschool.com"
}
```

**Why?**
- AWS Cost Explorer can group by tags
- Easily identify what's costing money
- Helps with cleanup

---

### 3. Use Cost Explorer Weekly

```bash
# Check this week's costs
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-08 \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE

# Find most expensive service
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --query 'ResultsByTime[].Groups | [0]' \
  --output table
```

---

### 4. Schedule Auto-Shutdown

**⚠️ IMPORTANT: Dev environment ONLY - NEVER shutdown production!**

**For dev environment (if you have one):**
```bash
# Create Lambda to stop instances at midnight
# Use EventBridge to trigger Mon-Fri at 00:00 UTC

# Stop EC2
aws ec2 stop-instances --instance-ids i-xxxxx

# Scale down Elastic Beanstalk to 0 instances
aws elasticbeanstalk update-environment \
  --environment-name flora-dev \
  --option-settings Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=0
```

**Savings:** ~50% if you only run 12 hours/day

**❌ DO NOT auto-shutdown production environment:**
- Portfolio must be available 24/7 for recruiters
- Free Tier includes 750 hours/month = 24/7 for one instance
- After Free Tier: $7.50/month is worth keeping your portfolio online
- Missing one job opportunity costs more than years of AWS bills

**💡 For Flora:** You likely don't need a dev environment at all!
- Use Docker for local testing (`pnpm docker:dev:bg`)
- GitHub Actions tests before deployment
- See [FAQ.md](FAQ.md#question-1-do-we-really-need-a-dev-environment) for details

---

### 5. Right-Size Resources

```hcl
# ❌ Over-provisioned (expensive)
instance_type = "t3.medium"  # $30/month
allocated_storage = 100  # $10/month for 80GB extra

# ✅ Right-sized (free)
instance_type = "t3.micro"  # Free Tier
allocated_storage = 20  # Free Tier
```

**Test with load testing tools:**
```bash
# Check if t3.micro can handle load
ab -n 1000 -c 10 https://your-api.com/products

# If response time < 200ms, you don't need bigger instance
```

---

## 📊 Flora's Current Costs (Jan 2025)

After optimization:

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| EC2 (Elastic Beanstalk) | $0 | t3.micro, Single Instance ✅ |
| RDS | $0 | db.t3.micro, 20GB ✅ |
| S3 | $0 | < 5GB ✅ |
| CloudFront | $0 | < 1TB transfer ✅ |
| **TOTAL** | **$0** | **100% Free Tier** 🎉 |

**Before optimization (with Load Balancer):**
| Service | Monthly Cost |
|---------|--------------|
| Load Balancer | $18.00 |
| EC2 | $0 |
| RDS | $0 |
| **TOTAL** | **$18.00/month** |

**Savings: $18/month = $216/year!**

---

## 🗓️ Cleanup Checklist (Before Graduation)

If you're done with the project:

```bash
# 1. Export any data you need
aws rds create-db-snapshot \
  --db-instance-identifier flora-db \
  --db-snapshot-identifier final-backup

# 2. Download S3 files
aws s3 sync s3://flora-frontend-bucket ./backup/

# 3. Destroy Terraform infrastructure
cd terraform/environments/prod
terraform destroy

# 4. Delete manual snapshots
aws rds delete-db-snapshot --db-snapshot-identifier final-backup

# 5. Release Elastic IPs
aws ec2 describe-addresses
aws ec2 release-address --allocation-id eipalloc-xxxxx

# 6. Empty S3 buckets (terraform destroy won't delete non-empty buckets)
aws s3 rm s3://flora-frontend-bucket --recursive

# 7. Check for orphaned resources
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=flora

# 8. Verify $0 bill next month!
```

---

## 🎯 Pro Tips for Interviews

When discussing Flora in interviews:

✅ **Good:**
- "We optimized costs by switching from Load Balancer to single instance, saving $18/month"
- "Used Terraform modules for reusable, cost-effective infrastructure"
- "Monitored AWS costs weekly and stayed within Free Tier"

❌ **Avoid:**
- "We didn't think about costs" (shows lack of production awareness)
- "We used the most expensive services" (shows poor resource management)
- "AWS charged us unexpectedly" (shows lack of monitoring)

**Example Story:**
> "When deploying Flora, we initially used an Application Load Balancer, which cost $18/month—outside our Free Tier budget. After analyzing our traffic patterns and realizing we had < 100 concurrent users, I refactored the Terraform config to use a single t3.micro instance instead. This reduced our monthly AWS bill to $0 while maintaining performance. I documented this decision in our infrastructure guide to help future students avoid the same mistake."

**Interviewers love:**
- Cost awareness
- Monitoring and optimization
- Learning from mistakes
- Documentation

---

## 📚 Resources

- [AWS Free Tier Details](https://aws.amazon.com/free/)
- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Cost Management](https://aws.amazon.com/aws-cost-management/)
- [AWS Trusted Advisor](https://aws.amazon.com/premiumsupport/technology/trusted-advisor/) (Free Tier checks)

---

**Remember:** The best AWS cost is **$0**! 🎯

Questions? Check our other guides:
- [SETUP.md](SETUP.md) - Fresh infrastructure setup
- [IMPORT.md](IMPORT.md) - Import existing resources
