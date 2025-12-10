# 🚨 EMERGENCY MIGRATION - $6.80 Credit Left

> **Quick migration from AWS to 100% free stack (Vercel + Render + Supabase)**

**Timeline:** Complete in 1-2 days (parallel deployment, zero downtime)

---

## Current Situation

- 💰 AWS Credit: $6.80 remaining
- 🌐 Production: https://d1fgjrmf4cfwou.cloudfront.net (working)
- ⏰ Action needed: Migrate NOW to avoid charges

---

## Strategy: Parallel Deployment (Zero Downtime)

```
┌────────────────────────────────────────────────┐
│ Step 1: Keep AWS Running                      │
│ ✅ Current production stays live              │
│ ✅ Users unaffected                            │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ Step 2: Deploy New Free Stack                 │
│ 🆓 Set up Supabase, Render, Vercel           │
│ 🆓 Test thoroughly on new URLs                │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ Step 3: Switch Traffic (5 minutes)            │
│ 🔄 Update Auth0 callback URLs                 │
│ 🔄 Update Stripe webhooks                     │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ Step 4: Shutdown AWS (Save $$)                │
│ 🛑 terraform destroy                           │
│ ✅ $0/month forever                            │
└────────────────────────────────────────────────┘
```

**Two production URLs during migration:**
- AWS: `https://d1fgjrmf4cfwou.cloudfront.net` (old, stays live)
- Vercel: `https://flora-YOUR-PROJECT.vercel.app` (new, testing)

---

## Day 1: Export & Deploy New Stack (3-4 hours)

### Hour 1: Database Export & Supabase Setup

#### 1.1 Export from AWS RDS (15 min)

```bash
# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier flora-db \
  --query "DBInstances[0].Endpoint.Address" \
  --output text

# Save output: flora-db.cby466u0m5jp.ap-southeast-2.rds.amazonaws.com

# Get database password
aws ssm get-parameter \
  --name "/flora/production/database_password" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text

# Export database (replace ENDPOINT and PASSWORD)
PGPASSWORD='YOUR-PASSWORD' pg_dump \
  -h YOUR-RDS-ENDPOINT.rds.amazonaws.com \
  -U flora_admin \
  -d flora_db \
  --no-owner \
  --no-acl \
  -f flora_backup_$(date +%Y%m%d).sql

# Verify backup created
ls -lh flora_backup_*.sql
# Should show file size (5-20MB)
```

**⚠️ CRITICAL:** Do this FIRST before credits run out!

#### 1.2 Create Supabase Project (10 min)

1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub (free, no CC)
3. New Project:
   - Name: `flora-marketplace`
   - Database Password: (set strong password, save it!)
   - Region: **Sydney** (closest to Melbourne)
4. Wait 2-3 minutes for project creation

#### 1.3 Import to Supabase (10 min)

```bash
# Get connection string from Supabase Dashboard
# Settings → Database → Connection string (Session mode)
# Example: postgresql://postgres:[PASSWORD]@db.PROJECT.supabase.co:5432/postgres

# Import backup
psql "postgresql://postgres:YOUR-SUPABASE-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" \
  < flora_backup_20251209.sql

# Verify import
psql "postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" \
  -c "\dt"

# Should show tables: Product, Order, User, etc.

# Check data counts
psql "postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM \"Product\";"
psql "postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM \"User\";"
psql "postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM \"Order\";"
```

**✅ Checkpoint:** Database migrated, data verified

---

### Hour 2: Email Service Setup

#### 2.1 Sign Up for Resend (5 min)

