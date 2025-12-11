# 🚀 Flora Backend Deployment Quick Reference

## Pre-Deployment Setup ✅

- [x] Supabase database with Transaction Pooler
- [x] Cloudinary image hosting configured
- [x] Backend adapted for Vercel Serverless
- [x] All images migrated to Cloudinary
- [x] Local testing completed

## Deploy Backend to Vercel

### Method 1: Vercel Dashboard (Easiest)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "feat: prepare backend for Vercel Serverless"
   git push origin main
   ```

2. **Import to Vercel:**
   - Go to: https://vercel.com/new
   - Select repository: `holbertonschool-final_project_me`
   - Framework: **Other**
   - Root Directory: `apps/backend`
   - Build Command: `pnpm install && pnpm --filter backend run build`
   - Install Command: `pnpm install`

3. **Add Environment Variables** (copy from `.env`):
   ```
   DATABASE_URL (Supabase pooler URL)
   AUTH0_DOMAIN
   AUTH0_CLIENT_ID
   AUTH0_CLIENT_SECRET
   STRIPE_SECRET_KEY
   STRIPE_WEBHOOK_SECRET (temporary, will update)
   RESEND_API_KEY
   FROM_EMAIL
   CONTACT_EMAIL
   CLOUDINARY_CLOUD_NAME
   CLOUDINARY_API_KEY
   CLOUDINARY_API_SECRET
   GEMINI_API_KEY
   GOOGLE_MAPS_API_KEY
   SENDLE_API_ID
   SENDLE_API_KEY
   SENDLE_SANDBOX_MODE=true
   SENDLE_PICKUP_SUBURB=Melbourne
   SENDLE_PICKUP_POSTCODE=3000
   ENABLE_GOOGLE_DISTANCE=false
   ENABLE_SENDLE_QUOTES=false
   ENABLE_SENDLE_TRACKING=false
   DELIVERY_ORIGIN_LAT=-37.8136
   DELIVERY_ORIGIN_LNG=144.9631
   MAX_DELIVERY_DISTANCE_KM=50
   FRONTEND_URL (will update later)
   NODE_ENV=production
   ```

4. **Deploy!**
   - Click "Deploy"
   - Wait ~2-3 minutes
   - **Copy your backend URL** (e.g., `https://flora-backend-xyz.vercel.app`)

### Method 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from backend directory
cd apps/backend
vercel --prod

# Add environment variables one by one
vercel env add DATABASE_URL production
vercel env add AUTH0_DOMAIN production
# ... (repeat for all)

# Redeploy with env vars
vercel --prod
```

## Post-Deployment Verification

### Test Endpoints:
```bash
# Replace YOUR_URL with actual Vercel URL

# Health check
curl https://YOUR_URL.vercel.app/api/health

# Products (should show Cloudinary images)
curl https://YOUR_URL.vercel.app/api/products

# Root (API docs)
curl https://YOUR_URL.vercel.app/
```

### Expected Results:
- ✅ Health check returns `{"status": "healthy"}`
- ✅ Products return array with Cloudinary image URLs
- ✅ All endpoints respond within 1-3 seconds

## Update Stripe Webhook (CRITICAL!)

1. **Go to Stripe Dashboard:**
   - https://dashboard.stripe.com/webhooks

2. **Create New Endpoint:**
   - URL: `https://YOUR_URL.vercel.app/api/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

3. **Copy Signing Secret** (starts with `whsec_...`)

4. **Update Vercel Environment Variable:**
   ```bash
   # Via CLI
   vercel env rm STRIPE_WEBHOOK_SECRET production
   vercel env add STRIPE_WEBHOOK_SECRET production
   # (paste new secret)
   vercel --prod

   # OR via Dashboard
   # Settings → Environment Variables → Edit STRIPE_WEBHOOK_SECRET
   ```

## Update Frontend

1. **Update `VITE_API_URL`:**
   ```bash
   # In Vercel frontend project settings
   # Environment Variables → VITE_API_URL
   # Set to: https://YOUR_BACKEND_URL.vercel.app
   ```

2. **Redeploy frontend:**
   - Vercel auto-deploys on git push
   - OR click "Redeploy" in dashboard

## Test Complete Flow

1. ✅ Browse products (images from Cloudinary)
2. ✅ Add to cart
3. ✅ Guest checkout
4. ✅ Stripe payment
5. ✅ Order confirmation email (via Resend)
6. ✅ Order appears in database

## Update External Services

### Auth0:
- Allowed Callback URLs: Add `https://YOUR_FRONTEND.vercel.app`
- Allowed Logout URLs: Add `https://YOUR_FRONTEND.vercel.app`
- Allowed Web Origins: Add `https://YOUR_FRONTEND.vercel.app`

### Stripe:
- ✅ Webhook already updated

## Shutdown AWS (Final Step)

```bash
# Navigate to terraform directory
cd terraform

# Destroy AWS infrastructure
terraform destroy

# Confirm: yes
```

**Cost savings:** ~$50-100/month → $0/month ✅

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 504 Timeout | Check DATABASE_URL uses pooler (port 6543) |
| CORS Error | Update FRONTEND_URL in backend env vars |
| Stripe Webhook Fails | Verify STRIPE_WEBHOOK_SECRET matches Stripe dashboard |
| Prisma Error | Verify postinstall script in package.json |
| Images Don't Load | Check CLOUDINARY_* env vars |

---

## Resources

- 📖 Full Guide: `docs/VERCEL_DEPLOYMENT.md`
- 📖 Cloudinary: `docs/CLOUDINARY_MIGRATION.md`
- 📖 Database: `docs/DATABASE.md`
- 🔧 Vercel CLI: `vercel --help`
- 📊 Vercel Dashboard: https://vercel.com/dashboard

---

**Ready to deploy?** Follow the steps above in order! 🚀
