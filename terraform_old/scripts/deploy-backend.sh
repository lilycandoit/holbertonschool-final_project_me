#!/bin/bash
# Flora Backend Deployment Script for AWS Elastic Beanstalk
# Uses the same Dockerfile as local development

set -e

echo "🚀 Flora Backend Deployment to AWS"
echo "===================================="

# Navigate to terraform directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Get infrastructure outputs
echo "📋 Getting infrastructure details from Terraform..."
EB_ENV=$(terraform output -raw backend_environment_name 2>/dev/null)
BACKEND_URL=$(terraform output -raw backend_api_url 2>/dev/null)

if [ -z "$EB_ENV" ]; then
  echo "❌ Error: Terraform outputs not found. Run 'terraform apply' first."
  exit 1
fi

echo "✅ Environment: $EB_ENV"
echo "✅ API URL: $BACKEND_URL"
echo ""

# Navigate to backend directory
cd ../apps/backend

# Check if EB is initialized
if [ ! -d ".elasticbeanstalk" ]; then
  echo "🔧 Initializing Elastic Beanstalk CLI..."
  eb init -p docker -r ap-southeast-2 flora-backend --interactive=false
  eb use "$EB_ENV"
  echo "✅ EB initialized"
fi

# Create or verify Dockerrun.aws.json
echo "📝 Creating Dockerrun.aws.json..."
cat > Dockerrun.aws.json <<'EOF'
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": ".",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 3001,
      "HostPort": 80
    }
  ],
  "Logging": "/var/log/flora-backend"
}
EOF

echo "✅ Dockerrun.aws.json created"
echo ""
echo "🐳 Deploying to Elastic Beanstalk..."
echo "   (This uses apps/backend/Dockerfile - same as local development)"
echo ""

# Deploy
eb deploy

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Backend deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔧 Backend API: $BACKEND_URL"
echo ""
echo "📊 View logs: eb logs"
echo "🔍 Check health: eb health"
echo "💻 SSH to instance: eb ssh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