1. Go to [resend.com](https://resend.com)
2. Sign up with GitHub (no CC required)
3. Dashboard → API Keys → Create
4. Copy API key (starts with `re_...`)
5. Save securely

**✅ Checkpoint:** Email service ready

---

### Hour 3: Deploy Backend to Render

#### 3.1 Prepare Environment Variables (10 min)

**Create a file:** `render-env-vars.txt` (DON'T commit this!)

```bash
# Database
DATABASE_URL=postgresql://postgres:YOUR-SUPABASE-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres

# Auth0 (get from AWS SSM)
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id

# Stripe (get from AWS SSM)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Gemini AI (get from AWS SSM)
GEMINI_API_KEY=AIza...

# Email (Resend)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_your_api_key_here

# Frontend URL (will update after Vercel deploy)
FRONTEND_URL=http://localhost:5173

# Port
PORT=3001
```

**Get AWS SSM values:**
```bash
# Auth0
aws ssm get-parameter --name "/flora/production/auth0_client_secret" --with-decryption --query "Parameter.Value" --output text

# Stripe
aws ssm get-parameter --name "/flora/production/stripe_secret_key" --with-decryption --query "Parameter.Value" --output text
aws ssm get-parameter --name "/flora/production/stripe_webhook_secret" --with-decryption --query "Parameter.Value" --output text

# Gemini
aws ssm get-parameter --name "/flora/production/gemini_api_key" --with-decryption --query "Parameter.Value" --output text
```

#### 3.2 Deploy to Render (20 min)

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. New → Web Service
4. Connect GitHub repository: `holbertonschool-final_project_me`
5. Configure:
   - **Name:** `flora-backend`
   - **Region:** Singapore
   - **Branch:** `li-dev` (or main)
   - **Root Directory:** (leave empty)
   - **Environment:** Docker
   - **Dockerfile Path:** `./apps/backend/Dockerfile`
   - **Docker Build Context:** `.`
   - **Docker Command:** (leave empty)
   - **Plan:** Free

6. Environment Variables:
   - Copy all from `render-env-vars.txt`
   - Add one by one (or bulk add if available)

7. Create Web Service
8. Wait for deploy (~5-10 minutes)
9. Get URL: `https://flora-backend.onrender.com`

#### 3.3 Test Backend (5 min)

```bash
# Health check
curl https://flora-backend.onrender.com/health

# Expected: {"status":"ok"}

# Get products
curl https://flora-backend.onrender.com/api/products | jq '.[0]'

# Should return first product with data from Supabase
```

**✅ Checkpoint:** Backend deployed and connected to Supabase

---

### Hour 4: Deploy Frontend to Vercel

#### 4.1 Deploy to Vercel (15 min)

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Import Project → Select repository
4. Configure:
   - **Framework:** Vite
   - **Root Directory:** `apps/frontend`
   - **Build Command:** `cd ../.. && pnpm install && pnpm --filter frontend build`
   - **Output Directory:** `apps/frontend/dist`
   - **Install Command:** `pnpm install`

5. Environment Variables (add these):
   ```
   VITE_API_URL=https://flora-backend.onrender.com/api
   VITE_AUTH0_DOMAIN=your-domain.auth0.com
   VITE_AUTH0_CLIENT_ID=your-client-id
   VITE_AUTH0_AUDIENCE=https://flora-marketplace-api
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

6. Deploy
7. Wait for deploy (~3-5 minutes)
8. Get URL: `https://flora-YOUR-PROJECT.vercel.app`

#### 4.2 Update Backend CORS (5 min)

**Update Render environment variables:**
```
FRONTEND_URL=https://flora-YOUR-PROJECT.vercel.app
```

This will trigger automatic redeploy (~5 min)

**✅ Checkpoint:** Frontend deployed

---

## Day 2: Testing & Cutover (2-3 hours)

### Hour 1: Test New Stack

#### Test Checklist (30 min)

**Visit:** `https://flora-YOUR-PROJECT.vercel.app`

- [ ] Frontend loads correctly
- [ ] Images load (from Supabase or S3)
- [ ] Products display with correct data
- [ ] Search and filtering work
- [ ] Login with Auth0 ⚠️ (won't work yet - see below)
- [ ] Guest checkout (test without login)
- [ ] Add to cart
- [ ] View cart
- [ ] **DON'T test full checkout yet** (Stripe not configured)

**Expected issues at this stage:**
- ❌ Login fails (Auth0 not configured for new URL)
- ❌ Checkout fails (Stripe webhooks point to AWS)

**This is normal!** We'll fix in next step.

---

### Hour 2: Update Auth0 & Stripe (Switch Traffic)

#### 2.1 Update Auth0 (10 min)

1. Go to [Auth0 Dashboard](https://manage.auth0.com)
2. Applications → Flora
3. **Add** new URLs (don't remove AWS yet):

   **Allowed Callback URLs:**
   ```
   http://localhost:5173/callback,
   https://d1fgjrmf4cfwou.cloudfront.net/callback,
   https://flora-YOUR-PROJECT.vercel.app/callback
   ```

   **Allowed Logout URLs:**
   ```
   http://localhost:5173,
   https://d1fgjrmf4cfwou.cloudfront.net,
   https://flora-YOUR-PROJECT.vercel.app
   ```

   **Allowed Web Origins:**
   ```
   http://localhost:5173,
   https://d1fgjrmf4cfwou.cloudfront.net,
   https://flora-YOUR-PROJECT.vercel.app
   ```

4. Save Changes

**✅ Now login works on BOTH platforms!**

#### 2.2 Update Stripe Webhooks (10 min)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Developers → Webhooks
3. **Add endpoint** (keep AWS endpoint for now):
   - **URL:** `https://flora-backend.onrender.com/api/webhooks/stripe`
   - **Events:** `checkout.session.completed`, `payment_intent.succeeded`
4. Copy webhook signing secret (starts with `whsec_...`)
5. Update Render environment variable:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_NEW_SECRET
   ```
6. Wait for Render redeploy

**✅ Now both platforms can receive Stripe webhooks!**

---

### Hour 3: Final Testing & AWS Shutdown

#### 3.1 Complete End-to-End Test (20 min)

**On Vercel URL:** `https://flora-YOUR-PROJECT.vercel.app`

- [ ] Login with Auth0 ✅
- [ ] Browse products ✅
- [ ] Add to cart ✅
- [ ] Full checkout with Stripe test card ✅
  - Card: `4242 4242 4242 4242`
  - Expiry: Any future date
  - CVC: Any 3 digits
- [ ] Order confirmation shows ✅
- [ ] Email received (check Resend dashboard) ✅
- [ ] Order appears in Supabase database ✅

**If all checks pass:** New stack is working perfectly! ✅

#### 3.2 Shutdown AWS (10 min)

```bash
# Final database backup (optional)
PGPASSWORD='YOUR-PASSWORD' pg_dump \
  -h YOUR-RDS-ENDPOINT \
  -U flora_admin \
  -d flora_db \
  -f flora_final_backup.sql

# Terraform destroy
cd terraform/environments/prod
terraform destroy

# Type 'yes' to confirm

# Wait 5-10 minutes

# Delete snapshots
aws rds delete-db-snapshot --db-snapshot-identifier flora-final-snapshot

# Delete CloudWatch logs
aws logs describe-log-groups \
  --query "logGroups[?contains(logGroupName, 'flora')].logGroupName" \
  --output text | \
  xargs -n1 aws logs delete-log-group --log-group-name

# Verify $0 charges
# AWS Console → Billing → Cost Explorer
```

#### 3.3 Update Documentation (5 min)

**Update README.md:**
```markdown
**Live URL**: https://flora-YOUR-PROJECT.vercel.app
**Backend API**: https://flora-backend.onrender.com
```

**Remove from Auth0/Stripe:**
- Remove AWS CloudFront URLs (no longer needed)
- Keep only Vercel + localhost

---

## Quick Reference Commands

### Database Export (Critical - Do First!)
```bash
PGPASSWORD=$(aws ssm get-parameter --name "/flora/production/database_password" --with-decryption --query "Parameter.Value" --output text) \
pg_dump -h $(aws rds describe-db-instances --db-instance-identifier flora-db --query "DBInstances[0].Endpoint.Address" --output text) \
-U flora_admin -d flora_db --no-owner --no-acl -f flora_backup.sql
```

### Database Import to Supabase
```bash
psql "postgresql://postgres:SUPABASE-PASSWORD@db.PROJECT.supabase.co:5432/postgres" < flora_backup.sql
```

### Test New Stack
```bash
# Backend health
curl https://flora-backend.onrender.com/health

# Frontend
open https://flora-YOUR-PROJECT.vercel.app
```

### Shutdown AWS
```bash
cd terraform/environments/prod && terraform destroy
```

---

## Cost Savings

| Platform | Before (AWS) | After (Free) | Savings |
|----------|--------------|--------------|---------|
| **Frontend** | $1/month | $0 | $1/month |
| **Backend** | $7.50/month | $0 | $7.50/month |
| **Database** | $13/month | $0 | $13/month |
| **Email** | Included in AWS | $0 | $0 |
| **TOTAL** | **$21.50/month** | **$0/month** | **$21.50/month** |
| **Annual** | **$258/year** | **$0/year** | **$258/year** ✅ |

---

## Rollback Plan (If Something Goes Wrong)

**If new stack has issues:**

1. **Keep using AWS** (it's still running during migration)
2. **Debug new stack** without time pressure
3. **AWS won't be shut down** until you confirm new stack works
4. **You have time** to fix issues before credits run out

**This is why parallel deployment is safe!** ✅

---

## Support Services

- **Supabase:** [Discord](https://discord.supabase.com)
- **Render:** [Discord](https://discord.gg/render)
- **Vercel:** [Discord](https://vercel.com/discord)
- **Resend:** [Discord](https://resend.com/discord)

---

## Success Checklist

- [ ] Database exported from AWS ✅
- [ ] Supabase project created ✅
- [ ] Database imported to Supabase ✅
- [ ] Resend email service set up ✅
- [ ] Backend deployed to Render ✅
- [ ] Frontend deployed to Vercel ✅
- [ ] Auth0 updated with new URLs ✅
- [ ] Stripe webhooks configured ✅
- [ ] End-to-end test passed ✅
- [ ] AWS shutdown complete ✅
- [ ] $0 charges verified ✅

---

**Time commitment:** 4-6 hours spread over 1-2 days
**Downtime:** Zero (parallel deployment)
**Result:** Free hosting forever

**Start with Hour 1 (database export) NOW!** ⏰

---

**Related Docs:**
- [MIGRATION_TO_FREE_TIER.md](terraform/docs/MIGRATION_TO_FREE_TIER.md) - Detailed guide
- [FREE_EMAIL_SERVICES.md](terraform/docs/FREE_EMAIL_SERVICES.md) - Email setup
- [SHUTDOWN.md](terraform/docs/SHUTDOWN.md) - AWS cleanup

---

**Flora Team:** Lily (Solo Post-Graduation) | **Holberton Final Project 2025**
