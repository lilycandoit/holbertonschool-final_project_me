#!/bin/bash
# Setup SSM Parameters for Flora Production Environment
# This stores sensitive configuration in AWS Systems Manager Parameter Store

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
    "RT16bw-ELszHP9pYMPA6OiisMZpHZcK4ZzOs70VbtHkcIV98KzF7oRlVvUZ-yN4G" \
    "Auth0 client secret for production"

# Stripe Secret Key
create_parameter \
    "/flora/production/stripe_secret_key" \
    "sk_test_51S8ya1PtGaCvy8FqNNCUxYi6uNBwI7tPuTHzuWk0nLamKsv2aPj8l1Hba7TrJse0VRjgjmTjH6yWGYaaYnhUeLNq00XHCfAB4a" \
    "Stripe API secret key for production"

# Stripe Webhook Secret
create_parameter \
    "/flora/production/stripe_webhook_secret" \
    "whsec_GSX6wXjNoh7L0Ey8tb6mFPUWRova3hLC" \
    "Stripe webhook signing secret for production"

# Gemini API Key
create_parameter \
    "/flora/production/gemini_api_key" \
    "AIzaSyAk9pf_hJKrbbdCiQB7FyjgW15rsAOqYr8" \
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
