# 💰 Flora Terraform Cost Audit

> **Comparison of current configuration against AWS_COST_TIPS.md recommendations**

Last Updated: January 9, 2025

---

## ✅ COMPLIANT (Following Best Practices)

### 1. Elastic Beanstalk - Single Instance ✅
**Recommendation:** Use SingleInstance (no Load Balancer)
**Current Config:** `elastic_beanstalk/main.tf:70`
```hcl
value = "SingleInstance"  ✅
```
**Savings:** $18-22/month vs Load Balanced
**Status:** ✅ PERFECT

---

### 2. Instance Type - t3.micro ✅
**Recommendation:** Use t3.micro (Free Tier eligible)
**Current Config:** `elastic_beanstalk/main.tf:73-78`
```hcl
setting {
  namespace = "aws:autoscaling:launchconfiguration"
  name      = "InstanceType"
  value     = "t3.micro"  ✅
}
```
**Status:** ✅ COMPLIANT (Free Tier)
**Benefit:** Explicitly set, won't change with Elastic Beanstalk updates

---

### 3. RDS Database - db.t3.micro ✅
**Recommendation:** db.t3.micro (Free Tier)
**Current Config:** `rds/main.tf:41`
```hcl
instance_class = "db.t3.micro"  ✅
```
**Status:** ✅ COMPLIANT (Free Tier)

---

### 4. RDS Storage - 20GB gp3 ✅
**Recommendation:** 20GB max, gp3 (faster & cheaper)
**Current Config:** `rds/main.tf:43-47`
```hcl
allocated_storage     = 20    ✅
max_allocated_storage = 0     ✅ (no auto-scaling)
storage_type          = "gp3" ✅
storage_throughput    = 125   ✅
iops                  = 3000  ✅
```
**Status:** ✅ OPTIMIZED (Free Tier + 20% cheaper than gp2)

---

### 5. RDS Multi-AZ Disabled ✅
**Recommendation:** Disable Multi-AZ (doubles cost)
**Current Config:** Not set (defaults to `false`)
**Status:** ✅ COMPLIANT (Free Tier)

> **Improvement:** Add explicit setting for clarity:
> ```hcl
> multi_az = false  # Free Tier requirement
> ```

---

### 6. RDS Backup Retention ✅
**Recommendation:** 7 days max (Free Tier limit)
**Current Config:** `rds/main.tf:56`
```hcl
backup_retention_period = 7  ✅
```
**Status:** ✅ COMPLIANT (Free Tier)

---

### 7. CloudFront Price Class ✅
**Recommendation:** PriceClass_100 (North America + Europe only)
**Current Config:** `elastic_beanstalk/main.tf:137`
```hcl
price_class = "PriceClass_100"  ✅
```
**Status:** ✅ COMPLIANT (Cost-optimized)

---

### 8. Health Reporting - Basic ✅
**Recommendation:** Use basic (enhanced requires Load Balancer)
**Current Config:** `elastic_beanstalk/main.tf:77`
```hcl
value = "basic"  ✅
```
**Status:** ✅ COMPLIANT

---

### 9. Tagging Strategy ✅
**Recommendation:** Tag everything for cost tracking
**Current Config:** `prod/main.tf:25-32`
```hcl
default_tags {
  tags = {
    Project     = "Flora Marketplace"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Team        = "Holberton Final Project"
  }
}
```
**Status:** ✅ COMPLIANT

---

## ⚠️ AREAS FOR IMPROVEMENT

### 1. RDS Storage Encryption ✅
**Recommendation:** Enable encryption (free, best practice)
**Current Config:** `rds/main.tf:48`
```hcl
storage_encrypted = true  # FREE, no extra cost ✅
```
**Status:** ✅ ENABLED
**Benefit:** Data at rest is encrypted with no performance impact or additional cost

---

### 2. RDS Final Snapshot ✅
**Recommendation:** Create final snapshot before destroy (safety)
**Current Config:** `rds/main.tf:60-61`
```hcl
skip_final_snapshot       = false  ✅
final_snapshot_identifier = "flora-final-snapshot"  ✅
```
**Status:** ✅ ENABLED
**Benefit:** Database data is protected! Running `terraform destroy` will create a backup snapshot first

---

