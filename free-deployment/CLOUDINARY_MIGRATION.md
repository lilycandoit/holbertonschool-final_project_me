# Cloudinary Migration Guide

## Overview
This guide walks you through migrating Flora's 20 product images from local storage to Cloudinary CDN with automatic optimization.

## Step 1: Get Cloudinary Credentials

1. **Sign up for Cloudinary** (Free tier - 25GB bandwidth/month):
   - Go to https://cloudinary.com/users/register_free
   - Or use your existing account at https://console.cloudinary.com/

2. **Get your credentials** from the dashboard:
   - Cloud Name (e.g., `dxxxxx`)
   - API Key (e.g., `123456789012345`)
   - API Secret (e.g., `abcdefghijklmnopqrstuvwxyz`)

3. **Add to environment variables**:
   ```bash
   # Add to apps/backend/.env
   CLOUDINARY_CLOUD_NAME=your_cloud_name_here
   CLOUDINARY_API_KEY=your_api_key_here
   CLOUDINARY_API_SECRET=your_api_secret_here
   ```

## Step 2: Rebuild Docker (Pick up new Cloudinary SDK)

```bash
# Full rebuild to include Cloudinary package
pnpm docker:dev:build

# Start services in background
pnpm docker:dev:bg
```

## Step 3: Run Migration Script

```bash
# Inside Docker container
docker exec -it flora-backend pnpm migrate:cloudinary
```

**What this does:**
1. ✅ Uploads 20 images to Cloudinary folder `flora/products`
2. ✅ Applies optimizations:
   - Max dimensions: 1200x1200px
   - Quality: auto (optimized for web)
   - Format: auto (WebP for modern browsers, fallback for older)
3. ✅ Updates database Product.imageUrl fields to Cloudinary URLs
4. ✅ Displays summary and sample URLs

**Expected output:**
```
🚀 Flora Image Migration to Cloudinary

☁️  Cloudinary Cloud: your_cloud_name
📁 Uploading to folder: flora/products

📤 Uploading Roses.jpg...
✅ Uploaded Roses.jpg -> https://res.cloudinary.com/...
📤 Uploading Tulips.jpg...
✅ Uploaded Tulips.jpg -> https://res.cloudinary.com/...
...

✨ Uploaded 20/20 images

📊 Updating database...
✅ Updated 1 product(s) with Roses.jpg
✅ Updated 1 product(s) with Tulips.jpg
...

📋 Migration Summary:
   Total images uploaded: 20
   Cloudinary folder: flora/products
   Database records updated: 20

✅ Migration complete!
```

## Step 4: Verify Migration

1. **Check Cloudinary dashboard**:
   - Go to https://console.cloudinary.com/pm/media-library/folders/flora/products
   - You should see all 20 images

2. **Check database**:
   ```bash
   docker exec -it flora-backend npx prisma studio
   ```
   - Open the Product model
   - Verify imageUrl fields now contain Cloudinary URLs like:
     `https://res.cloudinary.com/your_cloud/image/upload/v1234567890/flora/products/Roses.jpg`

3. **Test frontend**:
   ```bash
   # Start dev environment
   pnpm docker:dev:bg

   # Open browser
   open http://localhost:5173
   ```
   - Navigate to Products page
   - Verify images load correctly from Cloudinary

## Step 5: Update Deployment Environment Variables

Once migration is successful, add Cloudinary credentials to:

1. **Vercel** (for serverless backend deployment):
   - Go to project settings → Environment Variables
   - Add:
     - `CLOUDINARY_CLOUD_NAME`
     - `CLOUDINARY_API_KEY`
     - `CLOUDINARY_API_SECRET`

2. **Render** (backup deployment):
   - Go to project settings → Environment
   - Add the same three variables

## Troubleshooting

### "Missing Cloudinary credentials" error
- Make sure you added all three env vars to `apps/backend/.env`
- Restart Docker containers: `pnpm docker:dev:bg`

### "Images directory not found" error
- Check that `apps/backend/images/` exists
- Verify image files are present: `ls apps/backend/images/`

### Upload fails for specific images
- Check image file size (Cloudinary free tier: 10MB per image)
- Check file permissions
- Check Cloudinary quota (25GB bandwidth/month)

### Database update fails
- Verify Supabase connection string in `DATABASE_URL`
- Check that seed.ts has been run: `docker exec flora-backend pnpm db:seed`
- Verify imageUrl paths match exactly (e.g., `/images/Roses.jpg`)

## Cost Analysis

**Cloudinary Free Tier:**
- ✅ 25 GB bandwidth/month (plenty for demo project)
- ✅ Unlimited storage
- ✅ Unlimited transformations
- ✅ 25 monthly credits (~2,500 transformations)

**Current usage estimate:**
- 20 images × ~2MB each = ~40MB storage
- Demo traffic: ~10GB/month bandwidth (well within limits)

## Next Steps

After migration:
1. ✅ Images served from Cloudinary CDN (faster, global)
2. ✅ Automatic WebP conversion (smaller file sizes)
3. ✅ Automatic optimization (better performance)
4. ✅ Ready for multi-vendor uploads (future feature)

---

**Questions?** Check the main documentation or ask in the team chat!
