#!/bin/bash
# Flora Frontend Deployment Script for AWS S3 + CloudFront
# Uses Docker for consistent builds (matching project architecture)

set -e

echo "🚀 Flora Frontend Deployment Script"
echo "===================================="

# Check if we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Get outputs from Terraform
echo "📋 Getting infrastructure details from Terraform..."
S3_BUCKET=$(terraform output -raw frontend_s3_bucket 2>/dev/null)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null)
BACKEND_URL=$(terraform output -raw backend_api_url 2>/dev/null)

if [ -z "$S3_BUCKET" ] || [ -z "$CLOUDFRONT_ID" ] || [ -z "$BACKEND_URL" ]; then
  echo "❌ Error: Terraform outputs not found. Run 'terraform apply' first."
  exit 1
fi

echo "✅ S3 Bucket: $S3_BUCKET"
echo "✅ CloudFront ID: $CLOUDFRONT_ID"
echo "✅ Backend API: $BACKEND_URL"

# Navigate to frontend directory
echo ""
echo "🏗️  Building frontend with Docker..."
cd ../apps/frontend

# Set environment variables for build
export VITE_API_URL="${BACKEND_URL}/api"
export VITE_AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN:-dev-ijvur34mojpovh8e.us.auth0.com}"
export VITE_AUTH0_CLIENT_ID="${VITE_AUTH0_CLIENT_ID:-tegmEuc40IvXfYFDLIRnJmbsa1izkTVL}"
export VITE_AUTH0_AUDIENCE="${VITE_AUTH0_AUDIENCE:-https://flora-api.com}"

# Check for required VITE_STRIPE_PUBLISHABLE_KEY
if [ -z "$VITE_STRIPE_PUBLISHABLE_KEY" ]; then
  echo "⚠️  Warning: VITE_STRIPE_PUBLISHABLE_KEY not set. Set it before running:"
  echo "   export VITE_STRIPE_PUBLISHABLE_KEY='pk_test_...'"
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Build production bundle using Docker (consistent with project architecture)
echo "🐳 Building Docker image..."
docker build \
  --build-arg VITE_API_URL="$VITE_API_URL" \
  --build-arg VITE_AUTH0_DOMAIN="$VITE_AUTH0_DOMAIN" \
  --build-arg VITE_AUTH0_CLIENT_ID="$VITE_AUTH0_CLIENT_ID" \
  --build-arg VITE_AUTH0_AUDIENCE="$VITE_AUTH0_AUDIENCE" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="$VITE_STRIPE_PUBLISHABLE_KEY" \
  -t flora-frontend-production \
  -f Dockerfile \
  ../../

# Extract dist folder from Docker image
echo "📤 Extracting production build from Docker image..."
docker create --name flora-frontend-temp flora-frontend-production
docker cp flora-frontend-temp:/app/apps/frontend/dist ./dist-aws
docker rm flora-frontend-temp

# Verify build output
if [ ! -d "dist-aws" ] || [ ! -f "dist-aws/index.html" ]; then
  echo "❌ Error: Build failed - dist-aws/index.html not found"
  exit 1
fi

echo "✅ Build successful"
echo ""
echo "☁️  Uploading to S3..."

# Upload with optimized cache headers
# - Static assets (JS/CSS/images): Cache for 1 year
# - index.html: No cache (always fetch latest)
aws s3 sync dist-aws/ s3://$S3_BUCKET/ \
  --delete \
  --cache-control "public, max-age=31536000"

# Override cache for index.html (needs to be fresh)
aws s3 cp s3://$S3_BUCKET/index.html s3://$S3_BUCKET/index.html \
  --metadata-directive REPLACE \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html"

echo "✅ Upload complete"
echo ""
echo "🔄 Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_ID \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "✅ Invalidation created: $INVALIDATION_ID"

# Cleanup
rm -rf dist-aws

CLOUDFRONT_DOMAIN=$(cd ../../terraform && terraform output -raw cloudfront_domain)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Frontend deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Production URL: https://$CLOUDFRONT_DOMAIN"
echo "🔧 Backend API:    $BACKEND_URL"
echo ""
echo "⏱️  Note: CloudFront cache invalidation takes 1-3 minutes to propagate globally"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
