# Supabase Database Setup (Quick Reference)

> **Quick migration guide - no backup needed, just migrations + seed!**

## Step 1: Create Supabase Project (5 minutes)

1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub (free, no credit card required)
3. Click "New Project"
4. Fill in details:
   - **Organization**: Create new or use existing
   - **Project Name**: `flora-marketplace`
   - **Database Password**: Generate a strong password (SAVE THIS!)
   - **Region**: Sydney (ap-southeast-2) - closest to Melbourne
   - **Pricing Plan**: Free (500MB database, 50MB file storage)
5. Click "Create new project"
6. Wait 2-3 minutes for provisioning

## Step 2: Get Connection String (2 minutes)

1. In Supabase dashboard, go to **Settings** → **Database**
2. Scroll to "Connection string"
3. Select "**Session mode**" (NOT Transaction mode)
4. Copy the connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you set in Step 1

**Example**:
```bash
# Before (with placeholder):
postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklm.supabase.co:5432/postgres

# After (with actual password):
postgresql://postgres:MyStr0ngP@ssw0rd@db.abcdefghijklm.supabase.co:5432/postgres
```

## Step 3: Run Migrations (3 minutes)

This creates all the tables (Product, Order, User, etc.) in Supabase.

```bash
# Navigate to backend
cd /Users/lily/Build/holbertonschool-final_project_me/apps/backend

# Set connection string (replace with YOUR actual connection string)
export DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT-ID.supabase.co:5432/postgres"

# Run migrations
npx prisma migrate deploy

# Expected output:
# 6 migrations found in prisma/migrations
# Applying migration `20241120043006_init`
# Applying migration `20241123131457_add_delivery_tracking`
# ...
# The following migration(s) have been applied:
#   ✔ 20241120043006_init
#   ✔ 20241123131457_add_delivery_tracking
#   ...
```

## Step 4: Seed Database (2 minutes)

This populates the database with test data (products, users, categories).

```bash
# Same terminal as Step 3 (DATABASE_URL still set)
npx prisma db seed

# Expected output:
# Running seed command `tsx prisma/seed.ts` ...
# 🌱 Seeding database...
# ✅ Categories seeded
# ✅ Products seeded
# ✅ Delivery zones seeded
# ...
# 🎉 Database seeded successfully!
```

## Step 5: Verify Data (2 minutes)

Open Supabase dashboard and check:

1. Go to **Table Editor** (left sidebar)
2. Verify tables exist:
   - ✅ Product (should have ~20 products)
   - ✅ Category (should have 8 categories)
   - ✅ DeliveryZone (should have ~100 Melbourne postcodes)
   - ✅ User (should have 3 test users)
   - ✅ Order, OrderItem, Subscription, etc. (empty for now)

3. Click on **Product** table
4. Should see products like:
   - Red Rose Bouquet ($49.99)
   - Lavender Dreams ($44.99)
   - Tulip Garden ($39.99)

**✅ Database ready! Same data as local development.**

## Troubleshooting

### "Environment variable not found: DATABASE_URL"
```bash
# Make sure you exported DATABASE_URL first
export DATABASE_URL="postgresql://postgres:..."
echo $DATABASE_URL  # Should show your connection string
```

### "migration failed: ... already exists"
This means tables already exist. Options:
```bash
# Option 1: Reset database (deletes everything, then re-seeds)
npx prisma migrate reset

# Option 2: Just re-seed (keeps tables, updates data)
npx prisma db seed
```

### "Too many connections"
Supabase free tier allows 60 concurrent connections. Close other connections:
```bash
# If you have Docker running locally, stop it
pnpm docker:stop

# Or wait 1-2 minutes for idle connections to close
```

## Next Steps

After database is ready:
1. ✅ Sign up for Resend email service
2. ✅ Deploy backend to Render (with Supabase connection)
3. ✅ Deploy frontend to Vercel
4. ✅ Test end-to-end
5. ✅ Update Auth0/Stripe webhooks
6. ✅ Shutdown AWS

---

**Total time**: 10-15 minutes for complete database migration
**Cost**: $0 (Supabase free tier)
**Data**: Same as development (seed.ts)
