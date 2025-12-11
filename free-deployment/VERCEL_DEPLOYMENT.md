# Vercel Backend Deployment Guide

## Overview
Deploy Flora backend as Vercel Serverless Functions with automatic scaling and zero cold start costs.

## Pre-Deployment Checklist

✅ **Already Completed:**
- Supabase database with Transaction Pooler (serverless-ready)
- Cloudinary for image hosting (no static file serving needed)
- Resend HTTP API for emails (no SMTP)
- Backend adapted for serverless (app.ts + api/index.ts)

✅ **Required Environment Variables:**
```bash
# Database
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres

# Auth0
AUTH0_DOMAIN=your-auth0-domain
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret

# Stripe
STRIPE_SECRET_KEY=sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (will update after deployment)

# Resend Email
RESEND_API_KEY=re_...
FROM_EMAIL=onboarding@resend.dev
CONTACT_EMAIL=support@flora.com

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Google Distance Matrix (optional)
GOOGLE_MAPS_API_KEY=your_google_maps_key

# Sendle API (optional)
SENDLE_API_ID=your_sendle_api_id
SENDLE_API_KEY=your_sendle_api_key
SENDLE_SANDBOX_MODE=true
SENDLE_PICKUP_SUBURB=Melbourne
SENDLE_PICKUP_POSTCODE=3000

# Feature Flags
ENABLE_GOOGLE_DISTANCE=false
ENABLE_SENDLE_QUOTES=false
ENABLE_SENDLE_TRACKING=false

# Delivery Settings
DELIVERY_ORIGIN_LAT=-37.8136
DELIVERY_ORIGIN_LNG=144.9631
MAX_DELIVERY_DISTANCE_KM=50

# Frontend URL (update after deployment)
FRONTEND_URL=https://your-frontend.vercel.app

# Environment
NODE_ENV=production
```

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

```bash
# 1. Install Vercel CLI globally
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Navigate to backend directory
cd apps/backend

# 4. Deploy to preview (test first)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your Vercel account
# - Link to existing project? No
# - Project name? flora-backend
# - Directory? ./
# - Override settings? No

# 5. Add environment variables via CLI
vercel env add DATABASE_URL production
# (paste your Supabase pooler URL)

vercel env add AUTH0_DOMAIN production
# (paste your Auth0 domain)

# ... repeat for all environment variables ...

# 6. Deploy to production
vercel --prod

# 7. Copy the production URL (e.g., https://flora-backend.vercel.app)
```

### Option 2: Deploy via Vercel Dashboard (Easier for first-time)

```bash
# 1. Push your changes to GitHub
git add .
git commit -m "feat: adapt backend for Vercel Serverless"
git push origin main

# 2. Go to https://vercel.com/new

# 3. Import your GitHub repository
#    - Select: holbertonschool-final_project_me
#    - Framework Preset: Other
#    - Root Directory: apps/backend
#    - Build Command: pnpm install && pnpm --filter backend run build && npx prisma generate
#    - Output Directory: (leave empty)
#    - Install Command: pnpm install

# 4. Add Environment Variables
#    Click "Environment Variables" section
#    Add all variables from the checklist above
#    Set for: Production, Preview, and Development

# 5. Click "Deploy"

# 6. Wait for deployment (~2-3 minutes)

# 7. Get your backend URL
#    Example: https://flora-backend-xyz123.vercel.app
```

## Post-Deployment Verification

### 1. Test Health Endpoint
```bash
curl https://your-backend-url.vercel.app/api/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "message": "Flora API is running!",
  "timestamp": "2025-12-11T...",
  "environment": "production"
}
```

### 2. Test Products Endpoint
```bash
curl https://your-backend-url.vercel.app/api/products
```

**Should return:** Array of products with Cloudinary image URLs

### 3. Test Root Endpoint
```bash
curl https://your-backend-url.vercel.app/
```

**Should return:** API documentation with all endpoints

## Configure Stripe Webhook (Critical!)

After deployment, you MUST update the Stripe webhook URL:

```bash
# 1. Go to Stripe Dashboard
# https://dashboard.stripe.com/webhooks

# 2. Create new webhook endpoint
# URL: https://your-backend-url.vercel.app/api/webhooks/stripe
# Events to send:
#   - payment_intent.succeeded
#   - payment_intent.payment_failed
#   - charge.succeeded
#   - charge.failed

# 3. Copy the Signing Secret (whsec_...)

# 4. Update STRIPE_WEBHOOK_SECRET in Vercel
vercel env add STRIPE_WEBHOOK_SECRET production
# (paste the new signing secret)

# 5. Redeploy to apply new env var
vercel --prod
```

## Troubleshooting

### Build Fails: "Cannot find module 'prisma'"
**Solution:** Vercel build command includes `npx prisma generate` - this should fix it. If not, add to `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

### Runtime Error: "Cannot connect to database"
**Solution:** Verify `DATABASE_URL` uses Supabase **Transaction Pooler** (port 6543), NOT direct connection (port 5432)
```
✅ Correct: postgresql://...pooler.supabase.com:6543/postgres
❌ Wrong:   postgresql://...db.supabase.co:5432/postgres
```

### 504 Gateway Timeout
**Solution:**
- Check function execution time (max 30s for free tier)
- Optimize slow queries
- Consider upgrading to Pro plan for 60s timeout

### CORS Errors
**Solution:** Update `FRONTEND_URL` environment variable in Vercel to match your frontend URL

### Stripe Webhook Fails
**Solution:**
- Verify `STRIPE_WEBHOOK_SECRET` matches the webhook in Stripe Dashboard
- Check webhook URL matches exactly: `https://your-backend.vercel.app/api/webhooks/stripe`
- Test webhook in Stripe Dashboard "Send test webhook" button

### Cold Start Latency (2-3 seconds)
**Solution:**
- Expected behavior for serverless (acceptable for demo)
- Vercel Pro reduces cold starts
- Critical endpoints warm up automatically after first use

## Monitoring

### View Logs
```bash
# Real-time logs
vercel logs --follow

# Logs from production
vercel logs --prod

# Logs from specific function
vercel logs api/index.ts --prod
```

### View Analytics
- Go to Vercel Dashboard → Your Project → Analytics
- Monitor:
  - Request count
  - Error rate
  - P95 latency
  - Bandwidth usage

## Cost Estimate

**Vercel Free Tier:**
- ✅ 100GB bandwidth/month
- ✅ 100 GB-hours compute/month (~6,000 serverless invocations)
- ✅ Unlimited deployments

**Current usage estimate:**
- Flora demo traffic: ~20GB bandwidth/month
- API calls: ~1,000/month (well within limits)
- **Monthly cost: $0.00** ✅

## Next Steps

After successful deployment:
1. ✅ Copy backend URL: `https://your-backend.vercel.app`
2. ⏭️  Update frontend `VITE_API_URL` to use new backend
3. ⏭️  Test complete flow (products, checkout, email)
4. ⏭️  Update Auth0 allowed callback URLs
5. ⏭️  Shutdown AWS infrastructure

---

**Questions?** Check Vercel docs: https://vercel.com/docs