### 3. Instance Type Explicit ✅
**Recommendation:** Explicitly set instance type (don't rely on defaults)
**Current Config:** `elastic_beanstalk/main.tf:73-78`
```hcl
setting {
  namespace = "aws:autoscaling:launchconfiguration"
  name      = "InstanceType"
  value     = "t3.micro"  ✅
}
```
**Status:** ✅ COMPLIANT
**Benefit:** Ensures Free Tier instance type won't change with Elastic Beanstalk platform updates

---

### 4. No Billing Alerts in Terraform ⚠️
**Recommendation:** Set up billing alarms
**Current Config:** Not managed by Terraform
**Status:** ⚠️ MANUAL SETUP REQUIRED
**Fix:** Add to `prod/main.tf`:
```hcl
resource "aws_cloudwatch_metric_alarm" "billing_alert" {
  alarm_name          = "flora-billing-alert-5usd"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 21600  # 6 hours
  statistic           = "Maximum"
  threshold           = 5
  alarm_description   = "Alert when estimated charges exceed $5"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
}

resource "aws_sns_topic" "billing_alerts" {
  name = "flora-billing-alerts"
}

resource "aws_sns_topic_subscription" "billing_email" {
  topic_arn = aws_sns_topic.billing_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
```

---

### 5. RDS Storage Type - gp3 ✅
**Recommendation:** gp3 is cheaper and faster than gp2
**Current Config:** `rds/main.tf:45-47`
```hcl
storage_type       = "gp3"   # 20% cheaper, faster ✅
storage_throughput = 125     # Free tier baseline ✅
iops               = 3000    # Free tier baseline ✅
```
**Status:** ✅ OPTIMIZED
**Benefit:** 20% cheaper than gp2 + better performance at same Free Tier cost

---

## 🚫 COST TRAPS SUCCESSFULLY AVOIDED

### ✅ No Load Balancer
**Savings:** $18-22/month

### ✅ No NAT Gateway
**Savings:** ~$32/month

### ✅ No Elastic IPs (unattached)
**Savings:** $3.60/month per IP

### ✅ No Multi-AZ RDS
**Savings:** Would double RDS cost (~$15/month)

### ✅ No oversized instances
**Savings:** t3.small would cost ~$15/month extra

---

## 💵 Estimated Monthly Cost

| Service | Config | Cost |
|---------|--------|------|
| EC2 (Elastic Beanstalk) | t3.micro SingleInstance | $0 (Free Tier) |
| RDS PostgreSQL | db.t3.micro, 20GB | $0 (Free Tier) |
| S3 Storage | < 5GB | $0 (Free Tier) |
| CloudFront | < 1TB transfer | $0 (Free Tier) |
| Data Transfer | < 100GB | $0 (Free Tier) |
| **TOTAL** | | **$0/month** ✅ |

**After Free Tier Expires (12 months):**
- EC2: $7.50/month (t3.micro 24/7)
- RDS: $13.00/month (db.t3.micro 24/7 + 20GB storage)
- S3: $0.12/month (~5GB)
- CloudFront: $1.00/month (low traffic)
- **TOTAL: ~$21.62/month**

---

## 📋 Action Items

### High Priority
- [ ] Enable RDS encryption (`storage_encrypted = true`)
- [ ] Disable final snapshot skip (`skip_final_snapshot = false`)
- [ ] Add explicit instance type setting

### Medium Priority
- [ ] Switch RDS to gp3 storage type
- [ ] Add billing alarms to Terraform
- [ ] Add Multi-AZ disable explicitly

### Low Priority (Optional)
- [ ] Add cost allocation tags by feature
- [ ] Set up AWS Cost Anomaly Detection

---

## 🎓 For Interviews

**Key Talking Points:**
1. "Reduced AWS costs from $18/month to $0 by switching from Load Balanced to SingleInstance environment"
2. "Carefully selected Free Tier eligible resources: t3.micro instances, db.t3.micro RDS, 20GB storage limits"
3. "Avoided common cost traps: NAT Gateways, Load Balancers, oversized instances"
4. "Set up comprehensive tagging strategy for cost tracking and AWS Cost Explorer analysis"

---

## 📚 References

- AWS Free Tier: https://aws.amazon.com/free/
- RDS Pricing: https://aws.amazon.com/rds/postgresql/pricing/
- EC2 Pricing: https://aws.amazon.com/ec2/pricing/
- CloudFront Pricing: https://aws.amazon.com/cloudfront/pricing/
