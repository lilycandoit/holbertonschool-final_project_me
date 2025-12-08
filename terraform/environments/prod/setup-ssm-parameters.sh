#!/bin/bash
# Setup SSM Parameters for Flora Production Environment
# This stores sensitive configuration in AWS Systems Manager Parameter Store
#
# Usage:
#   export AUTH0_CLIENT_SECRET="your-secret"
#   export STRIPE_SECRET_KEY="sk_test_..."
#   export STRIPE_WEBHOOK_SECRET="whsec_..."
#   export GEMINI_API_KEY="AIza..."
#   ./setup-ssm-parameters.sh

set -e

echo "🔐 Creating SSM Parameters for Flora Production..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to create or update parameter
create_parameter() {
    local name=$1
    local value=$2
    local description=$3

    echo -e "${YELLOW}Creating: $name${NC}"

    # Try to create the parameter
    if aws ssm put-parameter \
        --name "$name" \
        --value "$value" \
        --type "SecureString" \
        --description "$description" \
        --region ap-southeast-2 \
        --overwrite 2>&1 | grep -q "Version"; then
        echo -e "${GREEN}✓ Created/Updated: $name${NC}"
    else
        echo -e "⚠️  Warning: Failed to create $name"
    fi
    echo ""
}

# Database Password (extracted from DATABASE_URL)
create_parameter \
    "/flora/production/database_password" \
    "Flora2025-DemoDay!" \
    "PostgreSQL database password for production"

# Auth0 Client Secret
create_parameter \
    "/flora/production/auth0_client_secret" \
    "${AUTH0_CLIENT_SECRET}" \
    "Auth0 client secret for production"

# Stripe Secret Key
create_parameter \
    "/flora/production/stripe_secret_key" \
    "${STRIPE_SECRET_KEY}" \
    "Stripe API secret key for production"

# Stripe Webhook Secret
create_parameter \
    "/flora/production/stripe_webhook_secret" \
    "${STRIPE_WEBHOOK_SECRET}" \
    "Stripe webhook signing secret for production"

# Gemini API Key
create_parameter \
    "/flora/production/gemini_api_key" \
    "${GEMINI_API_KEY}" \
    "Google Gemini AI API key for production"

# SMTP User
create_parameter \
    "/flora/production/smtp_user" \
    "10430@holbertonstudents.com" \
    "SMTP username for email sending"

# SMTP Password
create_parameter \
    "/flora/production/smtp_pass" \
    "jvzskcqdbogfpvpg" \
    "SMTP password for email sending"

echo "=========================================="
echo -e "${GREEN}✓ All SSM parameters created!${NC}"
echo "=========================================="
echo ""
echo "To verify, run:"
echo "  aws ssm get-parameters-by-path --path /flora/production --region ap-southeast-2 --query 'Parameters[*].Name'"
echo ""
